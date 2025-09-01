// src/db.ts — Postgres pool (ESM/TS, node16 moduleResolution)
import pkg from "pg";
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL || "";
if (!connectionString) {
  console.warn("[referrals-api] DATABASE_URL not set — DB features will fail.");
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined,
});

// helper
export async function query<T = any>(sql: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    const r = await client.query(sql, params);
    return r as unknown as { rows: T[] };
  } finally {
    client.release();
  }
}
