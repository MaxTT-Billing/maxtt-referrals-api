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

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cors({ origin: CONFIG.cors }));

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.use('/referrals', referrals);
app.use('/exports', exportsRouter);
app.use('/debug', debugRouter);
app.use('/dbinfo', dbinfoRouter);

// Mount franchisees BEFORE admin to avoid any /admin/* collisions
app.use(franchisees);

app.use('/admin', adminRouter);

app.listen(CONFIG.port, () => {
  console.log(`referrals api listening on :${CONFIG.port}`);
});

(async () => {
  await ensureSchema();
  await ensureKeyHashes();
})();
