import pg from 'pg';
import { CONFIG } from './config.js';

export const pool = new pg.Pool({
  connectionString: CONFIG.dbUrl,
  max: 10,
add db.ts (Postgres pool)
});
