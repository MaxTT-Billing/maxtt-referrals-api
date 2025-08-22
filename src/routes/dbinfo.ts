import { Router, Request, Response } from 'express';
import { CONFIG } from '../config.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    const u = new URL(CONFIG.dbUrl);
    res.json({
      host: u.hostname,
      db: u.pathname.replace('/', ''),
      hasSslmode: u.searchParams.has('sslmode'),
      sslmode: u.searchParams.get('sslmode') || null
    });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

export default router;
