import { Router } from 'express';
import { pool } from '../db.js';
import { CONFIG } from '../config.js';

// ---- Minimal role guard (header-based) --------------------------------------
// Accepts X-REF-API-KEY and maps to role. SA >= Admin >= Writer.
function requireRole(role: 'writer' | 'admin' | 'sa') {
  return (req: any, res: any, next: any) => {
    try {
      const key =
        req.get('X-REF-API-KEY') ||
        req.get('x-ref-api-key') ||
        req.get('X-API-KEY') ||
        req.get('x-api-key');

      const sa = CONFIG.saKey;
      const admin = CONFIG.adminKey;
      const writer = CONFIG.writerKey;

      const isSA = !!sa && key === sa;
      const isAdmin = !!admin && key === admin;
      const isWriter = !!writer && key === writer;

      const ok =
        role === 'sa' ? isSA :
        role === 'admin' ? (isSA || isAdmin) :
        (isSA || isAdmin || isWriter);

      if (!ok) return res.status(403).json({ error: 'forbidden', where: 'header-auth' });
      next();
    } catch (e: any) {
      return res.status(403).json({ error: 'forbidden', where: 'header-auth-catch', message: e?.message || String(e) });
    }
  };
}

// ---- Small helpers ----------------------------------------------------------
async function one<T = any>(sql: string, params?: any[]) {
  const { rows } = await pool.query(sql, params);
  return rows[0] as T;
}
async function run(sql: string, params?: any[]) {
  await pool.query(sql, params);
}

const router = Router();

// Accept any verb so tools that send POST don't show "Cannot POST"
router.all('/franchisees/ping', (_req, res) => res.json({ ok: true, route: '/franchisees/* ready' }));

// Status: shows table/index/FK presence (SA)
router.get('/franchisees/status', requireRole('sa'), async (_req, res) => {
  try {
    const t   = await one<{t: string | null}>(`SELECT to_regclass('public.franchisees') AS t`);
    const idx = await one<{exists: boolean}>(`
      SELECT EXISTS(
        SELECT 1 FROM pg_indexes
        WHERE schemaname='public' AND indexname='idx_franchisees_active'
      ) AS exists
    `);
    const fk  = await one<{exists: boolean, validated: boolean | null}>(`
      SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='referrals_franchisee_code_fkey') AS exists,
             (SELECT convalidated FROM pg_constraint WHERE conname='referrals_franchisee_code_fkey') AS validated
    `);
    let cnt = 0;
    if (t?.t) {
      const c = await one<{n: number}>(`SELECT COUNT(*)::int AS n FROM public.franchisees`);
      cnt = c?.n ?? 0;
    }
    res.json({
      ok: true,
      table: !!t?.t,
      index: !!idx?.exists,
      fk_present: !!fk?.exists,
      fk_validated: fk?.validated ?? false,
      franchisee_count: cnt
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, where: 'status', message: e?.message || String(e) });
  }
});

// ---- Stepwise initializers (tiny & idempotent) ------------------------------

// 1) Create table
router.post('/franchisees/init/table', requireRole('sa'), async (_req, res) => {
  try {
    await run(`
      CREATE TABLE IF NOT EXISTS public.franchisees (
        code           TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        contact_phone  TEXT,
        contact_email  TEXT,
        active         BOOLEAN DEFAULT TRUE,
        created_at     TIMESTAMPTZ DEFAULT now()
      );
    `);
    res.json({ ok: true, created_or_exists: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, where: 'init/table', message: e?.message || String(e) });
  }
});

// 2) Create index
router.post('/franchisees/init/index', requireRole('sa'), async (_req, res) => {
  try {
    await run(`
      CREATE INDEX IF NOT EXISTS idx_franchisees_active
      ON public.franchisees(active);
    `);
    res.json({ ok: true, created_or_exists: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, where: 'init/index', message: e?.message || String(e) });
  }
});

// 3) Seed from referrals
router.post('/franchisees/init/seed', requireRole('sa'), async (_req, res) => {
  try {
    const before = await one<{n: number}>(`SELECT COUNT(*)::int AS n FROM public.franchisees`);
    await run(`
      INSERT INTO public.franchisees (code, name)
      SELECT DISTINCT r.franchisee_code, r.franchisee_code
      FROM public.referrals r
      LEFT JOIN public.franchisees f ON f.code = r.franchisee_code
      WHERE r.franchisee_code IS NOT NULL AND f.code IS NULL;
    `);
    const after = await one<{n: number}>(`SELECT COUNT(*)::int AS n FROM public.franchisees`);
    res.json({ ok: true, added: (after?.n ?? 0) - (before?.n ?? 0) });
  } catch (e: any) {
    res.status(500).json({ ok: false, where: 'init/seed', message: e?.message || String(e) });
  }
});

// 4) Add FK (NOT VALID)
router.post('/franchisees/init/fk/add', requireRole('sa'), async (_req, res) => {
  try {
    const fk = await one<{exists: boolean}>(`
      SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='referrals_franchisee_code_fkey') AS exists
    `);
    if (!fk?.exists) {
      await run(`
        ALTER TABLE public.referrals
          ADD CONSTRAINT referrals_franchisee_code_fkey
          FOREIGN KEY (franchisee_code)
          REFERENCES public.franchisees(code)
          ON UPDATE CASCADE
          ON DELETE RESTRICT
          NOT VALID;
      `);
      return res.json({ ok: true, fk_added: true, note: 'NOT VALID' });
    }
    res.json({ ok: true, fk_added: false, note: 'already present' });
  } catch (e: any) {
    res.status(500).json({ ok: false, where: 'init/fk/add', message: e?.message || String(e) });
  }
});

// 5) Try validating FK (ok if it can’t)
router.post('/franchisees/init/fk/validate', requireRole('sa'), async (_req, res) => {
  try {
    await run(`ALTER TABLE public.referrals VALIDATE CONSTRAINT referrals_franchisee_code_fkey;`);
    res.json({ ok: true, fk_validated: true });
  } catch (_e: any) {
    res.json({ ok: true, fk_validated: false, note: 'kept NOT VALID (can validate later)' });
  }
});

// ---- CRUD -------------------------------------------------------------------

/** SA-only: create or upsert a franchisee */
router.post('/franchisees', requireRole('sa'), async (req, res) => {
  const { code, name, contact_phone, contact_email, active } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'code and name are required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO public.franchisees (code, name, contact_phone, contact_email, active)
       VALUES ($1,$2,$3,$4,COALESCE($5, TRUE))
       ON CONFLICT (code) DO UPDATE
         SET name=EXCLUDED.name,
             contact_phone=EXCLUDED.contact_phone,
             contact_email=EXCLUDED.contact_email,
             active=EXCLUDED.active
       RETURNING code, name, contact_phone, contact_email, active, created_at`,
      [code, name, contact_phone ?? null, contact_email ?? null, active]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: 'create_failed', message: e?.message || String(e) });
  }
});

/** ADMIN/SA: list franchisees */
router.get('/franchisees', requireRole('admin'), async (req, res) => {
  const { active, q, limit } = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const args: any[] = [];
  let i = 1;

  if (active === 'true' || active === 'false') {
    where.push(`f.active = $${i++}`); args.push(active === 'true');
  }
  if (q && q.trim()) {
    where.push(`(f.code ILIKE $${i} OR f.name ILIKE $${i})`);
    args.push(`%${q?.replace(/%/g, '')}%`);
    i++;
  }

  const max = Math.min(Number(limit || 200), 500);
  const sql = `
    SELECT code, name, contact_phone, contact_email, active, created_at
    FROM public.franchisees f
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC
    LIMIT ${max}
  `;

  try {
    const { rows } = await pool.query(sql, args);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: 'list_failed', message: e?.message || String(e) });
  }
});

/** SA-only: update one franchisee */
router.patch('/franchisees/:code', requireRole('sa'), async (req, res) => {
  const code = req.params.code;
  const { name, contact_phone, contact_email, active } = req.body || {};

  const sets: string[] = [];
  const args: any[] = [];
  let i = 1;

  if (name !== undefined)          { sets.push(`name = $${i++}`); args.push(name); }
  if (contact_phone !== undefined) { sets.push(`contact_phone = $${i++}`); args.push(contact_phone); }
  if (contact_email !== undefined) { sets.push(`contact_email = $${i++}`); args.push(contact_email); }
  if (active !== undefined)        { sets.push(`active = $${i++}`); args.push(!!active); }

  if (!sets.length) return res.status(400).json({ error: 'no_fields' });

  try {
    const { rows } = await pool.query(
      `UPDATE public.franchisees SET ${sets.join(', ')} WHERE code = $${i}
       RETURNING code, name, contact_phone, contact_email, active, created_at`,
      [...args, code]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: 'update_failed', message: e?.message || String(e) });
  }
});

export default router;
