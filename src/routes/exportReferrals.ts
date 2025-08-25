import { Router } from 'express';
import { pool } from '../db.js';
import { CONFIG } from '../config.js';

// Header-based role guard using CONFIG.rawKeys (SA >= Admin >= Writer)
function requireRole(role: 'writer' | 'admin' | 'sa') {
  return (req: any, res: any, next: any) => {
    const key =
      req.get?.('X-REF-API-KEY') ||
      req.get?.('x-ref-api-key') ||
      req.get?.('X-API-KEY') ||
      req.get?.('x-api-key');

    const { writer, admin, sa } = CONFIG.rawKeys || { writer: '', admin: '', sa: '' };

    const isSA = !!sa && key === sa;
    const isAdmin = !!admin && key === admin;
    const isWriter = !!writer && key === writer;

    const ok =
      role === 'sa' ? isSA :
      role === 'admin' ? (isSA || isAdmin) :
      (isSA || isAdmin || isWriter);

    if (!ok) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

const router = Router();

/**
 * GET /exports/referrals?month=YYYY-MM[&franchisee=CODE]
 * Auth: ADMIN or SA
 * Returns: CSV (with BOM) of referrals for the month, optional franchisee filter
 */
router.get('/exports/referrals', requireRole('admin'), async (req, res) => {
  try {
    const month = String(req.query.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ ok: false, error: 'bad_month', hint: 'use YYYY-MM' });
    }

    const [yearStr, monStr] = month.split('-');
    const year = Number(yearStr);
    const mon = Number(monStr);
    const from = new Date(Date.UTC(year, mon - 1, 1));
    const to   = new Date(Date.UTC(year, mon, 1));

    const params: any[] = [from.toISOString(), to.toISOString()];
    let where = `r.invoice_date >= $1 AND r.invoice_date < $2`;

    const fran = req.query.franchisee ? String(req.query.franchisee).trim() : '';
    if (fran) {
      params.push(fran);
      where += ` AND r.franchisee_code = $${params.length}`;
    }

    const sql = `
      SELECT
        r.id,
        r.referrer_customer_code,
        r.referred_invoice_code,
        r.franchisee_code,
        r.invoice_amount_inr::numeric(14,2) AS invoice_amount_inr,
        r.referral_reward_inr::numeric(14,2) AS referral_reward_inr,
        r.invoice_date::date AS invoice_date,
        r.created_at
      FROM public.referrals r
      WHERE ${where}
      ORDER BY r.invoice_date ASC, r.id::bigint ASC
    `;

    const { rows } = await pool.query(sql, params);

    // Build CSV
    const headers = [
      'referral_id',
      'referrer_customer_code',
      'referred_invoice_code',
      'franchisee_code',
      'invoice_amount_inr',
      'referral_reward_inr',
      'invoice_date',
      'created_at'
    ];

    const csvField = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      const mustQuote = /["\r\n,;]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return mustQuote ? `"${escaped}"` : escaped;
    };

    const lines: string[] = [];
    lines.push(headers.join(','));
    for (const r of rows) {
      lines.push([
        r.id,
        r.referrer_customer_code,
        r.referred_invoice_code,
        r.franchisee_code,
        r.invoice_amount_inr,
        r.referral_reward_inr,
        r.invoice_date?.toISOString?.().slice(0,10) ?? r.invoice_date,
        r.created_at?.toISOString?.() ?? r.created_at
      ].map(csvField).join(','));
    }

    const csv = '\uFEFF' + lines.join('\r\n') + '\r\n'; // BOM + CRLF

    const stamp = month.replace('-', '');
    const tail = fran ? `_${fran}` : '';
    const filename = `referrals_${stamp}${tail}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(csv);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'export_failed', message: e?.message || String(e) });
  }
});

export default router;
