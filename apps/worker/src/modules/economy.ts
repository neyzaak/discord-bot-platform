import {
  GatewayIntentBits, SlashCommandBuilder, type GuildMember,
} from 'discord.js';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, guildMembers, recordError } from '@platform/core';
import type { BotModule, ModuleCommand } from './types';

const ACCENT = 0xfee75c;
const MAX_TRANSFER = 100_000;

interface EcoCfg {
  enabled: boolean; currencyName: string; dailyAmount: number;
  workMin: number; workMax: number; workCooldownSec: number;
  shop: Array<{ name: string; price: number; roleId: string }>;
}
const cfg = (c: Record<string, unknown>): EcoCfg => c as unknown as EcoCfg;

const uq = (botId: number, guildId: string, userId: string) =>
  and(eq(guildMembers.botId, botId), eq(guildMembers.discordGuildId, guildId), eq(guildMembers.discordUserId, userId));

async function getRow(botId: number, guildId: string, userId: string) {
  const [row] = await db.select().from(guildMembers).where(uq(botId, guildId, userId));
  return row ?? null;
}

async function credit(botId: number, guildId: string, userId: string, amount: number): Promise<void> {
  await db.insert(guildMembers)
    .values({ botId, discordGuildId: guildId, discordUserId: userId, balance: amount })
    .onConflictDoUpdate({
      target: [guildMembers.botId, guildMembers.discordGuildId, guildMembers.discordUserId],
      set: { balance: sql`${guildMembers.balance} + ${amount}` },
    });
}

async function debit(botId: number, guildId: string, userId: string, amount: number): Promise<boolean> {
  const rows = await db.update(guildMembers)
    .set({ balance: sql`${guildMembers.balance} - ${amount}` })
    .where(and(uq(botId, guildId, userId), gte(guildMembers.balance, amount)))
    .returning({ id: guildMembers.id });
  return rows.length > 0;
}

const fmt = (n: number, name: string) => `**${n}** ${name}`;

const balance: ModuleCommand = {
  name: 'balance', description: 'Cek dompet', args: [{ name: 'user', type: 'user' }],
  buildSlash: () => new SlashCommandBuilder().setName('balance').setDescription('Cek dompet')
    .addUserOption((o) => o.setName('user').setDescription('User (kosong = dirimu)')).toJSON(),
  async execute(ctx, args) {
    if (!ctx.guild) return ctx.reply('❌ Hanya di server.');
    const target = (args.user as GuildMember | null)?.user ?? ctx.user;
    const row = await getRow(ctx.botId, ctx.guild.id, target.id);
    await ctx.reply(`💰 Dompet ${target.tag}: ${fmt(row?.balance ?? 0, cfg(ctx.config).currencyName ?? 'koin')}`);
  },
};

const daily: ModuleCommand = {
  name: 'daily', description: 'Klaim hadiah harian', args: [],
  buildSlash: () => new SlashCommandBuilder().setName('daily').setDescription('Klaim hadiah harian').toJSON(),
  async execute(ctx) {
    if (!ctx.guild || !ctx.member) return ctx.reply('❌ Hanya di server.');
    const config = cfg(ctx.config);
    const row = await getRow(ctx.botId, ctx.guild.id, ctx.user.id);
    const last = row?.lastDailyAt?.getTime() ?? 0;
    if (Date.now() - last < 24 * 3600 * 1000) {
      const nextAt = Math.floor((last + 24 * 3600 * 1000) / 1000);
      return ctx.reply(`⏳ Sudah klaim hari ini. Kembali <t:${nextAt}:R>.`);
    }
    const now = new Date();
    await db.insert(guildMembers)
      .values({ botId: ctx.botId, discordGuildId: ctx.guild.id, discordUserId: ctx.user.id, balance: config.dailyAmount ?? 100, lastDailyAt: now })
      .onConflictDoUpdate({
        target: [guildMembers.botId, guildMembers.discordGuildId, guildMembers.discordUserId],
        set: { balance: sql`${guildMembers.balance} + ${config.dailyAmount ?? 100}`, lastDailyAt: now },
      });
    await ctx.reply(`🎁 Daily klaim: +${fmt(config.dailyAmount ?? 100, config.currencyName ?? 'koin')}`);
  },
};

const work: ModuleCommand = {
  name: 'work', description: 'Bekerja untuk koin', args: [],
  buildSlash: () => new SlashCommandBuilder().setName('work').setDescription('Bekerja untuk koin').toJSON(),
  async execute(ctx) {
    if (!ctx.guild || !ctx.member) return ctx.reply('❌ Hanya di server.');
    const config = cfg(ctx.config);
    const row = await getRow(ctx.botId, ctx.guild.id, ctx.user.id);
    const cd = (config.workCooldownSec ?? 3600) * 1000;
    const last = row?.lastWorkAt?.getTime() ?? 0;
    if (Date.now() - last < cd) {
      const nextAt = Math.floor((last + cd) / 1000);
      return ctx.reply(`⏳ Capek dulu... kembali <t:${nextAt}:R>.`);
    }
    const amount = (config.workMin ?? 10) + Math.floor(Math.random() * Math.max(1, (config.workMax ?? 50) - (config.workMin ?? 10) + 1));
    const now = new Date();
    await db.insert(guildMembers)
      .values({ botId: ctx.botId, discordGuildId: ctx.guild.id, discordUserId: ctx.user.id, balance: amount, lastWorkAt: now })
      .onConflictDoUpdate({
        target: [guildMembers.botId, guildMembers.discordGuildId, guildMembers.discordUserId],
        set: { balance: sql`${guildMembers.balance} + ${amount}`, lastWorkAt: now },
      });
    await ctx.reply(`🔧 Kamu bekerja dan mendapat +${fmt(amount, config.currencyName ?? 'koin')}`);
  },
};

const transfer: ModuleCommand = {
  name: 'transfer', description: 'Transfer koin ke user lain', args: [{ name: 'user', type: 'user' }, { name: 'amount', type: 'int' }],
  buildSlash: () => new SlashCommandBuilder().setName('transfer').setDescription('Transfer koin')
    .addUserOption((o) => o.setName('user').setDescription('Penerima').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Jumlah (maks 100.000)').setMinValue(1).setMaxValue(MAX_TRANSFER).setRequired(true)).toJSON(),
  async execute(ctx, args) {
    if (!ctx.guild || !ctx.member) return ctx.reply('❌ Hanya di server.');
    const config = cfg(ctx.config);
    const amount = Number(args.amount ?? 0);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_TRANSFER) return ctx.reply(`❌ Jumlah 1–${MAX_TRANSFER}.`);
    const target = args.user as GuildMember | null;
    if (!target) return ctx.reply('❌ User tidak ditemukan.');
    if (target.id === ctx.user.id) return ctx.reply('❌ Tidak bisa transfer ke dirimu sendiri.');
    if (target.user.bot) return ctx.reply('❌ Tidak bisa transfer ke bot.');

    if (!(await debit(ctx.botId, ctx.guild.id, ctx.user.id, amount))) {
      return ctx.reply(`❌ Saldo tidak cukup (butuh ${fmt(amount, config.currencyName ?? 'koin')}).`);
    }
    await credit(ctx.botId, ctx.guild.id, target.id, amount);
    await ctx.reply(`✅ ${fmt(amount, config.currencyName ?? 'koin')} -> <@${target.id}>`);
  },
};

const shop: ModuleCommand = {
  name: 'shop', description: 'Lihat toko', args: [],
  buildSlash: () => new SlashCommandBuilder().setName('shop').setDescription('Lihat toko').toJSON(),
  async execute(ctx) {
    const items = cfg(ctx.config).shop ?? [];
    if (items.length === 0) return ctx.reply('🛒 Toko masih kosong. Atur di dashboard.');
    const lines = items.map((it, i) => `**${i + 1}.** ${it.name} — ${fmt(it.price, cfg(ctx.config).currencyName ?? 'koin')} -> <@&${it.roleId}>`);
    await ctx.reply({ embeds: [{ title: '🛒 Toko', description: lines.join('\n'), color: ACCENT, footer: { text: 'Beli: /buy <nomor atau nama>' } }] });
  },
};

const buy: ModuleCommand = {
  name: 'buy', description: 'Beli item dari toko', args: [{ name: 'item', type: 'string', rest: true }],
  buildSlash: () => new SlashCommandBuilder().setName('buy').setDescription('Beli item toko')
    .addStringOption((o) => o.setName('item').setDescription('Nomor atau nama item').setRequired(true).setMaxLength(32)).toJSON(),
  async execute(ctx, args) {
    if (!ctx.guild || !ctx.member) return ctx.reply('❌ Hanya di server.');
    const config = cfg(ctx.config);
    const items = config.shop ?? [];
    const q = String(args.item ?? '').trim().toLowerCase();
    if (!q) return ctx.reply('❌ Sebutkan nomor/nama item dari `/shop`.');
    const item = /^\d+$/.test(q) ? items[Number(q) - 1] : items.find((it) => it.name.toLowerCase() === q);
    if (!item) return ctx.reply('❌ Item tidak ditemukan. Lihat `/shop`.');

    if (!(await debit(ctx.botId, ctx.guild.id, ctx.user.id, item.price))) {
      return ctx.reply(`❌ Saldo tidak cukup (butuh ${fmt(item.price, config.currencyName ?? 'koin')}).`);
    }
    try {
      await ctx.member.roles.add(item.roleId, `beli item ${item.name}`);
    } catch (e) {
      await credit(ctx.botId, ctx.guild.id, ctx.user.id, item.price); // refund
      await recordError(ctx.botId, e);
      return ctx.reply('❌ Gagal memberi role (cek posisi role bot). Saldo dikembalikan.');
    }
    await ctx.reply(`🛍️ Berhasil membeli **${item.name}**! Role diberikan.`);
  },
};

export const economyModule: BotModule = {
  name: 'economy',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  commands: [balance, daily, work, transfer, shop, buy],
};
