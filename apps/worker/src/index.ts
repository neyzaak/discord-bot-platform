import { createServer } from 'node:http';
import { eq } from 'drizzle-orm';
import {
  BOTS_CHANNEL, bots, createRedis, db, env, logger, recordError,
} from '@platform/core';
import { BotRunner } from './runner';

// ponytail: satu proses worker untuk semua bot; sharding/multi-proses jika jumlah bot ribuan
const runners = new Map<number, BotRunner>();
const attempts = new Map<number, number>();

async function startBot(botId: number): Promise<void> {
  await stopBot(botId);
  const runner = new BotRunner(botId);
  runners.set(botId, runner);
  try {
    await runner.start();
    attempts.delete(botId);
    logger.info({ botId }, 'runner aktif');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordError(botId, e);
    if (/invalid token/i.test(msg)) {
      logger.error({ botId }, 'token bot invalid — runner dihentikan (perbarui token lewat dashboard)');
      await runner.stop();
      runners.delete(botId);
      return;
    }
    const n = Math.min((attempts.get(botId) ?? 0) + 1, 6);
    attempts.set(botId, n);
    const delay = Math.min(1000 * 2 ** n, 60_000);
    logger.warn({ botId, delay }, `gagal start runner — ulang dalam ${delay}ms`);
    setTimeout(() => {
      if (runners.get(botId) === runner) void startBot(botId);
    }, delay);
  }
}

async function stopBot(botId: number): Promise<void> {
  const runner = runners.get(botId);
  if (!runner) return;
  runners.delete(botId);
  await runner.stop().catch((e) => logger.error({ err: e, botId }, 'stop runner gagal'));
}

async function reloadBot(botId: number): Promise<void> {
  const [bot] = await db.select({ status: bots.status }).from(bots).where(eq(bots.id, botId));
  if (!bot || bot.status !== 'running') return stopBot(botId);
  await startBot(botId);
}

async function main(): Promise<void> {
  const rows = await db.select({ id: bots.id }).from(bots).where(eq(bots.status, 'running'));
  logger.info(`memuat ${rows.length} bot...`);
  for (const r of rows) await startBot(r.id);

  const sub = createRedis();
  await sub.subscribe(BOTS_CHANNEL);
  sub.on('message', (channel, message) => {
    if (channel !== BOTS_CHANNEL) return;
    try {
      const { botId, action } = JSON.parse(message) as { botId: number; action: 'reload' | 'stop' };
      logger.info({ botId, action }, 'sinyal dari dashboard');
      if (action === 'stop') void stopBot(botId);
      else void reloadBot(botId);
    } catch (e) {
      logger.error({ err: e }, 'pesan pubsub tidak valid');
    }
  });
  logger.info(`worker siap (redis: ${env.REDIS_URL})`);

  const shutdown = async () => {
    logger.info('worker dimatikan — membersihkan...');
    for (const id of [...runners.keys()]) await stopBot(id);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.on('unhandledRejection', (e) => logger.error({ err: e }, 'unhandledRejection'));
  process.on('uncaughtException', (e) => logger.error({ err: e }, 'uncaughtException'));
}

main().catch((e) => {
  logger.error({ err: e }, 'worker gagal start');
  process.exit(1);
});

// Port HTTP untuk host yang menuntut web service (Render free) + dipakai pinger keep-alive.
const port = Number(process.env.PORT ?? 8080);
createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); })
  .listen(port, () => logger.info({ port }, 'health server siap'));
