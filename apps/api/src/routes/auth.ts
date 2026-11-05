import crypto from 'node:crypto';
import { Router } from 'express';
import { db, env, logger, redis, users } from '@platform/core';
import { asyncHandler, requireAuth, signSession } from '../lib/auth';
import { authorizeUrl, discordFetch, exchangeCode } from '../lib/discord';

export const authRouter = Router();

const MANAGE_GUILD = 1n << 5n;

authRouter.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000, path: '/',
  });
  res.redirect(authorizeUrl(state));
});

authRouter.get('/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query as { code?: unknown; state?: unknown };
  if (typeof code !== 'string' || typeof state !== 'string' || state !== req.cookies?.oauth_state) {
    return res.status(400).send('OAuth state tidak valid. Coba login lagi.');
  }
  res.clearCookie('oauth_state');

  const { access_token } = await exchangeCode(code);
  const meRes = await discordFetch('/users/@me', { token: access_token, auth: 'Bearer' });
  if (!meRes.ok) {
    logger.error({ status: meRes.status }, 'gagal mengambil profil Discord');
    return res.status(502).send('Gagal mengambil profil Discord.');
  }
  const me = (await meRes.json()) as { id: string; username: string; avatar: string | null };

  const [user] = await db
    .insert(users)
    .values({ discordId: me.id, username: me.username, avatar: me.avatar ?? null })
    .onConflictDoUpdate({ target: users.discordId, set: { username: me.username, avatar: me.avatar ?? null } })
    .returning();

  // Cache guild yang bisa dikelola user (owner / MANAGE_GUILD) untuk cek otorisasi config.
  const gRes = await discordFetch('/users/@me/guilds', { token: access_token, auth: 'Bearer' });
  const guilds: Array<{ id: string; name: string; owner: boolean; permissions: string }> =
    gRes.ok ? await gRes.json() : [];
  const manageable = (Array.isArray(guilds) ? guilds : [])
    .filter((g) => g.owner || (BigInt(g.permissions ?? '0') & MANAGE_GUILD) !== 0n)
    .map((g) => ({ id: g.id, name: g.name }));
  await redis.set(`user_guilds:${user.discordId}`, JSON.stringify(manageable), 'EX', 7 * 24 * 3600);

  res.cookie('session', signSession({ id: user.id, discordId: user.discordId, username: user.username, avatar: user.avatar }), {
    httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 7 * 24 * 3600 * 1000, path: '/',
  });
  res.redirect(`${env.APP_URL}/dashboard`);
}));

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('session', { path: '/' });
  res.json({ ok: true });
});
