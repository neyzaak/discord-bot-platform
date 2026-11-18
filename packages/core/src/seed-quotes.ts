/**
 * Isi bank kutipan modul quotes sebuah guild dari seed-data/quotes.json:
 *   docker compose run --rm worker pnpm --filter @platform/core exec tsx src/seed-quotes.ts <botId> <guildId> [--replace]
 * Default: digabung + dedupe dengan kutipan yang sudah ada (berdasarkan teks), maksimal 500.
 * Dengan --replace: bank diganti seluruhnya dengan isi JSON (hati-hati, kutipan buatan sendiri ikut terhapus).
 */
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { BOTS_CHANNEL, botConfigs, botGuilds, bots, db, quotesConfigSchema, redis } from './index';

const [botIdArg, guildId] = process.argv.slice(2);
if (!botIdArg || !guildId) {
  console.error('pakai: tsx src/seed-quotes.ts <botId> <guildId>');
  process.exit(1);
}
const botId = Number(botIdArg);
if (!Number.isInteger(botId) || botId <= 0) { console.error('botId tidak valid'); process.exit(1); }

const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
if (!bot) { console.error(`bot ${botId} tidak ditemukan`); process.exit(1); }
const [inGuild] = await db.select({ id: botGuilds.id }).from(botGuilds)
  .where(and(eq(botGuilds.botId, botId), eq(botGuilds.discordGuildId, guildId)));
if (!inGuild) { console.error(`bot belum tergabung di guild ${guildId}`); process.exit(1); }

const DEFAULT_QUOTES = JSON.parse(
  readFileSync(new URL('../seed-data/quotes.json', import.meta.url), 'utf8'),
) as Array<{ text: string; author: string }>;

const replace = process.argv.includes('--replace');
const norm = (q: { text: string; author: string }) => ({ ...q, text: q.text.charAt(0).toUpperCase() + q.text.slice(1) });

const [cfgRow] = await db.select().from(botConfigs)
  .where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, guildId)));
const data0 = (cfgRow?.data as Record<string, unknown>) ?? {};
const before = quotesConfigSchema.parse(data0.quotes ?? {});
const existing = before.quotes;

const merged = replace ? [] : existing.map(norm);
const seen = new Set(merged.map((q) => q.text.toLowerCase()));
for (const raw of DEFAULT_QUOTES) {
  const q = norm(raw);
  if (seen.has(q.text.toLowerCase())) continue;
  seen.add(q.text.toLowerCase());
  merged.push(q);
}

const data = { ...data0, quotes: quotesConfigSchema.parse({ ...before, quotes: merged.slice(0, 500) }) };

await db.insert(botConfigs)
  .values({ botId, discordGuildId: guildId, data })
  .onConflictDoUpdate({
    target: [botConfigs.botId, botConfigs.discordGuildId],
    set: { data, updatedAt: new Date() },
  });

void redis.publish(BOTS_CHANNEL, JSON.stringify({ botId, action: 'reload' })).catch(() => {});
console.log(`kutipan: sebelum ${existing.length}, masuk ${merged.length - existing.length}, total ${merged.length} -> guild ${guildId}`);
process.exit(0);
