// src/rateLimit.ts
// Tiny in-memory rate limiter with X-RateLimit headers.
// Works on a single Render instance (perfect for Starter/Free plans).

import type { Request, Response, NextFunction } from 'express';

type KeyFn = (req: Request) => string;

type LimitOptions = {
  windowMs: number;     // e.g. 60_000
  max: number;          // e.g. 60
  key?: KeyFn;          // default: req.ip
  name?: string;        // label in logs
  statusCode?: number;  // default: 429
  onLimitLog?: boolean; // default: true
};

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

function now() { return Date.now(); }

function defaultKey(req: Request) {
  return req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';
}

export function rateLimit(opts: LimitOptions) {
  const windowMs = Math.max(500, opts.windowMs);
  const max = Math.max(1, opts.max);
  const keyFn = opts.key ?? defaultKey;
  const statusCode = opts.statusCode ?? 429;
  const log = opts.onLimitLog ?? true;
  const name = opts.name ?? 'limit';

  return function limiter(req: Request, res: Response, next: NextFunction) {
    try {
      const baseKey = keyFn(req);
      // include method+path to separate buckets when desired by caller
      const routeKey = `${name}:${baseKey}`;

      const t = now();
      let b = store.get(routeKey);
      if (!b || t >= b.resetAt) {
        b = { count: 0, resetAt: t + windowMs };
        store.set(routeKey, b);
      }

      const remaining = Math.max(0, max - b.count - 1);
      const resetSec = Math.ceil(b.resetAt / 1000);

      // Headers (good for UIs & proxies)
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(resetSec));

      if (b.count >= max) {
        const retryAfter = Math.max(1, Math.ceil((b.resetAt - t) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        if (log) {
          // minimal log; avoids leaking headers
          console.warn(`[rate-limit] ${name} blocked ip=${req.ip} method=${req.method} path=${req.originalUrl}`);
        }
        return res.status(statusCode).json({
          ok: false,
          error: 'rate_limited',
          name,
          retry_after_seconds: retryAfter,
          reset_unix: resetSec,
        });
      }

      b.count += 1;
      next();
    } catch (e: any) {
      // Never crash; if limiter errs, just allow the request
      console.error('[rate-limit] error', e?.message || e);
      next();
    }
  };
}

// Helpers to compose method-aware limits without changing routers
export function methodGate(method: string, mw: ReturnType<typeof rateLimit>) {
  const m = method.toUpperCase();
  return (req: Request, res: Response, next: NextFunction) =>
    req.method.toUpperCase() === m ? mw(req, res, next) : next();
}

export function methodsGate(methods: string[], mw: ReturnType<typeof rateLimit>) {
  const set = new Set(methods.map(s => s.toUpperCase()));
  return (req: Request, res: Response, next: NextFunction) =>
    set.has(req.method.toUpperCase()) ? mw(req, res, next) : next();
}
