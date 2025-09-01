// src/store/credits.ts — DB-backed credits store
import { query } from "../db.js";

export type Credit = {
  id: number;
  invoiceId: number | string;
  customerCode: string;
  refCode: string;
  subtotal: number;
  gst: number;
  litres: number;
  createdAt: string;
  ts: string; // server receive time
};

// Auto-create table if missing
export async function initCredits() {
  await query(`
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

export async function addCredit(rec: Omit<Credit, "id" | "ts">): Promise<Credit> {
  const sql = `
    INSERT INTO public.referral_credits
      (invoice_id, customer_code, ref_code, subtotal, gst, litres, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING id,
      invoice_id     AS "invoiceId",
      customer_code  AS "customerCode",
      ref_code       AS "refCode",
      subtotal::text::decimal      AS "subtotal",
      gst::text::decimal           AS "gst",
      litres::text::decimal        AS "litres",
      created_at    AS "createdAt",
      ts            AS "ts"
  `;
  const p = [
    String(rec.invoiceId),
    String(rec.customerCode),
    String(rec.refCode),
    Number(rec.subtotal) || 0,
    Number(rec.gst) || 0,
    Number(rec.litres) || 0,
    new Date(rec.createdAt).toISOString(),
  ];
  const r = await query<Credit>(sql, p);
  return r.rows[0];
}

export async function listCredits(filter?: {
  refCode?: string; customerCode?: string; from?: string; to?: string;
}): Promise<Credit[]> {
  const where: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (filter?.refCode) {
    where.push(`ref_code = $${i++}`); params.push(String(filter.refCode).trim());
  }
  if (filter?.customerCode) {
    where.push(`customer_code = $${i++}`); params.push(String(filter.customerCode).trim());
  }
  if (filter?.from) {
    where.push(`created_at >= $${i++}`); params.push(new Date(filter.from).toISOString());
  }
  if (filter?.to) {
    where.push(`created_at <= $${i++}`); params.push(new Date(filter.to).toISOString());
  }

  const sql = `
    SELECT
      id,
      invoice_id     AS "invoiceId",
      customer_code  AS "customerCode",
      ref_code       AS "refCode",
      subtotal::text::decimal      AS "subtotal",
      gst::text::decimal           AS "gst",
      litres::text::decimal        AS "litres",
      created_at    AS "createdAt",
      ts            AS "ts"
    FROM public.referral_credits
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY ts DESC
    LIMIT 500
  `;
  const r = await query<Credit>(sql, params);
  return r.rows;
}
