// src/server.ts
// Referrals API server (TypeScript, ESM/NodeNext)
// - Franchisees routes
// - Referrals routes
// - CSV exports (invoices + referrals)
// - Debug/dbinfo/admin
// - Admin utilities for referrals (delete/find) via referralAdmin
// - In-memory rate limits

import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { CONFIG } from './config.js';
import { ensureKeyHashes } from './auth.js';
import { ensureSchema } from './schema.js';

import referrals from './routes/referrals.js';
import exportsRouter from './routes/exports.js';
import debugRouter from './routes/debug.js';
import dbinfoRouter from './routes/dbinfo.js';
import franchisees from './routes/franchisees.js';
import adminRouter from './routes/admin.js';
import exportReferrals from './routes/exportReferrals.js';
import referralAdmin from './routes/referralAdmin.js';

import { rateLimit, methodGate, methodsGate } from './rateLimit.js';

const app = express();

// trust proxy for correct req.ip on Render
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json());
app.use(cors({ origin: CONFIG.cors }));

// ---------------- Rate limits ----------------
// 60 req/min for reads (GET/HEAD)
const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  name: 'read',
  key: (req) => req.ip || 'unknown',
});

// 10 req/min for POST /referrals
const postReferralsLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  name: 'post_referrals',
  key: (req) => req.ip || 'unknown',
});

// 20 req/min for franchisee writes (POST/PATCH under /franchisees)
const franWritesLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  name: 'franchisee_writes',
  key: (req) => req.ip || 'unknown',
});

// Apply read limiter only to GET/HEAD
app.use(methodsGate(['GET', 'HEAD'], readLimiter));
// Apply write limiters
app.use('/referrals', methodGate('POST', postReferralsLimiter));
app.use('/franchisees', methodsGate(['POST', 'PATCH'], franWritesLimiter));

// ---------------- Routes ----------------
app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

// core
app.use('/referrals', referrals);
app.use('/exports', exportsRouter);            // other exports (if any)
app.use('/debug', debugRouter);
app.use('/dbinfo', dbinfoRouter);
app.use(franchisees);

// admin (existing)
app.use('/admin', adminRouter);

// referrals CSV export at /exports/referrals
app.use(exportReferrals);

// NEW: admin utilities for referrals under /admin/referrals/*
app.use('/admin', referralAdmin);

// ---------------- Start ----------------
app.listen(CONFIG.port, () => {
  console.log(`referrals api listening on :${CONFIG.port}`);
});

// Initialize schema & auth salts, but do not crash server if they fail
(async () => {
  try {
    await ensureSchema();
  } catch (e: any) {
    console.error('ensureSchema failed:', e?.message || e);
  }
  try {
    await ensureKeyHashes();
  } catch (e: any) {
    console.warn('ensureKeyHashes skipped:', e?.message || e);
  }
})();
