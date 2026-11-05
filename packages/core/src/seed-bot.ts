/**
 * Bootstrap bot dari CLI (tanpa login dashboard):
 *   docker compose run --rm -e BOT_TOKEN=... [-e BOT_NAME=...] worker pnpm --filter @platform/core exec tsx src/seed-bot.ts
 * Validasi token ke Discord, simpan terenkripsi, pemilik = owner aplikasi bot,
 * aktifkan semua modul, lalu publish reload ke worker.
 */
import { botConfigs, bots, buildInviteUrl, db, encryptToken, users } from './index';

const MODULE_NAMES = [
  'welcome', 'moderation', 'tickets', 'logging', 'utilities',
  'customcmd', 'leveling', 'economy', 'webhooks', 'quiz',
] as const;

const token = process.env.BOT_TOKEN ?? '';
if (!token) { console.error('BOT_TOKEN wajib diset'); process.exit(1); }
const name = process.env.BOT_NAME ?? 'Bot Quiz';
const prefix = process.env.BOT_PREFIX ?? '!';

const res = await fetch('https://discord.com/api/v10/oauth2/applications/@me', {
  headers: { Authorization: `Bot ${token}` },
});
if (!res.ok) {
  console.error(`Token tidak valid atau tidak bisa diverifikasi (HTTP ${res.status})`);
  process.exit(1);
}
const app = (await res.json()) as { id: string; owner?: { id: string; username: string } };
if (!app.owner) { console.error('Pemilik aplikasi tidak tersedia dari Discord'); process.exit(1); }

const [user] = await db.insert(users)
  .values({ discordId: app.owner.id, username: app.owner.username })
  .onConflictDoUpdate({ target: users.discordId, set: { username: app.owner.username } })
  .returning();

const [bot] = await db.insert(bots).values({
  userId: user.id,
  applicationId: app.id,
  name,
  tokenEncrypted: encryptToken(token),
  tokenLast4: token.slice(-4),
  prefix,
  status: 'running',
}).returning();

await db.insert(botConfigs)
  .values({ botId: bot.id, discordGuildId: '', data: { modules: [...MODULE_NAMES] } })
  .onConflictDoUpdate({
    target: [botConfigs.botId, botConfigs.discordGuildId],
    set: { data: { modules: [...MODULE_NAMES] }, updatedAt: new Date() },
  });

console.log(JSON.stringify({
  botId: bot.id,
  name: bot.name,
  ownerDiscordId: user.discordId,
  tokenMasked: `••••${bot.tokenLast4}`,
  modules: [...MODULE_NAMES],
  inviteUrl: buildInviteUrl(bot.applicationId, [...MODULE_NAMES]),
}, null, 2));
process.exit(0);
