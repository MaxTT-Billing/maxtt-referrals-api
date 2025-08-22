import pg from 'pg';
import { CONFIG } from './config.js';

function wantsSSL(dbUrl: string): boolean {
  try {
    const u = new URL(dbUrl);
    const sslmode = u.searchParams.get('sslmode');
    if (sslmode === 'require') return true;
    // Be conservative: managed hosts almost always need TLS
    return true;
  } catch {
    return true;
  }
}

export const pool = new pg.Pool({
  connectionString: CONFIG.dbUrl,
  max: 10,
  ssl: wantsSSL(CONFIG.dbUrl) ? { rejectUnauthorized: false } : undefined,
  keepAlive: true,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000
});
