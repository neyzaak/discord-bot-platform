/**
 * Isi bank kutipan modul quotes sebuah guild (tanpa file — bank bawaan di bawah):
 *   docker compose run --rm worker pnpm --filter @platform/core exec tsx src/seed-quotes.ts <botId> <guildId>
 * Digabung + dedupe dengan kutipan yang sudah ada (berdasarkan teks), maksimal 500.
 */
import { and, eq } from 'drizzle-orm';
import { BOTS_CHANNEL, botConfigs, botGuilds, bots, db, quotesConfigSchema, redis } from './index';

const [botIdArg, guildId] = process.argv.slice(2);
if (!botIdArg || !guildId) {
  console.error('pakai: tsx src/seed-quotes.ts <botId> <guildId>');
  process.exit(1);
}
const botId = Number(botIdArg);
if (!Number.isInteger(botId) || botId <= 0) { console.error('botId tidak valid'); process.exit(1); }

const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
if (!bot) { console.error(`bot ${botId} tidak ditemukan`); process.exit(1); }
const [inGuild] = await db.select({ id: botGuilds.id }).from(botGuilds)
  .where(and(eq(botGuilds.botId, botId), eq(botGuilds.discordGuildId, guildId)));
if (!inGuild) { console.error(`bot belum tergabung di guild ${guildId}`); process.exit(1); }

/** Bank bawaan — imageUrl kosong = latar gradien; isi URL foto lewat dashboard bila mau. */
export const DEFAULT_QUOTES = [
  { text: 'Hidup itu seperti kopi: pahit di awal, tapi kalau dinikmati pelan-pelan jadi nikmat.', author: 'Geng Sulawesi' },
  { text: 'Jangan takut berjalan lambat, takutlah kalau cuma diam di tempat.', author: 'Geng Sulawesi' },
  { text: 'Orang yang berhenti belajar akan jadi tua, entah di umur berapa pun itu.', author: 'Henry Ford' },
  { text: 'Kegagalan bukan akhir, cuma belokan yang memaksa kita cari jalan lain.', author: 'Geng Sulawesi' },
  { text: 'Rezeki itu sudah diatur, tugas kita cuma bergerak dan tidak malas.', author: 'Geng Sulawesi' },
  { text: 'Yang paling jauh dari kita bukan lautan, tapi kemalasan hari ini.', author: 'Geng Sulawesi' },
  { text: 'Kerja keras tanpa doa itu sombong, doa tanpa kerja keras itu mimpi.', author: 'Geng Sulawesi' },
  { text: 'Jangan sibuk membandingkan jalan orang lain, kaki kita punya ritme sendiri.', author: 'Geng Sulawesi' },
  { text: 'Ilmu tanpa amal ibarat pohon tanpa buah.', author: 'Anonim' },
  { text: 'Sabar itu bukan menunggu, tapi bertahan tanpa mengeluh.', author: 'Geng Sulawesi' },
  { text: 'Kebaikan sekecil apa pun tetap kebaikan, jangan ditimbang dengan balasan.', author: 'Geng Sulawesi' },
  { text: 'Jangan habiskan tenaga untuk menjelaskan diri ke orang yang memang tidak mau paham.', author: 'Geng Sulawesi' },
  { text: 'Hari ini bertindak, besok bersyukur. Hari ini menunda, besok menyesal.', author: 'Geng Sulawesi' },
  { text: 'Tidak semua yang hilang itu kerugian; sebagian memang harus pergi supaya kita tumbuh.', author: 'Geng Sulawesi' },
  { text: 'Rasa hormat tidak dibeli, tapi bisa hilang oleh satu ucapan yang tidak dijaga.', author: 'Geng Sulawesi' },
  { text: 'Kaya itu bukan banyaknya harta, tapi lapangnya rasa cukup.', author: 'Anonim' },
  { text: 'Berpikir dulu sebelum bicara, karena luka kata tidak bisa dijahit.', author: 'Geng Sulawesi' },
  { text: 'Seorang sahabat sejati adalah orang yang mengingatkanmu saat kamu salah.', author: 'Geng Sulawesi' },
  { text: 'Waktu terbaik menanam pohon adalah dua puluh tahun lalu; yang kedua terbaik adalah sekarang.', author: 'Pepatah' },
  { text: 'Tidak ada kesuksesan tanpa disiplin, dan tidak ada disiplin tanpa tujuan jelas.', author: 'Geng Sulawesi' },
  { text: 'Sederhana dalam hidup bukan berarti kekurangan, tapi tahu apa yang cukup.', author: 'Geng Sulawesi' },
  { text: 'Kita tidak bisa mengendalikan angin, tapi bisa mengatur layar.', author: 'Anonim' },
  { text: 'Jadilah versi terbaik dirimu, bukan versi tiruan orang lain.', author: 'Geng Sulawesi' },
  { text: 'Tertawa boleh, tapi jangan sampai lupa siapa yang sedang berjuang di sampingmu.', author: 'Geng Sulawesi' },
  { text: 'Kebiasaan kecil yang konsisten mengalahkan rencana besar yang cuma di kepala.', author: 'Geng Sulawesi' },
].map((q) => ({ ...q, imageUrl: '' }));

const [cfgRow] = await db.select().from(botConfigs)
  .where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, guildId)));
const data0 = (cfgRow?.data as Record<string, unknown>) ?? {};
const before = quotesConfigSchema.parse(data0.quotes ?? {});
const existing = before.quotes;

const seen = new Set(existing.map((q) => q.text.toLowerCase()));
const merged = [...existing];
for (const q of DEFAULT_QUOTES) {
  if (seen.has(q.text.toLowerCase())) continue;
  seen.add(q.text.toLowerCase());
  merged.push(q);
}

const data = { ...data0, quotes: quotesConfigSchema.parse({ ...before, quotes: merged.slice(0, 500) }) };

await db.insert(botConfigs)
  .values({ botId, discordGuildId: guildId, data })
  .onConflictDoUpdate({
    target: [botConfigs.botId, botConfigs.discordGuildId],
    set: { data, updatedAt: new Date() },
  });

void redis.publish(BOTS_CHANNEL, JSON.stringify({ botId, action: 'reload' })).catch(() => {});
console.log(`kutipan: sebelum ${existing.length}, masuk ${merged.length - existing.length}, total ${merged.length} -> guild ${guildId}`);
process.exit(0);
