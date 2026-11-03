import type { PoolClient } from 'pg';
import { conflict } from '../lib/errors.js';

export type TxType = 'RECEIPT' | 'PICK' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ADJUSTMENT' | 'SHIP';

export interface Movement {
  itemId: number;
  binId: number;
  lot: string;
  delta: number;
  type: TxType;
  reference: string;
  userId: number | null;
  allowNegative?: boolean;
}

/**
 * The single place inventory ever changes. Locks the (item, bin, lot) row, applies the delta,
 * writes a ledger row, and refuses to go negative unless the caller allows it.
 * Must run inside a transaction (pass the transaction's client).
 */
export async function applyMovement(
  client: PoolClient,
  m: Movement,
): Promise<{ qtyBefore: number; qtyAfter: number }> {
  await client.query(
    `INSERT INTO inventory (item_id, bin_id, lot, qty_on_hand) VALUES ($1, $2, $3, 0)
     ON CONFLICT (item_id, bin_id, lot) DO NOTHING`,
    [m.itemId, m.binId, m.lot],
  );
  const locked = await client.query<{ qty_on_hand: number }>(
    `SELECT qty_on_hand FROM inventory WHERE item_id = $1 AND bin_id = $2 AND lot = $3 FOR UPDATE`,
    [m.itemId, m.binId, m.lot],
  );
  const qtyBefore = locked.rows[0]?.qty_on_hand ?? 0;
  const qtyAfter = qtyBefore + m.delta;
  if (qtyAfter < 0 && !m.allowNegative) {
    throw conflict(
      'INSUFFICIENT_STOCK',
      `Only ${qtyBefore} on hand in this bin${m.lot ? ` (lot ${m.lot})` : ''}`,
      {
        available: qtyBefore,
        requested: -m.delta,
      },
    );
  }
  await client.query(
    `UPDATE inventory SET qty_on_hand = $4, updated_at = now()
     WHERE item_id = $1 AND bin_id = $2 AND lot = $3`,
    [m.itemId, m.binId, m.lot, qtyAfter],
  );
  await client.query(
    `INSERT INTO transactions (type, item_id, bin_id, lot, qty_delta, qty_after, reference, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [m.type, m.itemId, m.binId, m.lot, m.delta, qtyAfter, m.reference, m.userId],
  );
  return { qtyBefore, qtyAfter };
}
