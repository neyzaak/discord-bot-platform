import type { NextFunction, Request, Response } from 'express';
import { logger, redis } from '@platform/core';

/** Rate limit fixed-window via Redis (INCR + EXPIRE). */
export function rateLimit(opts: { windowSec: number; max: number; key?: (req: Request) => string }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = opts.key ? opts.key(req) : req.ip ?? 'unknown';
      const k = `rl:api:${id}:${Math.floor(Date.now() / (opts.windowSec * 1000))}`;
      const n = await redis.incr(k);
      if (n === 1) await redis.expire(k, opts.windowSec);
      if (n > opts.max) return void res.status(429).json({ error: 'terlalu banyak permintaan, coba lagi nanti' });
      next();
    } catch (e) {
      logger.error({ err: e }, 'rate limiter gagal — lanjutkan request (fail-open)');
      next();
    }
  };
}
