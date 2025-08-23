import { Router, Request, Response } from 'express';
import pg from 'pg';
import { CONFIG } from '../config.js';

const router = Router();

router.get('/pg', async (_req: Request, res: Response) => {
  try {
    const url = new URL(CONFIG.dbUrl);
    const sslmode = url.searchParams.get('sslmode');
    const isInternal = url.hostname.includes('.internal');

    const client = new pg.Client({
      connectionString: CONFIG.dbUrl,
      ssl: sslmode === 'require' || !isInternal ? { rejectUnauthorized: false } : undefined
    });

    await client.connect();
    const r = await client.query('select version() as version, now() as now');
    await client.end();

    res.json({
      ok: true,
      host: url.hostname,
      db: url.pathname.replace('/', ''),
      internal: isInternal,
      sslmode: sslmode || null,
      version: r.rows[0].version,
      now: r.rows[0].now
    });
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      message: String(e?.message || e),
      code: e?.code || null,
      name: e?.name || null
    });
  }
});

export default router;
