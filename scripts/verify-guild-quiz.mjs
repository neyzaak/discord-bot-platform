// Verifikasi quiz di guild baru
import { createRequire } from 'node:module';
const require = createRequire(new URL('../packages/core/package.json', import.meta.url));
const { Pool } = require('pg');

const [dbUrl, guildId] = process.argv.slice(2);
const pool = new Pool({ connectionString: dbUrl, max: 1 });

(async () => {
  const r = await pool.query(
    `SELECT jsonb_array_length(data->'quiz'->'questions') AS n
     FROM bot_configs WHERE bot_id = 1 AND discord_guild_id = $1`,
    [guildId]
  );
  console.log('soal di guild baru:', r.rows[0]?.n ?? 0);
  const g = await pool.query("SELECT discord_guild_id FROM bot_guilds WHERE bot_id = 1");
  console.log('guilds terdaftar:', g.rows.map((x) => x.discord_guild_id).join(', '));
  await pool.end();
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
