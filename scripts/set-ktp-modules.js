const { Pool } = require('pg');

const url = process.argv[2];
if (!url) { console.error('pakai: node scripts/set-ktp-modules.js <DATABASE_URL>'); process.exit(1); }

const pool = new Pool({ connectionString: url, max: 1 });

(async () => {
  const botId = 1;
  const result = await pool.query(
    "SELECT data FROM bot_configs WHERE bot_id = $1 AND discord_guild_id = ''",
    [botId]
  );
  let modules = [];
  if (result.rowCount > 0 && result.rows[0].data && result.rows[0].data.modules) {
    modules = result.rows[0].data.modules;
  }
  if (!modules.includes('ktp')) {
    modules.push('ktp');
  }
  const data = { ...(result.rowCount > 0 ? result.rows[0].data : {}), modules };
  if (result.rowCount > 0) {
    await pool.query(
      "UPDATE bot_configs SET data = $1::jsonb, updated_at = now() WHERE bot_id = $2 AND discord_guild_id = ''",
      [JSON.stringify(data), botId]
    );
    console.log('default config diupdate: modules =', modules.join(','));
  } else {
    await pool.query(
      "INSERT INTO bot_configs (bot_id, discord_guild_id, data) VALUES ($1, '', $2::jsonb)",
      [botId, JSON.stringify(data)]
    );
    console.log('default config diinsert: modules =', modules.join(','));
  }
  await pool.end();
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
