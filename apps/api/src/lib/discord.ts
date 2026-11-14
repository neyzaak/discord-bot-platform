import { env } from '@platform/core';

const API = 'https://discord.com/api/v10';

interface FetchOpts { token?: string; auth?: 'Bot' | 'Bearer' }

/** Discord REST helper — hormati 429 (retry sesuai retry_after, maks 3 percobaan). */
export async function discordFetch(path: string, init: RequestInit & FetchOpts, tries = 3): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('Authorization', `${init.auth ?? 'Bot'} ${init.token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (res.status === 429 && tries > 1) {
    const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
    const wait = Math.min((body.retry_after ?? 1) * 1000, 10_000);
    await new Promise((r) => setTimeout(r, wait));
    return discordFetch(path, init, tries - 1);
  }
  return res;
}

export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID ?? '',
    redirect_uri: env.DISCORD_REDIRECT_URI ?? '',
    response_type: 'code',
    scope: 'identify guilds', // scope seminimal mungkin untuk login
    state,
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

export async function exchangeCode(code: string): Promise<{ access_token: string }> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID ?? '',
      client_secret: env.DISCORD_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.DISCORD_REDIRECT_URI ?? '',
    }),
  });
  if (!res.ok) throw new Error(`OAuth token exchange gagal: HTTP ${res.status}`);
  return (await res.json()) as { access_token: string };
}

export interface BotIdentity { applicationId: string; botUserId: string; username: string; avatar: string | null }

/** Verifikasi token bot benar-benar hidup sebelum disimpan. */
export async function validateBotToken(token: string): Promise<BotIdentity | null> {
  try {
    const appRes = await discordFetch('/oauth2/applications/@me', { token });
    if (!appRes.ok) return null;
    const app = (await appRes.json()) as { id: string };
    const userRes = await discordFetch('/users/@me', { token });
    if (!userRes.ok) return null;
    const u = (await userRes.json()) as { id: string; username: string; avatar: string | null };
    return { applicationId: app.id, botUserId: u.id, username: u.username, avatar: u.avatar };
  } catch {
    return null;
  }
}
