import { Router, Request, Response } from "express";
import { listCredits } from "../store/credits.js";

const router = Router();

/**
 * GET /api/referrals/credits
 * Query params (all optional):
 *   refCode=MAXTT-DEL-0087
 *   customerCode=TS-DL-DEL-001-0001
 *   from=YYYY-MM-DD
 *   to=YYYY-MM-DD
 * 
 * Returns: { ok:true, count:number, data: [...] }
 */
router.get("/api/referrals/credits", async (req: Request, res: Response) => {
  try {
    const refCode = (req.query.refCode as string | undefined)?.trim();
    const customerCode = (req.query.customerCode as string | undefined)?.trim();

    // Safe date parsing: allow plain YYYY-MM-DD (interpreted as local midnight),
    // and ignore invalid values instead of throwing.
    function parseDate(d?: string | null): Date | undefined {
      if (!d) return undefined;
      const s = String(d).trim();
      if (!s) return undefined;
      // Accept YYYY-MM-DD or full ISO. If just date, pin to 00:00:00 local.
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;
      const dt = new Date(iso);
      return Number.isFinite(dt.getTime()) ? dt : undefined;
    }

    const from = parseDate(req.query.from as string | undefined);
    // If "to" is just a date, treat as end-of-day by adding +1 day and using < nextDay
    const toRaw = parseDate(req.query.to as string | undefined);
    const to = toRaw ? new Date(toRaw.getTime()) : undefined;
    if (to) to.setDate(to.getDate() + 1); // exclusive upper bound

    const rows = await listCredits({ refCode, customerCode, from, to });
    return res.json({ ok: true, count: rows.length, data: rows });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

export default router;
