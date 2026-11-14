import cookieParser from 'cookie-parser';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger, requireEnv } from '@platform/core';
import { rateLimit } from './lib/limiter';
import { authRouter } from './routes/auth';
import { botsRouter } from './routes/bots';
import { webhooksRouter } from './routes/webhooks';
import { hooksRouter } from './routes/hooks';

requireEnv('DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI', 'SESSION_SECRET');

export const app = express();
app.set('trust proxy', 1);
// ponytail: ETag bikin fetch /auth/me dapat 304 dan helper api() web menganggapnya error — matikan.
app.set('etag', false);
app.use(express.json({ limit: '12mb' })); // bank soal besar via import/config
app.use(cookieParser());
app.use(rateLimit({ windowSec: 60, max: 240, key: (req) => req.ip ?? 'unknown' }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/bots', botsRouter);
app.use('/api/bots/:id/webhooks', webhooksRouter);
app.use('/api/hooks', hooksRouter); // publik — dipakai layanan eksternal

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'validasi gagal',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const status = (err as { status?: number })?.status ?? 500;
  if (status >= 500) {
    logger.error({ err: err instanceof Error ? (err.stack ?? err.message) : err, path: req.path }, 'unhandled api error');
  }
  res.status(status).json({ error: status >= 500 ? 'internal_error' : (err as Error).message });
});

export default app;
