import pg from 'pg';
import { CONFIG } from './config.js';

export const pool = new pg.Pool({
  connectionString: CONFIG.dbUrl,
  max: 10,
  // Render Postgres requires TLS; node-postgres expects `ssl`, not `sslmode`.
  ssl: { rejectUnauthorized: false }
});
