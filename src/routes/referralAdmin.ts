import { Router } from 'express';
import { pool } from '../db.js';
import { CONFIG } from '../config.js';

// Minimal header-based guard using CONFIG.rawKeys
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

const router = Router();

/**
 * POST /admin/referrals/delete-by-code
 * Body: { code: "54", month?: "YYYY-MM" }
 * Auth: ADMIN or SA
 */
router.post('/referrals/delete-by-code', requireRole('admin'), async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim();
    const month = req.body?.month ? String(req.body.month).trim() : '';
    if (!code)
