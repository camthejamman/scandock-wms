import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { one, pool, withTx } from './pool.js';
import {
  SEED_BINS,
  SEED_COUNTS,
  SEED_ITEMS,
  SEED_POS,
  SEED_SOS,
  SEED_STOCK,
  SEED_USERS,
  SEED_WAREHOUSE,
  seedBarcode,
} from './seed-data.js';
import { applyMovement } from '../services/inventory.js';
import { makeTrackingNumber } from '../lib/shipping.js';
import { enqueueOutbox } from '../services/erp.js';

const ALL_TABLES = [
  'erp_sync_log',
  'erp_outbox',
  'settings',
  'transactions',
  'cycle_count_lines',
  'cycle_counts',
  'transfers',
  'picks',
  'so_lines',
  'sales_orders',
  'receipt_lines',
  'receipts',
  'po_lines',
  'purchase_orders',
  'inventory',
  'bins',
  'items',
  'warehouses',
  'users',
];

export async function isSeeded(): Promise<boolean> {
  const row = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM items');
  return (row?.n ?? 0) > 0;
}

export async function seedIfEmpty(): Promise<boolean> {
  if (await isSeeded()) return false;
  await withTx(seed);
  return true;
}

/** Wipe everything and rebuild the demo data set. Used by POST /api/test/reset. */
export async function resetAndSeed(): Promise<void> {
  await withTx(async (client) => {
    await client.query(`TRUNCATE ${ALL_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    await client.query(`ALTER SEQUENCE po_number_seq RESTART WITH 1101`);
    await client.query(`ALTER SEQUENCE so_number_seq RESTART WITH 5101`);
    await seed(client);
  });
}

async function seed(client: PoolClient): Promise<void> {
  const users = new Map<string, number>();
  for (const u of SEED_USERS) {
    const hash = await bcrypt.hash(u.pin, 8);
    const row = await one<{ id: number }>(
      client,
      `INSERT INTO users (username, display_name, role, pin_hash, active) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [u.username, u.displayName, u.role, hash, u.active ?? true],
    );
    users.set(u.username, row!.id);
  }
  const admin = users.get('admin')!;

  const wh = await one<{ id: number }>(
    client,
    'INSERT INTO warehouses (code, name) VALUES ($1, $2) RETURNING id',
    [SEED_WAREHOUSE.code, SEED_WAREHOUSE.name],
  );

  const bins = new Map<string, number>();
  for (const b of SEED_BINS) {
    const row = await one<{ id: number }>(
      client,
      'INSERT INTO bins (warehouse_id, code, zone) VALUES ($1, $2, $3) RETURNING id',
      [wh!.id, b.code, b.zone],
    );
    bins.set(b.code, row!.id);
  }

  const items = new Map<string, number>();
  for (const it of SEED_ITEMS) {
    const row = await one<{ id: number }>(
      client,
      `INSERT INTO items (sku, barcode, name, description, category, unit_cost, weight_lb, lot_tracked, reorder_point, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        it.sku,
        seedBarcode(it.sku),
        it.name,
        it.description ?? '',
        it.category,
        it.unitCost,
        it.weightLb,
        it.lotTracked ?? false,
        it.reorderPoint,
        it.active ?? true,
      ],
    );
    items.set(it.sku, row!.id);
  }

  const bin = (code: string) => {
    const id = bins.get(code);
    if (!id) throw new Error(`seed: unknown bin ${code}`);
    return id;
  };
  const item = (sku: string) => {
    const id = items.get(sku);
    if (!id) throw new Error(`seed: unknown item ${sku}`);
    return id;
  };

  // Opening balances go through the same movement code as every other change,
  // so on-hand always equals the sum of the ledger.
  for (const s of SEED_STOCK) {
    await applyMovement(client, {
      itemId: item(s.sku),
      binId: bin(s.bin),
      lot: s.lot ?? '',
      delta: s.qty,
      type: 'ADJUSTMENT',
      reference: 'OPENING-BALANCE',
      userId: admin,
    });
  }
  await client.query(
    `UPDATE transactions SET created_at = now() - interval '45 days' WHERE reference = 'OPENING-BALANCE'`,
  );

  for (const po of SEED_POS) {
    const header = await one<{ id: number }>(
      client,
      `INSERT INTO purchase_orders (po_number, vendor, status, expected_date, erp_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [po.poNumber, po.vendor, po.status, po.expectedDate, `ERP-${po.poNumber}`],
    );
    let receiptId: number | undefined;
    const receiptLines: Array<{ sku: string; qty: number; bin: string; lot: string }> = [];
    let lineNo = 0;
    for (const line of po.lines) {
      lineNo++;
      const pl = await one<{ id: number }>(
        client,
        `INSERT INTO po_lines (po_id, line_no, item_id, qty_ordered, qty_received) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [header!.id, lineNo, item(line.sku), line.qty, line.received ?? 0],
      );
      if (line.received && line.bin) {
        if (!receiptId) {
          const r = await one<{ id: number }>(
            client,
            `INSERT INTO receipts (po_id, received_by, received_at) VALUES ($1, $2, now() - interval '3 days') RETURNING id`,
            [header!.id, users.get('receiver1')],
          );
          receiptId = r!.id;
        }
        await client.query(
          `INSERT INTO receipt_lines (receipt_id, po_line_id, item_id, bin_id, lot, qty) VALUES ($1, $2, $3, $4, $5, $6)`,
          [receiptId, pl!.id, item(line.sku), bin(line.bin), line.lot ?? '', line.received],
        );
        await applyMovement(client, {
          itemId: item(line.sku),
          binId: bin(line.bin),
          lot: line.lot ?? '',
          delta: line.received,
          type: 'RECEIPT',
          reference: po.poNumber,
          userId: users.get('receiver1') ?? null,
        });
        receiptLines.push({
          sku: line.sku,
          qty: line.received,
          bin: line.bin,
          lot: line.lot ?? '',
        });
      }
    }
    if (receiptId) {
      await client.query(
        `UPDATE transactions SET created_at = now() - interval '3 days' WHERE reference = $1`,
        [po.poNumber],
      );
      const id = await enqueueOutbox(client, 'item-receipt', `${po.poNumber}/RCPT-${receiptId}`, {
        poNumber: po.poNumber,
        receiptId,
        lines: receiptLines,
      });
      await client.query(
        `UPDATE erp_outbox SET status = 'SENT', attempts = 1, erp_ref = $2, sent_at = now() - interval '3 days' WHERE id = $1`,
        [id, `IR-SEED-${receiptId}`],
      );
    }
  }

  for (const so of SEED_SOS) {
    const picker = users.get('picker1') ?? null;
    const header = await one<{ id: number }>(
      client,
      `INSERT INTO sales_orders (so_number, customer, ship_to_country, priority, status, erp_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        so.soNumber,
        so.customer,
        so.country ?? 'US',
        so.priority ?? 'STANDARD',
        so.status,
        `ERP-${so.soNumber}`,
      ],
    );
    let lineNo = 0;
    const fulfilled: Array<{ sku: string; qty: number }> = [];
    for (const line of so.lines) {
      lineNo++;
      const sl = await one<{ id: number }>(
        client,
        `INSERT INTO so_lines (so_id, line_no, item_id, qty_ordered, qty_picked) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [header!.id, lineNo, item(line.sku), line.qty, line.picked ?? 0],
      );
      if (line.picked && line.bin) {
        await client.query(
          `INSERT INTO picks (so_line_id, item_id, bin_id, lot, qty, picked_by, picked_at)
           VALUES ($1, $2, $3, $4, $5, $6, now() - interval '1 day')`,
          [sl!.id, item(line.sku), bin(line.bin), line.lot ?? '', line.picked, picker],
        );
        await applyMovement(client, {
          itemId: item(line.sku),
          binId: bin(line.bin),
          lot: line.lot ?? '',
          delta: -line.picked,
          type: 'PICK',
          reference: so.soNumber,
          userId: picker,
        });
        fulfilled.push({ sku: line.sku, qty: line.picked });
      }
    }
    if (so.status === 'PICKED' || so.status === 'SHIPPED') {
      await client.query(
        `UPDATE sales_orders SET picked_by = $2, picked_at = now() - interval '1 day' WHERE id = $1`,
        [header!.id, picker],
      );
    }
    if (so.status === 'SHIPPED') {
      const tracking = makeTrackingNumber(so.carrier ?? 'UPS', so.soNumber);
      await client.query(
        `UPDATE sales_orders SET carrier = $2, service = $3, tracking_number = $4, weight_lb = $5,
           shipped_by = $6, shipped_at = now() - interval '1 day' WHERE id = $1`,
        [
          header!.id,
          so.carrier ?? 'UPS',
          so.service ?? 'Ground',
          tracking,
          so.weightLb ?? null,
          picker,
        ],
      );
      const id = await enqueueOutbox(client, 'item-fulfillment', so.soNumber, {
        soNumber: so.soNumber,
        carrier: so.carrier ?? 'UPS',
        service: so.service ?? 'Ground',
        trackingNumber: tracking,
        lines: fulfilled,
      });
      await client.query(
        `UPDATE erp_outbox SET status = 'SENT', attempts = 1, erp_ref = $2, sent_at = now() - interval '1 day' WHERE id = $1`,
        [id, `IF-SEED-${header!.id}`],
      );
    }
  }
  await client.query(
    `UPDATE transactions SET created_at = now() - interval '1 day' WHERE type = 'PICK'`,
  );

  for (const cc of SEED_COUNTS) {
    const created = `now() - interval '${cc.daysAgo} days'`;
    const header = await one<{ id: number }>(
      client,
      `INSERT INTO cycle_counts (bin_id, status, assigned_to, created_by, created_at, submitted_by, submitted_at, reviewed_by, reviewed_at, notes)
       VALUES ($1, $2, $3, $4, ${created}, $5, ${cc.status === 'OPEN' ? 'NULL' : created}, $6,
               ${cc.status === 'APPROVED' || cc.status === 'REJECTED' ? created : 'NULL'}, $7) RETURNING id`,
      [
        bin(cc.bin),
        cc.status,
        cc.assignedTo ? users.get(cc.assignedTo) : null,
        users.get('super'),
        cc.submittedBy ? users.get(cc.submittedBy) : null,
        cc.status === 'APPROVED' || cc.status === 'REJECTED' ? users.get('super') : null,
        cc.notes ?? '',
      ],
    );
    const stock = await client.query<{
      item_id: number;
      sku: string;
      lot: string;
      qty_on_hand: number;
    }>(
      `SELECT inv.item_id, i.sku, inv.lot, inv.qty_on_hand FROM inventory inv JOIN items i ON i.id = inv.item_id
       WHERE inv.bin_id = $1 AND inv.qty_on_hand <> 0 ORDER BY i.sku, inv.lot`,
      [bin(cc.bin)],
    );
    for (const s of stock.rows) {
      const counted = cc.status === 'OPEN' ? null : (cc.counted?.[s.sku] ?? s.qty_on_hand);
      await client.query(
        `INSERT INTO cycle_count_lines (count_id, item_id, lot, expected_qty, counted_qty) VALUES ($1, $2, $3, $4, $5)`,
        [header!.id, s.item_id, s.lot, s.qty_on_hand, counted],
      );
      if (cc.status === 'APPROVED' && counted !== null && counted !== s.qty_on_hand) {
        await applyMovement(client, {
          itemId: s.item_id,
          binId: bin(cc.bin),
          lot: s.lot,
          delta: counted - s.qty_on_hand,
          type: 'ADJUSTMENT',
          reference: `CC-${header!.id}`,
          userId: users.get('super') ?? null,
        });
        await client.query(`UPDATE transactions SET created_at = ${created} WHERE reference = $1`, [
          `CC-${header!.id}`,
        ]);
      }
    }
  }

  await client.query(
    `INSERT INTO erp_sync_log (direction, entity, status, message, created_at) VALUES
     ('PULL', 'orders', 'OK', 'Imported 6 purchase orders and 9 sales orders', now() - interval '2 days'),
     ('PUSH', 'item-receipt', 'OK', 'PO-1004/RCPT-2 -> IR-SEED-2', now() - interval '3 days'),
     ('PUSH', 'item-fulfillment', 'OK', 'SO-5006 -> IF-SEED-6', now() - interval '1 day')`,
  );
  await client.query(
    `INSERT INTO settings (key, value) VALUES ('lastSyncAt', to_jsonb(now() - interval '2 days'))
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );
}
