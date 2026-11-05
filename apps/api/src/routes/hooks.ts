import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { bots, botGuilds, db, decryptToken, logger, redis, sanitizeText, webhooks } from '@platform/core';
import { asyncHandler } from '../lib/auth';
import { discordFetch } from '../lib/discord';

export const hooksRouter = Router();

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

const genericHookSchema = z.object({
  content: z.string().max(1900).optional(),
  title: z.string().max(256).optional(),
  description: z.string().max(1900).optional(),
}).refine((v) => v.content || v.title || v.description, 'isi minimal salah satu: content, title, atau description');

/** ponytail: payload GitHub dipetakan longgar (any) — event tak dikenal jatuh ke fallback generik */
function githubPayload(event: string, body: Record<string, any>): Record<string, unknown> | null {
  const repo = String(body?.repository?.full_name ?? '');
  if (event === 'ping') return null;
  if (event === 'push' && Array.isArray(body.commits)) {
    const commits = body.commits.slice(0, 5).map((c: any) =>
      `\`${String(c.id ?? '').slice(0, 7)}\` ${String(c.message ?? '').slice(0, 100)} — ${c.author?.name ?? '?'}`);
    return { embeds: [{
      title: `🚀 Push ke ${repo}`,
      url: typeof body.compare === 'string' ? body.compare : undefined,
      description: commits.join('\n').slice(0, 1900) || '—',
      color: 0x24292f, footer: { text: `by ${body.pusher?.name ?? 'unknown'}` },
    }] };
  }
  if (event === 'issues' || event === 'pull_request') {
    const item = body.issue ?? body.pull_request ?? {};
    const icon = event === 'issues' ? '🐛' : '🔀';
    return { embeds: [{
      title: `${icon} ${event === 'issues' ? 'Issue' : 'PR'} ${body.action ?? ''}: #${item.number ?? '?'} ${String(item.title ?? '').slice(0, 200)}`,
      url: typeof item.html_url === 'string' ? item.html_url : undefined,
      color: 0x24292f, footer: { text: repo },
    }] };
  }
  if (event === 'release') {
    return { embeds: [{
      title: `📦 Release ${body.release?.tag_name ?? ''}: ${String(body.release?.name ?? '').slice(0, 200)}`,
      url: typeof body.release?.html_url === 'string' ? body.release.html_url : undefined,
      color: 0x24292f, footer: { text: repo },
    }] };
  }
  if (event === 'star') {
    return { embeds: [{ title: `⭐ ${repo}: ${body.action ?? 'star'} (total ${body.stargazers_count ?? '?'})`, color: 0xf1c40f }] };
  }
  return { embeds: [{ title: `🔔 GitHub event: ${event}`, description: repo, color: 0x24292f }] };
}

hooksRouter.post('/:token', asyncHandler(async (req, res) => {
  const token = req.params.token;
  if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'token tidak valid' });

  // Rate limit per token: 20/menit
  const minute = Math.floor(Date.now() / 60_000);
  const rlKey = `rl:hook:${token}:${minute}`;
  const n = await redis.incr(rlKey).catch(() => 1);
  if (n === 1) await redis.expire(rlKey, 60).catch(() => {});
  if (n > 20) return res.status(429).json({ error: 'terlalu banyak permintaan' });

  const [hook] = await db.select().from(webhooks).where(eq(webhooks.token, token));
  if (!hook) return res.status(404).json({ error: 'not_found' });

  const [bot] = await db.select().from(bots).where(eq(bots.id, hook.botId));
  if (!bot) return res.status(410).json({ error: 'bot tidak ada' });
  if (bot.status !== 'running') return res.status(503).json({ error: 'bot sedang dijeda' });
  const [inGuild] = await db.select({ id: botGuilds.id }).from(botGuilds)
    .where(and(eq(botGuilds.botId, bot.id), eq(botGuilds.discordGuildId, hook.discordGuildId)));
  if (!inGuild) return res.status(410).json({ error: 'bot tidak lagi di server tersebut' });

  let payload: Record<string, unknown>;
  if (hook.source === 'github') {
    const event = String(req.headers['x-github-event'] ?? 'unknown');
    const p = githubPayload(event, (req.body ?? {}) as Record<string, any>);
    if (!p) return res.status(200).json({ ok: true, message: 'webhook aktif' });
    payload = p;
  } else {
    const body = genericHookSchema.parse(req.body);
    payload = {
      ...(body.content ? { content: sanitizeText(body.content) } : {}),
      ...(body.title || body.description
        ? { embeds: [{ title: body.title ? sanitizeText(body.title) : undefined, description: body.description ? sanitizeText(body.description) : undefined, color: 0x5865f2 }] }
        : {}),
      allowedMentions: { parse: [] }, // webhook tidak boleh mem-ping siapa pun
    };
  }

  const res2 = await discordFetch(`/channels/${hook.channelId}/messages`, {
    token: decryptToken(bot.tokenEncrypted),
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res2.ok) {
    logger.error({ webhookId: hook.id, status: res2.status }, 'gagal posting pesan webhook ke Discord');
    return res.status(502).json({ error: 'gagal mengirim ke Discord' });
  }
  res.status(200).json({ ok: true });
}));
