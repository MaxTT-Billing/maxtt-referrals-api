import { Pool } from "pg";
import { getPool } from "../db.js";

export type CreditRow = {
  id: number;
  invoiceId: string;
  customerCode: string;
  refCode: string;
  subtotal: string; // NUMERIC as string
  gst: string;      // NUMERIC as string
  litres: string;   // NUMERIC as string
  createdAt: string; // ISO string
  ts: string;        // ISO string
};

type ListOpts = {
  refCode?: string;
  customerCode?: string;
  from?: Date; // inclusive
  to?: Date;   // exclusive
};

function whereSql(opts: ListOpts) {
  const parts: string[] = [];
  const args: any[] = [];
  let i = 1;

  if (opts.refCode) { parts.push(`ref_code = $${i++}`); args.push(opts.refCode); }
  if (opts.customerCode) { parts.push(`customer_code = $${i++}`); args.push(opts.customerCode); }
  if (opts.from) { parts.push(`created_at >= $${i++}`); args.push(opts.from.toISOString()); }
  if (opts.to)   { parts.push(`created_at <  $${i++}`); args.push(opts.to.toISOString()); }

  const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { where, args };
}

export async function initCredits(pool?: Pool) {
  const p = pool || getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS public.referral_credits (
      id            SERIAL PRIMARY KEY,
      invoice_id    TEXT NOT NULL,
      customer_code TEXT NOT NULL,
      ref_code      TEXT NOT NULL,
      subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0,
      gst           NUMERIC(12,2) NOT NULL DEFAULT 0,
      litres        NUMERIC(12,3) NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ   NOT NULL,
      ts            TIMESTAMPTZ   NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_refcred_cust ON public.referral_credits (customer_code);
    CREATE INDEX IF NOT EXISTS ix_refcred_ref  ON public.referral_credits (ref_code);
    CREATE INDEX IF NOT EXISTS ix_refcred_ts   ON public.referral_credits (ts DESC);
  `);
}

export async function saveCredit(row: {
  invoiceId: string;
  customerCode: string;
  refCode: string;
  subtotal: number;
  gst: number;
  litres: number;
  createdAt: Date;
}) {
  const p = getPool();
  await initCredits(p);
  await p.query(
    `INSERT INTO public.referral_credits
     (invoice_id, customer_code, ref_code, subtotal, gst, litres, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      row.invoiceId,
      row.customerCode,
      row.refCode,
      row.subtotal,
      row.gst,
      row.litres,
      row.createdAt.toISOString()
    ]
  );
}

export async function listCredits(opts: ListOpts = {}): Promise<CreditRow[]> {
  const p = getPool();
  await initCredits(p);
  const { where, args } = whereSql(opts);
  const sql = `
    SELECT
      id,
      invoice_id   AS "invoiceId",
      customer_code AS "customerCode",
      ref_code      AS "refCode",
      subtotal::text AS "subtotal",
      gst::text      AS "gst",
      litres::text   AS "litres",
      created_at     AS "createdAt",
      ts
    FROM public.referral_credits
    ${where}
    ORDER BY created_at DESC, id DESC
    LIMIT 5000
  `;
  const r = await p.query(sql, args);
  // Normalize to ISO strings
  return r.rows.map((x) => ({
    ...x,
    createdAt: new Date(x.createdAt).toISOString(),
    ts: new Date(x.ts).toISOString(),
  }));
}
