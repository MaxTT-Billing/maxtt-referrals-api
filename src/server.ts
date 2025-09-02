// src/server.ts — Referrals API (TS/ESM) with DB-backed credits
import express, { Request, Response, NextFunction, Router } from "express";
import crypto from "node:crypto";

import creditsRouter from "./routes/credits.js";
import { addCredit, initCredits } from "./store/credits.js";

const PORT = Number(process.env.PORT || 10000);
const ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || "https://maxtt-billing-tools.onrender.com")
  .split(",").map(s => s.trim()).filter(Boolean);
const KEY = String(process.env.REF_SIGNING_KEY || "TS!MAXTT-2025");
const ENABLED = String(process.env.REFERRALS_ENABLED ?? "true").toLowerCase() !== "false";

const app = express();
app.use(express.json({ limit: "2mb" }));

// CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || "";
  if (ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-REF-SIG");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// HMAC
function verifyHmac(body: unknown, sigHeader?: string): boolean {
  if (!sigHeader || !sigHeader.startsWith("sha256=")) return false;
  const sigHex = sigHeader.slice(7);
  const mac = crypto.createHmac("sha256", KEY);
  mac.update(JSON.stringify(body));
  const expected = mac.digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sigHex, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// Health
app.get("/", (_req, res) => res.send("MaxTT Referrals API is running"));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Validate
app.post("/api/referrals/validate", (req, res) => {
  if (!ENABLED) return res.json({ valid: false, error: "disabled" });
  if (!verifyHmac(req.body, req.get("x-ref-sig") || req.get("X-REF-SIG") || undefined)) {
    return res.status(401).json({ valid: false, error: "bad_signature" });
  }
  const code = String((req.body as any)?.code || "").trim();
  const valid = /^[A-Z0-9-]{6,}$/.test(code) && (code.startsWith("MAXTT-") || code.startsWith("TS-"));
  const ownerName = valid ? "Registered Customer" : undefined;
  res.json({ valid, ownerName });
});

// Credit — persists to DB
app.post("/api/referrals/credit", async (req, res) => {
  if (!ENABLED) return res.status(503).json({ ok: false, error: "disabled" });
  if (!verifyHmac(req.body, req.get("x-ref-sig") || req.get("X-REF-SIG") || undefined)) {
    return res.status(401).json({ ok: false, error: "bad_signature" });
  }
  const b = req.body as any;
  if (!b.invoiceId || !b.customerCode || !b.refCode) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }
  const rec = await addCredit({
    invoiceId: b.invoiceId,
    customerCode: String(b.customerCode),
    refCode: String(b.refCode),
    subtotal: Number(b.subtotal || 0) || 0,
    gst: Number(b.gst || 0) || 0,
    litres: Number(b.litres || 0) || 0,
    createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
  });
  res.json({ ok: true, creditId: rec.id });
});

// Credits list
app.use(creditsRouter);

// Optional admin (if present)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const adminRouter: Router = require("./routes/referralAdmin").default;
  if (adminRouter) app.use("/api/admin", adminRouter);
} catch { /* ignore */ }

// 404
app.use((_req, res) => res.status(404).json({ error: "not_found" }));

// Boot
(async () => {
  try {
    await initCredits();
    app.listen(PORT, () => console.log(`Referrals API listening on :${PORT}`));
  } catch (e) {
    console.error("Boot failed:", e);
    process.exit(1);
  }
})();
