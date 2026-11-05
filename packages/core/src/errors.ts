import { db } from './db/client';
import { errors } from './db/schema';
import { logger } from './logger';

export async function recordError(botId: number | null, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? null) : null;
  logger.error({ botId, err: message }, 'runtime error');
  try {
    await db.insert(errors).values({ botId, message: message.slice(0, 2000), stack: stack?.slice(0, 4000) ?? null });
  } catch (e) {
    logger.error({ err: e }, 'gagal menyimpan error ke database');
  }
}
