// src/routes/referralAdmin.ts
// Admin utilities for managing referrals (delete-by-code, delete-by-id, find)
// ESM + NodeNext-compatible (explicit .js extensions in imports)

import { Router } from 'express';
import { pool } from '../db.js';
import { CONFIG } from '../config.js';

const router = Router();

// --- Minimal header-based guard using CONFIG.rawKeys (Admin or SA) -----------
function requireRole(role: 'admin' | 'sa') {
  return (req: any, res: any, next: any) => {
    const key =
      req.get?.('X-REF-API-KEY') ||
      req.get?.('x-ref-api-key') ||
      req.get?.('X-API-KEY') ||
      req.get?.('x-api-key');

    const { admin, sa } = CONFIG.rawKeys || { admin: '', sa: '' };
    const isSA = !!sa && key === sa;
    const isAdmin = !!admin && key === admin;
    const ok = role === 'sa' ? isSA : (isSA || isAdmin);

    if (!ok) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

// --- Helpers -----------------------------------------------------------------
function parseMonthRange(ym?: string) {
  if (!ym) return null;
  const m = String(ym).trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [yStr, moStr] = m.split('-');
  const y = Number(yStr), mo = Number(moStr);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || mo < 1 || mo > 12) return null;
  const from = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0));
  const to   = new Date(Date.UTC(y, mo, 1, 0, 0, 0));
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

const MIN_DIGITS = 4; // zero-pad pure numeric invoice codes to this length
function normalizeCandidates(codeRaw: string) {
  const s = String(codeRaw || '').trim();
  const set = new Set<string>();
  if (!s) return Array.from(set);
  set.add(s);
  if (/^\d+$/.test(s)) {
    set.add(s.padStart(MIN_DIGITS, '0')); // e.g., "54" -> "0054"
  }
  return Array.from(set);
}

// --- Routes ------------------------------------------------------------------

/**
 * POST /admin/referrals/delete-by-code
 * Body: { code: "0054" | "54", month?: "YYYY-MM" }
 * Auth: ADMIN or SA
 * Notes:
 *  - If month is provided, restrict delete to that invoice_date month.
 *  - Matches the exact code OR its zero-padded variant when code is numeric.
 */
router.post('/referrals/delete-by-code', requireRole('admin'), async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ ok: false, error: 'missing_code' });

    const month = req.body?.month ? String(req.body.month).trim() : '';
    const range = parseMonthRange(month || undefined);

    const candidates = normalizeCandidates(code);
    if (!candidates.length) return res.status(400).json({ ok: false, error: 'bad_code' });

    const where: string[] = [`r.referred_invoice_code = ANY($1::text[])`];
    const params: any[] = [candidates];
    let i = 2;

    if (range) {
      where.push(`r.invoice_date >= $${i++} AND r.invoice_date < $${i++}`);
      params.push(range.fromIso, range.toIso);
    }

    const sql = `DELETE FROM public.referrals r WHERE ${where.join(' AND ')}`;
    const result = await pool.query(sql, params);

    res.json({
      ok: true,
      deleted: result.rowCount || 0,
      candidates,
      month_applied: !!range,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'delete_failed', message: e?.message || String(e) });
  }
});

/**
 * POST /admin/referrals/delete-by-id
 * Body: { id: "123" | 123, month?: "YYYY-MM" }
 * Auth: ADMIN or SA
 * Safer when you know the exact row id.
 */
router.post('/referrals/delete-by-id', requireRole('admin'), async (req, res) => {
  try {
    const idRaw = req.body?.id;
    if (idRaw === undefined || idRaw === null || String(idRaw).trim() === '') {
      return res.status(400).json({ ok: false, error: 'missing_id' });
    }
    const idStr = String(idRaw).trim();

    const month = req.body?.month ? String(req.body.month).trim() : '';
    const range = parseMonthRange(month || undefined);

    const where: string[] = [`(CAST(r.id AS text) = $1 OR r.id = CAST($1 AS bigint))`];
    const params: any[] = [idStr];
    let i = 2;

    if (range) {
      where.push(`r.invoice_date >= $${i++} AND r.invoice_date < $${i++}`);
      params.push(range.fromIso, range.toIso);
    }

    const sql = `DELETE FROM public.referrals r WHERE ${where.join(' AND ')}`;
    const result = await pool.query(sql, params);

    res.json({
      ok: true,
      deleted: result.rowCount || 0,
      month_applied: !!range,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'delete_failed', message: e?.message || String(e) });
  }
});

/**
 * GET /admin/referrals/find?code=...&limit=50
 * GET /admin/referrals/find?id=123
 * Auth: ADMIN or SA
 * Helps you confirm what will be deleted before running a delete.
 */
router.get('/referrals/find', requireRole('admin'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const code = req.query.code ? String(req.query.code).trim() : '';
    const id   = req.query.id   ? String(req.query.id).trim()   : '';

    if (!code && !id) return res.status(400).json({ ok: false, error: 'missing_query' });

    let sql = '';
    let params: any[] = [];

    if (id) {
      sql = `
        SELECT id, referrer_customer_code, referred_invoice_code, franchisee_code,
               invoice_amount_inr, referral_reward_inr, invoice_date, created_at
        FROM public.referrals r
        WHERE CAST(r.id AS text) = $1 OR r.id = CAST($1 AS bigint)
        ORDER BY r.created_at DESC
        LIMIT ${limit}
      `;
      params = [id];
    } else {
      const candidates = normalizeCandidates(code);
      sql = `
        SELECT id, referrer_customer_code, referred_invoice_code, franchisee_code,
               invoice_amount_inr, referral_reward_inr, invoice_date, created_at
        FROM public.referrals r
        WHERE r.referred_invoice_code = ANY($1::text[])
        ORDER BY r.created_at DESC
        LIMIT ${limit}
      `;
      params = [candidates];
    }

    const { rows } = await pool.query(sql, params);
    res.json({ ok: true, rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'find_failed', message: e?.message || String(e) });
  }
});

export default router;
