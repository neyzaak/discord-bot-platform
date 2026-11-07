// Hapus semua data guild dari database. Pakai:
//   node scripts/delete-guild-data.mjs "<DATABASE_URL>" "<guild_id>"
// Argumen 3 opsional: tampilkan saja tanpa menghapus (--dry-run).
import { createRequire } from 'node:module';
const require = createRequire(new URL('../packages/core/package.json', import.meta.url)); // pnpm strict: pg milik packages/core
const { Pool } = require('pg');

const [url, guild, , dry] = process.argv.slice(1).length === 4 ? process.argv.slice(1) : process.argv.slice(1);
const [dbUrl, guildId] = process.argv.slice(2).length === 2 ? process.argv.slice(2) : [url, guild];
const dryRun = process.argv.includes('--dry-run');

const TABLES = ['bot_configs', 'bot_guilds', 'command_logs', 'guild_members', 'tickets', 'webhooks'];
const pool = new Pool({ connectionString: dbUrl, max: 1 });

for (const t of TABLES) {
  const where = (t === 'bot_configs' || t === 'bot_guilds') ? 'discord_guild_id = $1 AND bot_id = 1' : 'discord_guild_id = $1';
  if (dryRun) {
    const r = await pool.query(`SELECT count(*) n FROM ${t} WHERE ${where}`, [guildId]);
    console.log(`${t}: ${r.rows[0].n} baris (dry-run)`);
  } else {
    const r = await pool.query(`DELETE FROM ${t} WHERE ${where}`, [guildId]);
    console.log(`${t}: ${r.rowCount} baris dihapus`);
  }
}

if (!dryRun) {
  const c = await pool.query("SELECT coalesce(string_agg(discord_guild_id, ', '),'(kosong)') g FROM bot_configs WHERE bot_id = 1");
  const g = await pool.query("SELECT coalesce(string_agg(discord_guild_id, ', '),'(kosong)') g FROM bot_guilds WHERE bot_id = 1");
  const s = await pool.query('SELECT pg_size_pretty(pg_database_size(current_database())) s');
  console.log('sisa config:', c.rows[0].g, '| sisa guild:', g.rows[0].g, '| ukuran DB:', s.rows[0].s);
}
await pool.end();
