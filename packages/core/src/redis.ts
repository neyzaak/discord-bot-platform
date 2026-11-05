import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL);
export const createRedis = (): Redis => new Redis(env.REDIS_URL);

export const BOT_STATUS_KEY = (botId: number): string => `bot:status:${botId}`;
export const BOTS_CHANNEL = 'platform:bots';
