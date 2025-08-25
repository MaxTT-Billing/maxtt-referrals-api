import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { CONFIG } from './config.js';
import { ensureKeyHashes } from './auth.js';
import { ensureSchema } from './schema.js';
import referrals from './routes/referrals.js';
import exportsRouter from './routes/exports.js';          // (if you already had it)
import debugRouter from './routes/debug.js';
import dbinfoRouter from './routes/dbinfo.js';
import franchisees from './routes/franchisees.js';
import adminRouter from './routes/admin.js';
import exportReferrals from './routes/exportReferrals.js'; // ⬅️ new

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cors({ origin: CONFIG.cors }));

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.use('/referrals', referrals);
app.use('/exports', exportsRouter);        // keep if present (other exports)
app.use('/debug', debugRouter);
app.use('/dbinfo', dbinfoRouter);
app.use(franchisees);

// mount admin last
app.use('/admin', adminRouter);

// new CSV export route (mounted at root; path is /exports/referrals)
app.use(exportReferrals);

app.listen(CONFIG.port, () => {
  console.log(`referrals api listening on :${CONFIG.port}`);
});

(async () => {
  await ensureSchema();
  await ensureKeyHashes();
})();
