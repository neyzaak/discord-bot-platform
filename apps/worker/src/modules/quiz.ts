import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits, PermissionFlagsBits,
  SlashCommandBuilder, type APIEmbed, type GuildMember, type Interaction,
  type Message, type TextChannel,
} from 'discord.js';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db, botConfigs, guildMembers, logger, recordError } from '@platform/core';
import type { BotModule, CommandContext, ModuleCommand, ModuleCtx } from './types';

const ACCENT = 0x5865f2;
const GREEN = 0x57f287;
const RED = 0xed4245;
const letter = (i: number): string => String.fromCharCode(65 + i); // A, B, C, D
const fmtNum = (n: number): string => n.toLocaleString('id-ID');   // 25000 -> 25.000
const fmtDuration = (sec: number): string => (sec % 60 === 0 ? `${sec / 60} menit` : `${sec} detik`);

interface QuizQuestion { question: string; choices: string[]; correctIndex: number; explanation: string }

interface QuizCfg {
  enabled: boolean; title: string; pointsName: string;
  timePerQuestionSec: number; pointsPerQuestion: number;
  questionsPerSession: number;
}
const cfg = (c: Record<string, unknown>): QuizCfg => c as unknown as QuizCfg;

/** Ambil satu soal acak langsung di Postgres — jangan tarik seluruh bank soal ke bot. */
async function randomQuestion(botId: number, guildId: string): Promise<QuizQuestion | null> {
  const [row] = await db.select({
    q: sql<QuizQuestion | null>`(${botConfigs.data}->'quiz'->'questions')->(floor(random() * jsonb_array_length(${botConfigs.data}->'quiz'->'questions'))::int)`.as('q'),
  }).from(botConfigs)
    .where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, guildId)));
  const q = row?.q;
  if (!q || typeof q.question !== 'string' || !Array.isArray(q.choices) || q.choices.length < 2) return null;
  return q;
}

interface QuizSession {
  channelId: string;
  starterId: string;
  questions: QuizQuestion[];
  index: number;                // indeks soal berjalan
  scores: Map<string, number>;  // userId -> poin sesi ini
  names: Map<string, string>;   // userId -> tag (untuk papan skor akhir)
  answers: Map<string, number>; // userId -> pilihan utk soal berjalan
  message: Message | null;      // pesan soal berjalan (dihapus saat reveal)
  timer: NodeJS.Timeout | null;
  nextTimer: NodeJS.Timeout | null;
  stopped: boolean;
}

// ponytail: sesi in-memory — worker restart memutus kuis berjalan; persist ke Redis jika butuh survive restart
const sessions = new Map<string, QuizSession>(); // key `${botId}:${guildId}`

const sessionKey = (botId: number, guildId: string): string => `${botId}:${guildId}`;

function topScores(s: QuizSession, n: number): string {
  return [...s.scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, p], i) => `**${i + 1}.** ${s.names.get(id) ?? `<@${id}>`} — ${p} poin`)
    .join('\n');
}

function questionRow(s: QuizSession, q: QuizQuestion): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    q.choices.map((_, i) => new ButtonBuilder()
      .setCustomId(`quiz:${s.index}:${i}`)
      .setLabel(letter(i))
      .setStyle(ButtonStyle.Primary)),
  );
}

/** Baris tombol terkunci untuk pesan final: benar hijau, salah merah, semua disabled. */
function lockedRow(q: QuizQuestion): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    q.choices.map((_, i) => new ButtonBuilder()
      .setCustomId(`quiz:locked:${i}`)
      .setLabel(letter(i))
      .setStyle(i === q.correctIndex ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(true)),
  );
}

async function nextQuestion(ctx: ModuleCtx, s: QuizSession): Promise<void> {
  const config = cfg(ctx.config);
  s.index += 1;
  if (s.stopped || s.index >= s.questions.length) return endQuiz(ctx, s, 'kuis selesai 🎉');

  s.answers = new Map();
  const q = s.questions[s.index];
  const timeSec = config.timePerQuestionSec ?? 240;
  const endsAt = Math.floor((Date.now() + timeSec * 1000) / 1000); // countdown hidup di klien Discord
  const embed: APIEmbed = {
    title: config.title,
    description: [
      q.question,
      '',
      ...q.choices.map((c, i) => `**${letter(i)}.** ${c}`),
      '',
      `⏳ Waktu menjawab: **${fmtDuration(timeSec)}** (berakhir <t:${endsAt}:R>)`,
    ].join('\n'),
    color: ACCENT,
    footer: { text: `Soal ${s.index + 1}/${s.questions.length} • klik tombol untuk menjawab` },
  };

  const ch = await ctx.client.channels.fetch(s.channelId).catch(() => null);
  if (!ch?.isTextBased() || !('send' in ch)) return endQuiz(ctx, s, 'kanal tidak tersedia');
  const msg = await ch.send({ content: '<@&1555168151656996904>', embeds: [embed], components: [questionRow(s, q)] })
    .catch((e) => { recordError(ctx.botId, e); return null; });
  if (!msg) return endQuiz(ctx, s, 'gagal mengirim soal');

  s.message = msg;
  s.timer = setTimeout(() => { void reveal(ctx, s).catch((e) => recordError(ctx.botId, e)); }, timeSec * 1000);
}

async function reveal(ctx: ModuleCtx, s: QuizSession): Promise<void> {
  const config = cfg(ctx.config);
  const q = s.questions[s.index];
  const points = config.pointsPerQuestion ?? 100;
  const winners = [...s.answers.entries()].filter(([, c]) => c === q.correctIndex).map(([id]) => id);
  const totalPoints = winners.length * points;

  for (const userId of winners) {
    s.scores.set(userId, (s.scores.get(userId) ?? 0) + points);
    await db.insert(guildMembers)
      .values({ botId: ctx.botId, discordGuildId: ctx.guild.id, discordUserId: userId, quizScore: points })
      .onConflictDoUpdate({
        target: [guildMembers.botId, guildMembers.discordGuildId, guildMembers.discordUserId],
        set: { quizScore: sql`${guildMembers.quizScore} + ${points}` },
      }).catch((e) => recordError(ctx.botId, e));
  }

  const lines: string[] = [q.question, ''];
  lines.push(...q.choices.map((c, i) => `**${letter(i)}.** ${c}`));
  lines.push('', '⏰ **Waktu habis!**');
  if (winners.length > 0) {
    const mentions = winners.map((id) => `<@${id}>`).join(', ');
    lines.push(`🎉 Selamat kepada ${mentions} telah menjawab dengan benar dan mendapatkan **${fmtNum(totalPoints)} ${config.pointsName}**!`);
  } else {
    lines.push('😔 Tidak ada yang menjawab dengan benar.');
  }
  lines.push(`Jawaban yang benar adalah **${letter(q.correctIndex)}. ${q.choices[q.correctIndex]}**.`);
  if (q.explanation) lines.push(`💡 **Penjelasan:** *${q.explanation}*`);

  const msg = s.message;
  s.message = null;
  logger.info({ botId: ctx.botId, index: s.index, adaMsg: !!msg }, 'reveal: mulai');
  if (msg) {
    await msg.edit({
      embeds: [{
        title: config.title,
        description: lines.join('\n').slice(0, 4000),
        color: winners.length > 0 ? GREEN : RED,
        footer: { text: `Soal ${s.index + 1}/${s.questions.length}` },
      }],
      components: [lockedRow(q)],
    }).then(() => logger.info({ botId: ctx.botId }, 'reveal: edit berhasil'))
      .catch((e) => logger.error({ botId: ctx.botId, err: e instanceof Error ? e.message : String(e) }, 'reveal: edit GAGAL'));
  }

  // 1 soal per sesi — setelah reveal, sesi dibersihkan agar !quiz start berikutnya langsung bisa jalan.
  if (s.timer) clearTimeout(s.timer);
  if (s.nextTimer) clearTimeout(s.nextTimer);
  s.stopped = true;
  sessions.delete(sessionKey(ctx.botId, ctx.guild.id));
}

async function endQuiz(ctx: ModuleCtx, s: QuizSession, reason: string): Promise<void> {
  if (s.timer) clearTimeout(s.timer);
  if (s.nextTimer) clearTimeout(s.nextTimer);
  s.stopped = true;
  sessions.delete(sessionKey(ctx.botId, ctx.guild.id));

  const board = topScores(s, 5);
  const embed: APIEmbed = {
    title: `🏁 ${cfg(ctx.config).title} — Selesai`,
    description: `Alasan: ${reason}`,
    color: ACCENT,
    fields: [{ name: 'Skor Akhir (top 5)', value: board || 'Tidak ada jawaban benar — coba lagi!' }],
  };
  const ch = await ctx.client.channels.fetch(s.channelId).catch(() => null);
  if (ch?.isTextBased() && 'send' in ch) await ch.send({ embeds: [embed] }).catch(() => {});
}

async function startQuiz(
  ctx: ModuleCtx, channel: TextChannel, starter: GuildMember,
  reply: (s: string) => Promise<unknown>,
): Promise<void> {
  const key = sessionKey(ctx.botId, ctx.guild.id);
  if (sessions.has(key)) { await reply('❌ Masih ada kuis berjalan di server ini. `/quiz stop` dulu.'); return; }

  // 1 soal per sesi — ambil satu soal acak dari DB, bukan seluruh bank.
  const q = await randomQuestion(ctx.botId, ctx.guild.id);
  if (!q) { await reply('❌ Belum ada soal. Tambahkan soal lewat dashboard (modul Quiz), lalu Save.'); return; }
  const questions = [q];
  const session: QuizSession = {
    channelId: channel.id, starterId: starter.id, questions, index: -1,
    scores: new Map(), names: new Map(), answers: new Map(),
    message: null, timer: null, nextTimer: null, stopped: false,
  };
  sessions.set(key, session);
  await nextQuestion(ctx, session);
}

const quizCmd: ModuleCommand = {
  name: 'quiz',
  description: 'Kuis interaktif: start, stop, leaderboard',
  args: [{ name: 'action', type: 'string' }, { name: 'rest', type: 'string', rest: true }],
  buildSlash: () => new SlashCommandBuilder()
    .setName('quiz').setDescription('Kuis interaktif')
    .addSubcommand((sc) => sc.setName('start').setDescription('Mulai kuis di channel ini'))
    .addSubcommand((sc) => sc.setName('stop').setDescription('Hentikan kuis berjalan'))
    .addSubcommand((sc) => sc.setName('leaderboard').setDescription('Top 10 skor kuis sepanjang masa'))
    .toJSON(),
  async execute(ctx: CommandContext, args: Record<string, unknown>) {
    if (!ctx.guild || !ctx.member) return ctx.reply('❌ Command ini hanya untuk server.');
    const action = String(args.action ?? 'start').toLowerCase();
    const key = sessionKey(ctx.botId, ctx.guild.id);
    const modCtx: ModuleCtx = { client: ctx.client, botId: ctx.botId, guild: ctx.guild, config: ctx.config };

    if (action === 'start') {
      if (!ctx.channel || !('send' in ctx.channel)) return ctx.reply('❌ Pakai command ini di channel teks server.');
      return startQuiz(modCtx, ctx.channel as TextChannel, ctx.member, (s) => ctx.reply(s));
    }

    if (action === 'stop') {
      const s = sessions.get(key);
      if (!s) return ctx.reply('❌ Tidak ada kuis berjalan.');
      if (s.starterId !== ctx.user.id && !ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return ctx.reply('❌ Hanya pemandu kuis atau izin Manage Server yang bisa menghentikan.');
      }
      await endQuiz(modCtx, s, `dihentikan oleh ${ctx.user.tag}`);
      return ctx.reply('🏁 Kuis dihentikan.');
    }

    if (action === 'leaderboard') {
      const rows = await db.select().from(guildMembers)
        .where(and(
          eq(guildMembers.botId, ctx.botId),
          eq(guildMembers.discordGuildId, ctx.guild.id),
          gt(guildMembers.quizScore, 0),
        ))
        .orderBy(desc(guildMembers.quizScore)).limit(10);
      if (rows.length === 0) return ctx.reply('Belum ada skor kuis. Main `/quiz start` dulu!');
      const lines = rows.map((r, i) => `**${i + 1}.** <@${r.discordUserId}> — ${r.quizScore} poin`);
      return ctx.reply({ embeds: [{ title: '🏆 Leaderboard Kuis', description: lines.join('\n'), color: ACCENT }] });
    }

    return ctx.reply('Pakai: `/quiz start`, `/quiz stop`, `/quiz leaderboard`.');
  },
};

export const quizModule: BotModule = {
  name: 'quiz',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  commands: [quizCmd],
  async onInteraction(ctx: ModuleCtx, interaction: Interaction) {
    if (!interaction.isButton() || !interaction.channelId) return;
    const m = interaction.customId.match(/^quiz:(\d+):(\d+)$/);
    if (!m) return;

    const s = sessions.get(sessionKey(ctx.botId, ctx.guild.id));
    if (!s || s.channelId !== interaction.channelId) return; // tombol sisa sesi lama — abaikan
    const qIdx = Number(m[1]);
    if (qIdx !== s.index || !s.message) return; // soal sudah di-reveal / pesan sudah dihapus

    const choice = Number(m[2]);
    const q = s.questions[s.index];
    if (choice < 0 || choice >= q.choices.length) return;

    if (s.answers.has(interaction.user.id)) {
      return void interaction.reply({ content: '⚠️ Kamu sudah menjawab soal ini.', ephemeral: true }).catch(() => {});
    }
    s.answers.set(interaction.user.id, choice);
    s.names.set(interaction.user.id, interaction.user.tag);
    await interaction.reply({ content: '📩 Jawaban tercatat. Tunggu waktu habis!', ephemeral: true }).catch(() => {});
  },
};
