import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { CONFIG } from './config.js';
import { ensureKeyHashes } from './auth.js';
import referrals from './routes/referrals.js';
import exportsRouter from './routes/exports.js';

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cors({ origin: CONFIG.cors }));

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));
app.use('/referrals', referrals);
app.use('/exports', exportsRouter);

// Start server first so /health is available, then seed keys in the background
const server = app.listen(CONFIG.port, () => {
  console.log(`referrals api listening on :${CONFIG.port}`);
});

(async () => {
  try {
    await ensureKeyHashes();
    console.log('API keys ensured');
  } catch (err) {
    console.error('ensureKeyHashes failed (will not crash server):', err);
  }
})();
