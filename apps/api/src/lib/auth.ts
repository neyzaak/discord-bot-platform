import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { bots, env } from '@platform/core';

export interface SessionUser { id: number; discordId: string; username: string; avatar: string | null }
export type BotRow = typeof bots.$inferSelect;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: SessionUser }
  }
}

export function signSession(user: SessionUser): string {
  requireSecret();
  return jwt.sign(user, env.SESSION_SECRET!, { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.session as string | undefined;
  if (!token) return void res.status(401).json({ error: 'unauthorized' });
  try {
    requireSecret();
    const user = jwt.verify(token, env.SESSION_SECRET!) as SessionUser;
    if (typeof user?.id !== 'number' || typeof user?.discordId !== 'string') throw new Error('payload rusak');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

function requireSecret(): void {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET belum diset');
}

/** Bungkus handler async agar error masuk ke error middleware Express 4. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
