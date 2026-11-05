import {
  GatewayIntentBits, PermissionFlagsBits, SlashCommandBuilder,
  type GuildMember,
} from 'discord.js';
import { recordError } from '@platform/core';
import type { BotModule, CommandContext, ModuleCommand } from './types';

function hasGate(member: GuildMember | null, config: Record<string, unknown>, perm: bigint): boolean {
  if (!member) return false;
  const modRole = config.moderatorRoleId;
  if (typeof modRole === 'string' && modRole && member.roles.cache.has(modRole)) return true;
  return member.permissions.has(perm);
}

function guard(ctx: CommandContext, perm: bigint): string | null {
  if (!ctx.guild || !ctx.member) return '❌ Command ini hanya bisa dipakai di server.';
  if (!hasGate(ctx.member, ctx.config, perm)) return '❌ Kamu tidak punya izin untuk command ini.';
  return null;
}

function aboveTarget(ctx: CommandContext, target: GuildMember): boolean {
  if (!ctx.guild || !ctx.member) return false;
  return ctx.member.id === ctx.guild.ownerId || ctx.member.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

async function sendModLog(ctx: CommandContext, title: string, description: string): Promise<void> {
  const channelId = ctx.config.modLogChannelId;
  if (typeof channelId !== 'string' || !channelId) return;
  const channel = await ctx.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !('send' in channel)) return;
  await channel.send({ embeds: [{ title, description, color: 0xed4245 }] }).catch((e) => recordError(ctx.botId, e));
}

const userArg = { name: 'user', type: 'user' as const };
const reasonArg = { name: 'reason', type: 'string' as const };

const kick: ModuleCommand = {
  name: 'kick',
  description: 'Kick member dari server',
  requiredPermission: PermissionFlagsBits.KickMembers,
  args: [userArg, { ...reasonArg, rest: true }],
  buildSlash: () => new SlashCommandBuilder()
    .setName('kick').setDescription('Kick member dari server')
    .addUserOption((o) => o.setName('user').setDescription('Member yang di-kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Alasan'))
    .toJSON(),
  async execute(ctx, args) {
    const denied = guard(ctx, PermissionFlagsBits.KickMembers);
    if (denied) return ctx.reply(denied);
    const target = args.user as GuildMember | null;
    if (!target) return ctx.reply('❌ Member tidak ditemukan.');
    if (!aboveTarget(ctx, target)) return ctx.reply('❌ Posisi rolemu harus di atas target.');
    if (!target.kickable) return ctx.reply('❌ Saya tidak bisa kick member itu (cek role/hierarki bot).');
    const reason = String(args.reason ?? '');
    await target.kick(reason ? `${reason} — oleh ${ctx.user.tag}` : `oleh ${ctx.user.tag}`);
    await ctx.reply(`✅ **${target.user.tag}** di-kick.${reason ? `\nAlasan: ${reason}` : ''}`);
    await sendModLog(ctx, 'Member di-kick', `**${target.user.tag}** di-kick oleh ${ctx.user.tag}${reason ? `\nAlasan: ${reason}` : ''}`);
  },
};

const ban: ModuleCommand = {
  name: 'ban',
  description: 'Ban member dari server',
  requiredPermission: PermissionFlagsBits.BanMembers,
  args: [userArg, { ...reasonArg, rest: true }],
  buildSlash: () => new SlashCommandBuilder()
    .setName('ban').setDescription('Ban member dari server')
    .addUserOption((o) => o.setName('user').setDescription('Member yang di-ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Alasan'))
    .toJSON(),
  async execute(ctx, args) {
    const denied = guard(ctx, PermissionFlagsBits.BanMembers);
    if (denied) return ctx.reply(denied);
    const target = args.user as GuildMember | null;
    if (!target) return ctx.reply('❌ Member tidak ditemukan.');
    if (!aboveTarget(ctx, target)) return ctx.reply('❌ Posisi rolemu harus di atas target.');
    if (!target.bannable) return ctx.reply('❌ Saya tidak bisa ban member itu (cek role/hierarki bot).');
    const reason = String(args.reason ?? '');
    await target.ban({ reason: reason ? `${reason} — oleh ${ctx.user.tag}` : `oleh ${ctx.user.tag}` });
    await ctx.reply(`✅ **${target.user.tag}** di-ban.${reason ? `\nAlasan: ${reason}` : ''}`);
    await sendModLog(ctx, 'Member di-ban', `**${target.user.tag}** di-ban oleh ${ctx.user.tag}${reason ? `\nAlasan: ${reason}` : ''}`);
  },
};

const timeout: ModuleCommand = {
  name: 'timeout',
  description: 'Beri timeout pada member (detik)',
  requiredPermission: PermissionFlagsBits.ModerateMembers,
  args: [userArg, { name: 'duration', type: 'int' }, { ...reasonArg, rest: true }],
  buildSlash: () => new SlashCommandBuilder()
    .setName('timeout').setDescription('Beri timeout pada member')
    .addUserOption((o) => o.setName('user').setDescription('Member yang di-timeout').setRequired(true))
    .addIntegerOption((o) => o.setName('duration').setDescription('Durasi dalam detik (maks 28 hari)')
      .setMinValue(10).setMaxValue(2_419_200).setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Alasan'))
    .toJSON(),
  async execute(ctx, args) {
    const denied = guard(ctx, PermissionFlagsBits.ModerateMembers);
    if (denied) return ctx.reply(denied);
    const target = args.user as GuildMember | null;
    if (!target) return ctx.reply('❌ Member tidak ditemukan.');
    if (!aboveTarget(ctx, target)) return ctx.reply('❌ Posisi rolemu harus di atas target.');
    if (!target.moderatable) return ctx.reply('❌ Saya tidak bisa memberi timeout pada member itu.');
    const sec = Number(args.duration ?? 0);
    if (!Number.isFinite(sec) || sec < 10 || sec > 2_419_200) return ctx.reply('❌ Durasi 10–2419200 detik (maks 28 hari).');
    const reason = String(args.reason ?? '');
    await target.timeout(sec * 1000, reason ? `${reason} — oleh ${ctx.user.tag}` : `oleh ${ctx.user.tag}`);
    await ctx.reply(`✅ **${target.user.tag}** di-timeout ${sec} detik.${reason ? `\nAlasan: ${reason}` : ''}`);
    await sendModLog(ctx, 'Member di-timeout', `**${target.user.tag}** di-timeout ${sec}s oleh ${ctx.user.tag}${reason ? `\nAlasan: ${reason}` : ''}`);
  },
};

const clear: ModuleCommand = {
  name: 'clear',
  description: 'Hapus pesan massal di channel (maks 100)',
  requiredPermission: PermissionFlagsBits.ManageMessages,
  args: [{ name: 'amount', type: 'int' }],
  buildSlash: () => new SlashCommandBuilder()
    .setName('clear').setDescription('Hapus pesan massal di channel')
    .addIntegerOption((o) => o.setName('amount').setDescription('Jumlah pesan (1–100)')
      .setMinValue(1).setMaxValue(100).setRequired(true))
    .toJSON(),
  async execute(ctx, args) {
    const denied = guard(ctx, PermissionFlagsBits.ManageMessages);
    if (denied) return ctx.reply(denied);
    const ch = ctx.channel as { bulkDelete?: (n: number, f: boolean) => Promise<{ size: number }> } | null;
    if (typeof ch?.bulkDelete !== 'function') return ctx.reply('❌ Command ini hanya bisa dipakai di channel teks server.');
    const amount = Number(args.amount ?? 0);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) return ctx.reply('❌ Jumlah harus 1–100.');
    const deleted = await ch.bulkDelete(amount, true);
    await ctx.reply(`🧹 ${deleted.size} pesan dihapus.`);
    await sendModLog(ctx, 'Pesan dibersihkan', `${deleted.size} pesan dihapus oleh ${ctx.user.tag} di <#${ctx.channel?.id ?? '0'}>`);
  },
};

export const moderationModule: BotModule = {
  name: 'moderation',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  commands: [kick, ban, timeout, clear],
};
