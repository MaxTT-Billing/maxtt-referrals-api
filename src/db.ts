import pg from 'pg';
import { CONFIG } from './config.js';

// Decide SSL based on DATABASE_URL
function wantsSSL(dbUrl: string): boolean {
  try {
    const u = new URL(dbUrl);
    const host = u.hostname || '';
    const sslmode = u.searchParams.get('sslmode');
    if (sslmode === 'require') return true;
    if (host.includes('.internal')) return false;
    if (host.endsWith('render.com')) return true;
    return false;
  } catch {
    return true;
  }
}

export const pool = new pg.Pool({
  connectionString: CONFIG.dbUrl,
  max: 10,
  ssl: wantsSSL(CONFIG.dbUrl) ? { rejectUnauthorized: false } : undefined
});
