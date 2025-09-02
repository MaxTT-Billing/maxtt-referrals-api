// src/store/credits.ts — DB-backed credits store (TS/ESM)
import { getPool, query } from "../db.js";

export type Credit = {
  id: number;
  invoiceId: string;
  customerCode: string;
  refCode: string;
  subtotal: string; // NUMERIC as string
  gst: string;      // NUMERIC as string
  litres: string;   // NUMERIC as string
  createdAt: string; // ISO
  ts: string;        // ISO
};

type ListFilter = {
  refCode?: string;
  customerCode?: string;
  from?: Date; // inclusive
  to?: Date;   // exclusive
};

export async function initCredits() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS public.referral_credits (
      id              SERIAL PRIMARY KEY,
      invoice_id      TEXT NOT NULL,
      customer_code   TEXT NOT NULL,
      ref_code        TEXT NOT NULL,
      subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
      gst             NUMERIC(12,2) NOT NULL DEFAULT 0,
      litres          NUMERIC(12,3) NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL,
      ts              TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_refcred_cust ON public.referral_credits (customer_code);
    CREATE INDEX IF NOT EXISTS ix_refcred_ref  ON public.referral_credits (ref_code);
    CREATE INDEX IF NOT EXISTS ix_refcred_ts   ON public.referral_credits (ts DESC);
  `);
}

export async function addCredit(rec: {
  invoiceId: string | number;
  customerCode: string;
  refCode: string;
  subtotal: number;
  gst: number;
  litres: number;
  createdAt: string | Date;
}): Promise<Credit> {
  const p = getPool();
  await initCredits();
  const createdIso =
    rec.createdAt instanceof Date
      ? rec.createdAt.toISOString()
      : new Date(rec.createdAt || new Date()).toISOString();

  const sql = `
    INSERT INTO public.referral_credits
      (invoice_id, customer_code, ref_code, subtotal, gst, litres, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING
      id,
      invoice_id     AS "invoiceId",
      customer_code  AS "customerCode",
      ref_code       AS "refCode",
      subtotal::text AS "subtotal",
      gst::text      AS "gst",
      litres::text   AS "litres",
      created_at     AS "createdAt",
      ts
  `;
  const args = [
    String(rec.invoiceId),
    rec.customerCode,
    rec.refCode,
    Number(rec.subtotal) || 0,
    Number(rec.gst) || 0,
    Number(rec.litres) || 0,
    createdIso,
  ];
  const r = await p.query(sql, args);
  const row = r.rows[0] as any;
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    ts: new Date(row.ts).toISOString(),
  };
}

export async function listCredits(filter: ListFilter = {}): Promise<Credit[]> {
  await initCredits();
  const where: string[] = [];
  const args: any[] = [];
  let i = 1;

  if (filter.refCode) { where.push(`ref_code = $${i++}`); args.push(filter.refCode); }
  if (filter.customerCode) { where.push(`customer_code = $${i++}`); args.push(filter.customerCode); }
  if (filter.from) { where.push(`created_at >= $${i++}`); args.push(filter.from.toISOString()); }
  if (filter.to)   { where.push(`created_at <  $${i++}`); args.push(filter.to.toISOString()); }

  const sql = `
    SELECT
      id,
      invoice_id     AS "invoiceId",
      customer_code  AS "customerCode",
      ref_code       AS "refCode",
      subtotal::text AS "subtotal",
      gst::text      AS "gst",
      litres::text   AS "litres",
      created_at     AS "createdAt",
      ts
    FROM public.referral_credits
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY created_at DESC, id DESC
    LIMIT 5000
  `;
  const r = await query<any>(sql, args);
  return r.rows.map((x: any) => ({
    ...x,
    createdAt: new Date(x.createdAt).toISOString(),
    ts: new Date(x.ts).toISOString(),
  }));
}
