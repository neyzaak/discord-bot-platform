import crypto from 'node:crypto';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, env, logger, webhooks } from '@platform/core';
import { asyncHandler, requireAuth } from '../lib/auth';
import { rateLimit } from '../lib/limiter';
import { assertBotInGuild, botLevelModules, httpError, loadOwnedBot } from './bots';

export const webhooksRouter = Router({ mergeParams: true });

const createWebhookSchema = z.object({
  name: z.string().trim().min(2).max(64),
  discordGuildId: z.string().regex(/^\d{5,25}$/),
  channelId: z.string().regex(/^\d{5,25}$/),
  source: z.enum(['github', 'generic']),
});

const maskToken = (t: string): string => `${t.slice(0, 6)}••••${t.slice(-4)}`;
const publicBase = (): string => env.PUBLIC_API_URL ?? env.API_URL;

webhooksRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const rows = await db.select().from(webhooks).where(eq(webhooks.botId, bot.id)).orderBy(desc(webhooks.createdAt));
  res.json({
    webhooks: rows.map((w) => ({
      id: w.id, name: w.name, source: w.source,
      discordGuildId: w.discordGuildId, channelId: w.channelId,
      tokenMasked: maskToken(w.token), createdAt: w.createdAt,
    })),
  });
}));

const createLimiter = rateLimit({ windowSec: 60, max: 10, key: (req) => `user:${req.user?.id ?? req.ip}` });

webhooksRouter.post('/', requireAuth, createLimiter, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const input = createWebhookSchema.parse(req.body);
  const modules = await botLevelModules(bot.id);
  if (!modules.includes('webhooks')) throw httpError(400, 'Aktifkan modul Webhooks dulu di pengaturan bot.');
  await assertBotInGuild(bot.id, input.discordGuildId);

  const token = crypto.randomBytes(24).toString('base64url'); // 32 char URL-safe
  const [row] = await db.insert(webhooks).values({ botId: bot.id, ...input, token }).returning();
  logger.info({ webhookId: row.id, botId: bot.id }, 'webhook dibuat');
  res.status(201).json({
    webhook: {
      id: row.id, name: row.name, source: row.source,
      discordGuildId: row.discordGuildId, channelId: row.channelId,
      tokenMasked: maskToken(row.token),
      url: `${publicBase()}/api/hooks/${row.token}`, // URL penuh hanya sekali ini
    },
  });
}));

// URL baru untuk webhook yang sama (URL lama otomatis mati karena token diganti).
webhooksRouter.post('/:wid/regenerate', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const wid = Number(req.params.wid);
  if (!Number.isInteger(wid) || wid <= 0) throw httpError(400, 'id tidak valid');
  const token = crypto.randomBytes(24).toString('base64url');
  const [row] = await db.update(webhooks).set({ token })
    .where(and(eq(webhooks.id, wid), eq(webhooks.botId, bot.id))).returning();
  if (!row) throw httpError(404, 'webhook tidak ditemukan');
  logger.info({ webhookId: row.id }, 'token webhook diregenerasi');
  res.json({ url: `${publicBase()}/api/hooks/${token}` });
}));

webhooksRouter.delete('/:wid', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const wid = Number(req.params.wid);
  if (!Number.isInteger(wid) || wid <= 0) throw httpError(400, 'id tidak valid');
  const deleted = await db.delete(webhooks)
    .where(and(eq(webhooks.id, wid), eq(webhooks.botId, bot.id))).returning({ id: webhooks.id });
  if (deleted.length === 0) throw httpError(404, 'webhook tidak ditemukan');
  logger.info({ webhookId: wid, botId: bot.id }, 'webhook dihapus');
  res.json({ ok: true });
}));
