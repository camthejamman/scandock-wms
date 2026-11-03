import pg from 'pg';
import { config } from '../config.js';

// Postgres returns NUMERIC and BIGINT as strings; the API wants numbers.
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export type Queryable = pg.Pool | pg.PoolClient;

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

/** Run a query and return the rows. */
export async function q<T = Record<string, unknown>>(
  db: Queryable,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await db.query(text, params);
  return res.rows as T[];
}

/** Run a query and return the first row (or undefined). */
export async function one<T = Record<string, unknown>>(
  db: Queryable,
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await q<T>(db, text, params);
  return rows[0];
}

/** Run `fn` inside a transaction; commits on success, rolls back on any throw. */
export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
