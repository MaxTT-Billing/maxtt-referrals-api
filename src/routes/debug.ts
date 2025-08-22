import { Router, Request, Response } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/db', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('select now() as now');
    res.json({ ok: true, now: rows[0].now });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
