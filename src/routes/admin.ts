import { Router, Request, Response, NextFunction } from 'express';
import { requireRole } from '../auth.js';
import { ensureKeyHashes } from '../auth.js';
import { ensureSchema } from '../schema.js';

const router = Router();

// POST /admin/migrate  (requires SA) — creates tables if missing
router.post(
  '/migrate',
  (req: Request, res: Response, next: NextFunction) => requireRole(req, res, next, ['sa']),
  async (_req: Request, res: Response) => {
    try {
      await ensureSchema();
      res.json({ ok: true, message: 'Schema ensured' });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }
);

// POST /admin/seed  (requires SA) — seeds/refreshes API key hashes
router.post(
  '/seed',
  (req: Request, res: Response, next: NextFunction) => requireRole(req, res, next, ['sa']),
  async (_req: Request, res: Response) => {
    try {
      await ensureKeyHashes();
      res.json({ ok: true, message: 'API keys ensured' });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }
);

export default router;
