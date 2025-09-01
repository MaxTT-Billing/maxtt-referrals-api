// src/routes/credits.ts — GET list of credits (now DB-backed)
import { Router, Request, Response } from "express";
import { listCredits } from "../store/credits.js";

const router = Router();

// GET /api/referrals/credits?refCode=&customerCode=&from=&to=
router.get("/api/referrals/credits", async (req: Request, res: Response) => {
  try {
    const { refCode, customerCode, from, to } = req.query as {
      refCode?: string; customerCode?: string; from?: string; to?: string;
    };
    const data = await listCredits({ refCode, customerCode, from, to });
    res.json({ ok: true, count: data.length, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

export default router;
