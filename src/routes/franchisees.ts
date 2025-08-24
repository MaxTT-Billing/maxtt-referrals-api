import { Router } from 'express';
import { pool } from '../db.js';              // keep .js extension
import { requireRole as requireRoleRaw } from '../auth.js'; // keep .js extension

// Adapter: turn requireRole(role, req, res, next) into Express middleware fn
const requireRole =
  (role: 'writer' | 'admin' | 'sa') =>
  (req: any, res: any, next: any) =>
    (requireRoleRaw as any)(role, req, res, next);

const router = Router();

/**
 * SA-only: one-time initializer
 * - creates franchisees table if missing
 * - seeds from existing referrals
 * - adds FK (NOT VALID → VALIDATE)
 */
router.post('/admin/franchisees/init', requireRole('sa'), async (_req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.franchisees (
        code           TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        contact_phone  TEXT,
        contact_email  TEXT,
        active         BOOLEAN DEFAULT TRUE,
        created_at     TIMESTAMPTZ DEFAULT now()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_franchisees_active
      ON public.franchisees(active);
    `);

    // Seed any missing franchisees from referrals
    await client.query(`
      INSERT INTO public.franchisees (code, name)
      SELECT DISTINCT r.franchisee_code, r.franchisee_code
      FROM public.referrals r
      LEFT JOIN public.franchisees f ON f.code = r.franchisee_code
      WHERE r.franchisee_code IS NOT NULL AND f.code IS NULL;
    `);

    // Add FK if it doesn't exist yet (safe)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_name = 'referrals'
            AND constraint_type = 'FOREIGN KEY'
            AND constraint_name = 'referrals_franchisee_code_fkey'
        ) THEN
          ALTER TABLE public.referrals
            ADD CONSTRAINT referrals_franchisee_code_fkey
            FOREIGN KEY (franchisee_code)
            REFERENCES public.franchisees(code)
            ON UPDATE CASCADE
            ON DELETE RESTRICT
            NOT VALID;
          ALTER TABLE public.referrals VALIDATE CONSTRAINT referrals_franchisee_code_fkey;
        END IF;
      END
      $$;
    `);

    await client.query('COMMIT');
    res.json({ ok: true, note: 'franchisees table ensured, seeded, FK validated' });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, where: 'init', message: e?.message || String(e) });
  } finally {
    client.release();
  }
});

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
    args.push(`%${q.replace(/%/g, '')}%`);
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
