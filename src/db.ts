import pg from 'pg';
import { CONFIG } from './config.js';

// Force TLS if sslmode isn't explicitly present in the URL.
// Render Postgres requires TLS; node-postgres needs ssl options.
const needsSslFlag = !/\bsslmode=/.test(CONFIG.dbUrl);

export const pool = new pg.Pool({
  connectionString: CONFIG.dbUrl,
  max: 10,
  ssl: needsSslFlag ? { rejectUnauthorized: false } : undefined
});
