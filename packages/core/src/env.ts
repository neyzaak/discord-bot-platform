import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });
config();

const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().url().optional(),
);

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4001'),
  API_PORT: z.coerce.number().int().default(4001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_REDIRECT_URI: optionalUrl,
  SESSION_SECRET: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().regex(
    /^[0-9a-fA-F]{64}$/,
    'TOKEN_ENCRYPTION_KEY harus 64 karakter hex (openssl rand -hex 32)',
  ),
  PUBLIC_API_URL: optionalUrl,
  LOG_LEVEL: z.string().default('info'),
});

export const env = Env.parse(process.env);

export function requireEnv(...keys: string[]): void {
  for (const k of keys) {
    if (!process.env[k]) throw new Error(`Environment variable ${k} belum diset`);
  }
}
