/**
 * Muat bank soal (JSON) ke config quiz sebuah guild:
 *   docker compose run --rm -v "<path>/quiz-bank.json:/tmp/bank.json" worker \
 *     pnpm --filter @platform/core exec tsx src/seed-quiz.ts /tmp/bank.json <botId> <guildId>
 * Validasi dengan skema quiz, gabung + dedupe dengan soal yang sudah ada, lalu publish reload.
 */
import fs from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { BOTS_CHANNEL, botConfigs, botGuilds, bots, db, quizConfigSchema, quizQuestionsSchema, redis } from './index';

const [file, botIdArg, guildId] = process.argv.slice(2);
if (!file || !botIdArg || !guildId) {
  console.error('pakai: tsx src/seed-quiz.ts <bank.json> <botId> <guildId>');
  process.exit(1);
}
const botId = Number(botIdArg);
if (!Number.isInteger(botId) || botId <= 0) { console.error('botId tidak valid'); process.exit(1); }

const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
if (!bot) { console.error(`bot ${botId} tidak ditemukan`); process.exit(1); }
const [inGuild] = await db.select({ id: botGuilds.id }).from(botGuilds)
  .where(and(eq(botGuilds.botId, botId), eq(botGuilds.discordGuildId, guildId)));
if (!inGuild) { console.error(`bot belum tergabung di guild ${guildId}`); process.exit(1); }

const bank = JSON.parse(fs.readFileSync(file, 'utf8')) as { questions?: unknown };
let incoming: unknown[];
try {
  incoming = quizQuestionsSchema.parse(bank.questions ?? []);
} catch (e) {
  console.error('bank tidak lolos validasi:', e instanceof Error ? e.message.slice(0, 600) : e);
  process.exit(1);
}

const [row] = await db.select().from(botConfigs)
  .where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, guildId)));
const existing = (row?.data as { quiz?: { questions?: unknown[] } } ?? {}).quiz?.questions ?? [];
const merged = quizQuestionsSchema.parse([...(existing as unknown[]), ...incoming].slice(0, 5000));

const [cfgRow] = await db.select().from(botConfigs)
  .where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, guildId)));
const quizBefore = quizConfigSchema.parse(((cfgRow?.data as Record<string, unknown>) ?? {}).quiz ?? {});
const data = { ...((cfgRow?.data as Record<string, unknown>) ?? {}), quiz: { ...quizBefore, questions: merged } };

await db.insert(botConfigs)
  .values({ botId, discordGuildId: guildId, data })
  .onConflictDoUpdate({
    target: [botConfigs.botId, botConfigs.discordGuildId],
    set: { data, updatedAt: new Date() },
  });

await redis.publish(BOTS_CHANNEL, JSON.stringify({ botId, action: 'reload' }));
console.log(`soal: sebelum ${(existing as unknown[]).length}, masuk ${incoming.length}, total ${merged.length} -> guild ${guildId}`);
process.exit(0);
