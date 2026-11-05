import {
  GatewayIntentBits, SlashCommandBuilder,
  type APIEmbed, type GuildMember, type Message,
} from 'discord.js';
import { and, desc, eq } from 'drizzle-orm';
import { db, guildMembers, recordError, redis, renderTemplate } from '@platform/core';
import type { BotModule, ModuleCommand, ModuleCtx } from './types';

const ACCENT = 0x57f287;
const xpForLevel = (level: number): number => 100 * level * level;
const levelForXp = (xp: number): number => Math.floor(Math.sqrt(xp / 100));

interface LevelCfg {
  enabled: boolean; xpMin: number; xpMax: number; cooldownSec: number;
  announceChannelId: string; levelUpMessage: string;
  roleRewards: Array<{ level: number; roleId: string }>;
}
const cfg = (c: Record<string, unknown>): LevelCfg => c as unknown as LevelCfg;

const memberKey = (botId: number, guildId: string, userId: string) =>
  and(eq(guildMembers.botId, botId), eq(guildMembers.discordGuildId, guildId), eq(guildMembers.discordUserId, userId));

async function grantLevelUp(ctx: ModuleCtx, member: GuildMember, newLevel: number): Promise<void> {
  const config = cfg(ctx.config);
  for (const r of config.roleRewards ?? []) {
    if (newLevel >= r.level && !member.roles.cache.has(r.roleId)) {
      await member.roles.add(r.roleId, `level reward ${r.level}`).catch((e) => recordError(ctx.botId, e));
    }
  }
  if (config.announceChannelId) {
    const ch = await ctx.client.channels.fetch(config.announceChannelId).catch(() => null);
    if (ch?.isTextBased() && 'send' in ch) {
      await ch.send({
        content: renderTemplate(config.levelUpMessage, { user: `<@${member.id}>`, level: String(newLevel) }),
        allowedMentions: { parse: [], users: [member.id] },
      }).catch((e) => recordError(ctx.botId, e));
    }
  }
}

async function addXp(ctx: ModuleCtx, message: Message): Promise<void> {
  const config = cfg(ctx.config);
  const member = message.member;
  if (!message.guild || !member || member.user.bot) return;

  // Cooldown via Redis — gagal = fail-open (XP tetap dihitung)
  const cdKey = `xp:${ctx.botId}:${message.guild.id}:${member.id}`;
  const fresh = await redis.set(cdKey, '1', 'EX', Math.max(1, config.cooldownSec ?? 60), 'NX').catch(() => 'OK');
  if (fresh !== 'OK') return;

  const gain = config.xpMin + Math.floor(Math.random() * Math.max(1, (config.xpMax ?? config.xpMin) - config.xpMin + 1));
  const [row] = await db.select().from(guildMembers).where(memberKey(ctx.botId, message.guild.id, member.id));
  const newXp = (row?.xp ?? 0) + gain;
  const newLevel = levelForXp(newXp);

  await db.insert(guildMembers)
    .values({ botId: ctx.botId, discordGuildId: message.guild.id, discordUserId: member.id, xp: newXp, level: newLevel, lastXpAt: new Date() })
    .onConflictDoUpdate({
      target: [guildMembers.botId, guildMembers.discordGuildId, guildMembers.discordUserId],
      set: { xp: newXp, level: newLevel, lastXpAt: new Date() },
    });

  if (newLevel > (row?.level ?? 0)) await grantLevelUp(ctx, member, newLevel);
}

async function rankEmbed(botId: number, guildId: string, targetUserId: string, targetTag: string): Promise<APIEmbed> {
  const [row] = await db.select().from(guildMembers).where(memberKey(botId, guildId, targetUserId));
  const xp = row?.xp ?? 0;
  const level = levelForXp(xp);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const filled = Math.round(10 * ((xp - cur) / Math.max(1, next - cur)));
  const bar = '█'.repeat(Math.max(0, Math.min(10, filled))) + '░'.repeat(10 - Math.max(0, Math.min(10, filled)));
  return {
    title: `📊 Rank ${targetTag}`,
    color: ACCENT,
    fields: [
      { name: 'Level', value: String(level), inline: true },
      { name: 'XP', value: `${xp} / ${next}`, inline: true },
      { name: 'Progres', value: `\`${bar}\``, inline: false },
    ],
  };
}

const rank: ModuleCommand = {
  name: 'rank', description: 'Lihat rank XP kamu / user lain', args: [{ name: 'user', type: 'user' }],
  buildSlash: () => new SlashCommandBuilder().setName('rank').setDescription('Lihat rank XP')
    .addUserOption((o) => o.setName('user').setDescription('User (kosong = dirimu)')).toJSON(),
  async execute(ctx, args) {
    if (!ctx.guild) return ctx.reply('❌ Hanya di server.');
    const target = (args.user as GuildMember | null)?.user ?? ctx.user;
    await ctx.reply({ embeds: [await rankEmbed(ctx.botId, ctx.guild.id, target.id, target.tag)] });
  },
};

const leaderboard: ModuleCommand = {
  name: 'leaderboard', description: 'Top 10 XP server', args: [],
  buildSlash: () => new SlashCommandBuilder().setName('leaderboard').setDescription('Top 10 XP server').toJSON(),
  async execute(ctx) {
    if (!ctx.guild) return ctx.reply('❌ Hanya di server.');
    const rows = await db.select().from(guildMembers)
      .where(and(eq(guildMembers.botId, ctx.botId), eq(guildMembers.discordGuildId, ctx.guild.id)))
      .orderBy(desc(guildMembers.xp)).limit(10);
    if (rows.length === 0) return ctx.reply('Belum ada data XP. Chat dulu! 💬');
    const lines = rows.map((r, i) => `**${i + 1}.** <@${r.discordUserId}> — Lv ${r.level} (${r.xp} XP)`);
    await ctx.reply({ embeds: [{ title: '🏆 Leaderboard XP', description: lines.join('\n'), color: ACCENT }] });
  },
};

export const levelingModule: BotModule = {
  name: 'leveling',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  commands: [rank, leaderboard],
  async onMessage(ctx: ModuleCtx, message: Message) {
    await addXp(ctx, message);
  },
};
