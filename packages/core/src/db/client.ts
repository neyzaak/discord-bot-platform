import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';
import * as schema from './schema';

/**
 * Supabase pooler port 5432 = session mode (total klien dibatasi ~15, lihat
 * EMAXCONNSESSION). Di Vercel satu request bisa jadi instance baru, jadi pakai
 * transaction mode (6543) agar koneksi dimultiplex oleh pooler.
 */
function databaseUrl(raw: string) {
  if (!process.env.VERCEL) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '5432') url.port = '6543';
    return url.toString();
  } catch {
    return raw;
  }
}

const serverless = Boolean(process.env.VERCEL);
export const pool = new Pool({ connectionString: databaseUrl(env.DATABASE_URL), max: serverless ? 2 : 10 });
export const db = drizzle(pool, { schema });
