import {
  GatewayIntentBits,
  type APIEmbed, type GuildMember, type Message, type PartialGuildMember, type PartialMessage,
} from 'discord.js';
import { recordError } from '@platform/core';
import type { BotModule, ModuleCtx } from './types';

const COLORS = { delete: 0xed4245, edit: 0xfee75c, join: 0x57f287, leave: 0xed4245, roles: 0x5865f2 };

async function sendLog(ctx: ModuleCtx, embed: APIEmbed): Promise<void> {
  const id = ctx.config.channelId;
  if (typeof id !== 'string' || !id) return;
  const ch = await ctx.client.channels.fetch(id).catch(() => null);
  if (!ch?.isTextBased() || !('send' in ch)) return;
  await ch.send({ embeds: [embed] }).catch((e) => recordError(ctx.botId, e));
}

const fmt = (s: string | null | undefined): string =>
  s ? (s.replace(/```/g, '```​').slice(0, 900) || '(kosong)') : '(kosong)';

export const loggingModule: BotModule = {
  name: 'logging',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers],
  commands: [],
  async onMessageDelete(ctx, message) {
    if (!ctx.config.logMessageDelete) return;
    if (message.partial || !message.author || message.author.bot) return;
    await sendLog(ctx, {
      title: '🗑️ Pesan Dihapus',
      color: COLORS.delete,
      fields: [
        { name: 'Penulis', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
        { name: 'Kanal', value: `<#${message.channelId}>`, inline: true },
        { name: 'Isi', value: fmt(message.content) },
      ],
    });
  },
  async onMessageUpdate(ctx, oldMsg, newMsg) {
    if (!ctx.config.logMessageEdit) return;
    if (newMsg.partial || !newMsg.author || newMsg.author.bot) return;
    if (oldMsg.partial || oldMsg.content === newMsg.content) return;
    await sendLog(ctx, {
      title: '✏️ Pesan Diedit',
      color: COLORS.edit,
      fields: [
        { name: 'Penulis', value: `<@${newMsg.author!.id}> (${newMsg.author!.tag})`, inline: true },
        { name: 'Kanal', value: `<#${newMsg.channelId}>`, inline: true },
        { name: 'Sebelum', value: fmt(oldMsg.content) },
        { name: 'Sesudah', value: fmt(newMsg.content) },
      ],
    });
  },
  async onMemberAdd(ctx, member: GuildMember) {
    if (!ctx.config.logMemberJoin) return;
    await sendLog(ctx, {
      title: '📥 Member Bergabung',
      color: COLORS.join,
      description: `<@${member.id}> (${member.user.tag})\nTotal anggota: ${member.guild.memberCount}`,
    });
  },
  async onMemberRemove(ctx, member: GuildMember | PartialGuildMember) {
    if (!ctx.config.logMemberLeave) return;
    await sendLog(ctx, {
      title: '📤 Member Keluar',
      color: COLORS.leave,
      description: `<@${member.id}> (${member.user?.tag ?? member.id})\nTotal anggota: ${member.guild.memberCount}`,
    });
  },
  async onMemberUpdate(ctx, oldMember, newMember: GuildMember) {
    if (!ctx.config.logRoleChange || oldMember.partial) return;
    const added = [...newMember.roles.cache.values()].filter((r) => !oldMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
    const removed = [...oldMember.roles.cache.values()].filter((r) => !newMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
    if (added.length === 0 && removed.length === 0) return;
    await sendLog(ctx, {
      title: '🔧 Perubahan Role',
      color: COLORS.roles,
      description: `<@${newMember.id}> (${newMember.user.tag})`,
      fields: [
        ...(added.length ? [{ name: 'Ditambahkan', value: added.map((r) => `<@&${r.id}>`).join(', ').slice(0, 1000) }] : []),
        ...(removed.length ? [{ name: 'Dihapus', value: removed.map((r) => `<@&${r.id}>`).join(', ').slice(0, 1000) }] : []),
      ],
    });
  },
};
