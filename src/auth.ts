import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { CONFIG } from './config.js';
import type { Request, Response, NextFunction } from 'express';

// Create api_keys if needed, then upsert hashes.
// Any error is logged but not thrown so the server keeps running.
export async function ensureKeyHashes(): Promise<void> {
  try {
    await pool.query(`
      create table if not exists api_keys (
        id bigserial primary key,
        name text not null unique,
        key_hash text not null,
        role text not null check (role in ('writer','admin','sa')),
        created_at timestamptz not null default now()
      )
    `);

    const roles = [
      { name: 'billing-writer', key: CONFIG.rawKeys.writer, role: 'writer' },
      { name: 'admin-ui',       key: CONFIG.rawKeys.admin,  role: 'admin'  },
      { name: 'sa',             key: CONFIG.rawKeys.sa,     role: 'sa'     }
    ];

    for (const r of roles) {
      const hash = await bcrypt.hash(r.key, 10);
      await pool.query(
        `insert into api_keys (name, key_hash, role)
         values ($1,$2,$3)
         on conflict (name) do update
           set key_hash = excluded.key_hash, role = excluded.role`,
        [r.name, hash, r.role]
      );
    }
    console.log('API keys ensured');
  } catch (err) {
    console.error('ensureKeyHashes skipped:', err);
  }
}

export async function requireRole(
  req: Request,
  res: Response,
  next: NextFunction,
  roles: string[]
) {
  try {
    const k = req.header('X-REF-API-KEY');
    if (!k) return res.status(401).json({ error: 'missing api key' });

    const { rows } = await pool.query('select key_hash, role from api_keys');
    for (const r of rows) {
      if (await bcrypt.compare(k, r.key_hash)) {
        if (!roles.includes(r.role)) return res.status(403).json({ error: 'forbidden' });
        (req as any).role = r.role;
        return next();
      }
    }
    return res.status(401).json({ error: 'invalid api key' });
  } catch {
    return res.status(500).json({ error: 'auth error' });
  }
}
