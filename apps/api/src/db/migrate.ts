import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './pool.js';

/** Applies schema.sql (idempotent CREATE IF NOT EXISTS statements). */
export async function migrate(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sql = await readFile(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
}
