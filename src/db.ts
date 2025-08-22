import pg from 'pg';
import { CONFIG } from './config.js';

// Decide SSL based on DATABASE_URL
function wantsSSL(dbUrl: string): boolean {
  try {
    const u = new URL(dbUrl);
    const host = u.hostname || '';
    const sslmode = u.searchParams.get('sslmode');

    // If explicitly required, respect it.
    if (sslmode === 'require') return true;

    // Render internal URLs typically include ".internal" and do NOT need TLS.
    if (host.includes('.internal')) return false;

    // External Render Postgres hosts end with "render.com" and DO need TLS.
    if (host.endsWith('render.com')) return true;

    // Fallback: be conservative (no SSL) unless told otherwise.
    return false;
  } catch {
    // If parsing fails, default to enabling SSL (safer for managed hosts).
    return true;
  }
}

export const pool = new pg.Pool({
  connectionString: CONFIG.dbUrl,
  max: 10,
  ssl: wantsSSL(CONFIG.dbUrl) ? { rejectUnauthorized: false } : undefined
});
