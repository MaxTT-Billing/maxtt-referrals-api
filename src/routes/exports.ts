import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

router.post(
  '/request',
  (req: Request, res: Response, next: NextFunction) =>
    requireRole(req, res, next, ['admin']),
  async (req: Request, res: Response) => {
    const { month, requested_by } = req.body || {};
    if (!month || !requested_by) return res.status(400).json({ error: 'month and requested_by required' });
    const { rows } = await pool.query(
      `insert into export_requests (requested_by, month) values ($1,$2) returning *`,
      [requested_by, month]
    );
    return res.json(rows[0]);
  }
);

router.post(
  '/decide',
  (req: Request, res: Response, next: NextFunction) =>
    requireRole(req, res, next, ['sa']),
  async (req: Request, res: Response) => {
    const { id, approve } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const status = approve ? 'approved' : 'rejected';
    const { rows } = await pool.query(
      `update export_requests set status=$1, decided_at=now() where id=$2 returning *`,
      [status, id]
    );
    return res.json(rows[0]);
  }
);

router.get(
  '/download',
  (req: Request, res: Response, next: NextFunction) =>
    requireRole(req, res, next, ['admin', 'sa']),
  async (req: Request, res: Response) => {
    const month = String(req.query.month ?? '');
    const { rows } = await pool.query(
      `select status from export_requests where month=$1 order by id desc limit 1`,
      [month]
    );
    if (!rows.length || rows[0].status !== 'approved') {
      return res.status(403).json({ error: 'export not approved' });
    }
    const data = await pool.query(
      `select * from referrals where to_char(invoice_date,'YYYY-MM') = $1 order by id`,
      [month]
    );
    const csv = ['id,referrer_customer_code,referred_invoice_code,franchisee_code,invoice_amount_inr,referral_reward_inr,invoice_date,created_at']
      .concat(
        data.rows.map((r: any) =>
          `${r.id},${r.referrer_customer_code},${r.referred_invoice_code},${r.franchisee_code},${r.invoice_amount_inr},${r.referral_reward_inr},${r.invoice_date},${new Date(r.created_at).toISOString()}`
        )
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=referrals_${month}.csv`);
    return res.send(csv);
  }
);

export default router;
