// src/db.ts — Postgres pool helper (TS/ESM, Node 20 / nodenext)
import pkg from "pg";
const { Pool } = pkg;

let _pool: InstanceType<typeof Pool> | null = null;

export function getPool() {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL || "";
  if (!connectionString) {
    console.warn("[referrals-api] DATABASE_URL not set — DB operations will fail.");
  }
  _pool = new Pool({
    connectionString,
    ssl: connectionString && /render\.com|neon\.tech|amazonaws\.com/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });
  return _pool;
}

/** Compatibility export for existing modules that import { pool } from "./db.js" */
export const pool = getPool();

export async function query<T = any>(sql: string, params: any[] = []) {
  const p = getPool();
  const r = await p.query(sql, params);
  return r as unknown as { rows: T[] };
}
