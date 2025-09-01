import { Router, Request, Response } from "express";
import { listCredits } from "../store/credits";

const router = Router();

// GET /api/referrals/credits?refCode=...&customerCode=...&from=...&to=...
router.get("/api/referrals/credits", (req: Request, res: Response) => {
  const { refCode, customerCode, from, to } = req.query as {
    refCode?: string; customerCode?: string; from?: string; to?: string;
  };
  const data = listCredits({ refCode, customerCode, from, to });
  res.json({ ok: true, count: data.length, data });
});

export default router;
