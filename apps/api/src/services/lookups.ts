import type { Queryable } from '../db/pool.js';
import { one, q } from '../db/pool.js';
import { DEFAULT_SETTINGS, type Settings } from '../db/seed-data.js';
import { notFound } from '../lib/errors.js';

export interface ItemRow {
  id: number;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category: string;
  uom: string;
  unitCost: number;
  weightLb: number;
  lotTracked: boolean;
  reorderPoint: number;
  active: boolean;
  createdAt: string;
}

/** Column list for `FROM items i`. */
export const ITEM_COLS = `i.id, i.sku, i.barcode, i.name, i.description, i.category, i.uom,
  i.unit_cost AS "unitCost", i.weight_lb AS "weightLb", i.lot_tracked AS "lotTracked",
  i.reorder_point AS "reorderPoint", i.active, i.created_at AS "createdAt"`;

/** Find an item by SKU (case-insensitive) or by barcode: both get scanned in the warehouse. */
export async function findItem(db: Queryable, key: string): Promise<ItemRow | undefined> {
  const k = key.trim();
  if (!k) return undefined;
  return one<ItemRow>(
    db,
    `SELECT ${ITEM_COLS} FROM items i WHERE upper(i.sku) = upper($1) OR i.barcode = $1`,
    [k],
  );
}

export async function getItem(db: Queryable, key: string): Promise<ItemRow> {
  const item = await findItem(db, key);
  if (!item) throw notFound('ITEM_NOT_FOUND', `No item with SKU or barcode "${key.trim()}"`);
  return item;
}

export interface BinRow {
  id: number;
  code: string;
  zone: string;
  active: boolean;
  warehouse: string;
}

/** Column list for `FROM bins b JOIN warehouses w ON w.id = b.warehouse_id`. */
export const BIN_COLS = `b.id, b.code, b.zone, b.active, w.code AS warehouse`;

export async function findBin(db: Queryable, code: string): Promise<BinRow | undefined> {
  const c = code.trim();
  if (!c) return undefined;
  return one<BinRow>(
    db,
    `SELECT ${BIN_COLS} FROM bins b JOIN warehouses w ON w.id = b.warehouse_id WHERE upper(b.code) = upper($1)`,
    [c],
  );
}

export async function getBin(db: Queryable, code: string): Promise<BinRow> {
  const bin = await findBin(db, code);
  if (!bin) throw notFound('BIN_NOT_FOUND', `No bin "${code.trim()}"`);
  return bin;
}

export async function getSettings(db: Queryable): Promise<Settings> {
  const rows = await q<{ key: string; value: unknown }>(db, 'SELECT key, value FROM settings');
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  return merged as Settings;
}

export async function saveSettings(db: Queryable, patch: Partial<Settings>): Promise<Settings> {
  for (const [key, value] of Object.entries(patch)) {
    await db.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)],
    );
  }
  return getSettings(db);
}
