// src/server.ts
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
import { rateLimit, methodGate, methodsGate } from './rateLimit.js';

const app = express();

// Behind Render’s proxy → trust X-Forwarded-For for req.ip
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json());
app.use(cors({ origin: CONFIG.cors }));

// ---------------- Rate limits ----------------

// 60 req/min for "read" verbs (GET/HEAD) across the app
const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  name: 'read',
  // same bucket per ip for all reads
  key: (req) => req.ip || 'unknown',
});

// 10 req/min for POST /referrals (writes)
const postReferralsLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  name: 'post_referrals',
  key: (req) => req.ip || 'unknown',
});

// Optional: modest limits for franchisee admin writes (init/create/update)
// 20 req/min on POST/PATCH under /franchisees
const franWritesLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  name: 'franchisee_writes',
  key: (req) => req.ip || 'unknown',
});

// Apply read limiter only to GET/HEAD
app.use(methodsGate(['GET', 'HEAD'], readLimiter));

// Apply write limiter before routers:
app.use('/referrals', methodGate('POST', postReferralsLimiter));
app.use('/franchisees', methodsGate(['POST', 'PATCH'], franWritesLimiter));

// ---------------- Routes ----------------

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.use('/referrals', referrals);
app.use('/exports', exportsRouter);
app.use('/debug', debugRouter);
app.use('/dbinfo', dbinfoRouter);
app.use(franchisees);          // mounts /franchisees/* routes

// keep admin last
app.use('/admin', adminRouter);

// CSV export for referrals at /exports/referrals
app.use(exportReferrals);

// ---------------- Start ----------------

app.listen(CONFIG.port, () => {
  console.log(`referrals api listening on :${CONFIG.port}`);
});

(async () => {
  await ensureSchema();
  await ensureKeyHashes();
})();
