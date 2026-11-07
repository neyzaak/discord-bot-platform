// Seed 5.000 soal quiz ke guild baru di Supabase.
// Pakai: node scripts/seed-guild-quiz.mjs "<DATABASE_URL>" "<guild_id>" [botId=1]
import { createRequire } from 'node:module';
const require = createRequire(new URL('../packages/core/package.json', import.meta.url));
const { Pool } = require('pg');
const fs = require('node:fs');

const [dbUrl, guildId, botIdArg] = process.argv.slice(2);
const botId = Number(botIdArg ?? 1);
if (!dbUrl || !guildId || !Number.isInteger(botId) || botId <= 0) {
  console.error('pakai: node seed-guild-quiz.mjs "<DATABASE_URL>" "<guild_id>" [botId=1]');
  process.exit(1);
}

const bank = JSON.parse(fs.readFileSync(new URL('../deploy/quiz-bank.json', import.meta.url), 'utf8'));
if (!Array.isArray(bank.questions)) {
  console.error('quiz-bank.json tidak punya questions array');
  process.exit(1);
}
const questions = bank.questions.map((q, i) => ({
  question: q.question,
  choices: q.choices,
  correctIndex: q.correctIndex,
  explanation: q.explanation ?? '',
  _index: i + 1,
}));

const pool = new Pool({ connectionString: dbUrl, max: 1 });

(async () => {
  // 1. Pastikan bot ada
  const b = await pool.query('SELECT id FROM bots WHERE id = $1', [botId]);
  if (b.rowCount === 0) { console.error(`bot ${botId} tidak ada di tabel bots`); process.exit(1); }

  // 2. Pastikan bot_guilds ada (bot baru join → upsert)
  await pool.query(
    `INSERT INTO bot_guilds (bot_id, discord_guild_id, name) VALUES ($1, $2, $3)
     ON CONFLICT (bot_id, discord_guild_id) DO UPDATE SET name = EXCLUDED.name`,
    [botId, guildId, `guild-${guildId}`]
  );

  // 3. Upsert bot_configs dengan 5000 soal
  const data = JSON.stringify({ quiz: { enabled: true, questions } });
  await pool.query(
    `INSERT INTO bot_configs (bot_id, discord_guild_id, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (bot_id, discord_guild_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [botId, guildId, data]
  );

  const c = await pool.query(
    `SELECT jsonb_array_length(data->'quiz'->'questions') n FROM bot_configs WHERE bot_id = $1 AND discord_guild_id = $2`,
    [botId, guildId]
  );
  console.log(`selesai: ${questions.length} soal ditanam ke guild ${guildId} (DB sekarang ${c.rows[0].n} soal)`);
  await pool.end();
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
