// Cek konfigurasi quiz per guild di Supabase
import { createRequire } from 'node:module';
const require = createRequire(new URL('../packages/core/package.json', import.meta.url));
const { Pool } = require('pg');

const [dbUrl, guildId] = process.argv.slice(2);
const pool = new Pool({ connectionString: dbUrl, max: 1 });

(async () => {
  const r = await pool.query(
    `SELECT discord_guild_id, data FROM bot_configs WHERE bot_id = 1 AND discord_guild_id IN ('', $1)`,
    [guildId]
  );
  for (const row of r.rows) {
    const d = row.data ?? {};
    const quiz = d.quiz ?? {};
    const modules = d.modules ?? [];
    console.log(`guild ${row.discord_guild_id || '(default/global)'}:`);
    console.log(`  quiz.enabled: ${quiz.enabled}`);
    console.log(`  quiz.questions: ${quiz.questions?.length ?? 0}`);
    console.log(`  modules aktif: ${modules.join(', ')}`);
    console.log(`  quiz.timePerQuestionSec: ${quiz.timePerQuestionSec ?? '(default)'}`);
    console.log(`  quiz.pointsPerQuestion: ${quiz.pointsPerQuestion ?? '(default)'}`);
    console.log('');
  }
  await pool.end();
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
