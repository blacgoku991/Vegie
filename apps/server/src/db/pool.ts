import pg from "pg";
import { config } from "../config.ts";

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });

export type Queryable = Pick<pg.Pool, "query">;

export async function one<T extends pg.QueryResultRow>(sql: string, params: unknown[] = [], db: Queryable = pool): Promise<T | null> {
  const res = await db.query<T>(sql, params);
  return res.rows[0] ?? null;
}

export async function many<T extends pg.QueryResultRow>(sql: string, params: unknown[] = [], db: Queryable = pool): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
