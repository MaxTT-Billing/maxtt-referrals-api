import { Router } from 'express';
import { pool } from '../db.js';
import { computeReward } from '../lib/reward.js';
import { z } from 'zod';
import { requireRole } from '../auth.js';

const router = Router();

const postSchema = z.object({
  referrer_customer_code: z.string().min(3).max(32),
  referred_invoice_code: z.string().min(3).max(64),
  franchisee_code: z.string().min(3).max(32),
  invoice_amount_inr: z.number().positive(),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

router.post(
  '/',
  (req, res, next) => requireRole(req, res, next, ['writer', 'admin', 'sa']),
  async (req, res) => {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const {
      referrer_customer_code,
      referred_invoice_code,
      franchisee_code,
      invoice_amount_inr,
      invoice_date
    } = parsed.data;

    try {
      const reward = computeReward(invoice_amount_inr);
      const q = `insert into referrals
        (referrer_customer_code, referred_invoice_code, franchisee_code, invoice_amount_inr, referral_reward_inr, invoice_date)
        values ($1,$2,$3,$4,$5,$6)
        on conflict (referred_invoice_code) do nothing
        returning *`;
      const { rows } = await pool.query(q, [
        referrer_customer_code,
        referred_invoice_code,
        franchisee_code,
        invoice_amount_inr,
        reward,
        invoice_date
      ]);
      if (!rows.length) return res.status(409).json({ error: 'duplicate invoice referral' });
      return res.json(rows[0]);
    } catch {
      return res.status(500).json({ error: 'db error' });
    }
  }
);

router.get(
  '/',
  (req, res, next) => requireRole(req, res, next, ['admin', 'sa']),
  async (req, res) => {
    const month = String(req.query.month ?? '').trim(); // YYYY-MM
    try {
      if (month) {
        const { rows } = await pool.query(
          `select * from referrals where to_char(invoice_date,'YYYY-MM') = $1 order by created_at desc`,
          [month]
        );
        return res.json(rows);
      } else {
        const { rows } = await pool.query(
          `select * from referrals order by created_at desc limit 500`
        );
        return res.json(rows);
      }
    } catch {
      return res.status(500).json({ error: 'db error' });
    }
  }
);

router.get(
  '/summary/:franchiseeOrCustomer',
  (req, res, next) => requireRole(req, res, next, ['admin', 'sa']),
  async (req, res) => {
    const id = req.params.franchiseeOrCustomer;
    const month = String(req.query.month ?? '').trim();
    const where = id.startsWith('MAXTT-') ? 'franchisee_code = $1' : 'referrer_customer_code = $1';
    const args: any[] = [id];
    let sql = `select count(*) as cnt, coalesce(sum(referral_reward_inr),0) as total_reward
               from referrals where ${where}`;
    if (month) {
      sql += ` and to_char(invoice_date,'YYYY-MM') = $2`;
      args.push(month);
    }
    try {
      const { rows } = await pool.query(sql, args);
      return res.json(rows[0]);
    } catch {
      return res.status(500).json({ error: 'db error' });
    }
  }
);

export default router;
