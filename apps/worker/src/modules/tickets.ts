import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  GatewayIntentBits, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder,
  TextInputBuilder, TextInputStyle,
  type GuildMember, type Interaction, type TextChannel,
} from 'discord.js';
import { and, eq } from 'drizzle-orm';
import { db, recordError, tickets } from '@platform/core';
import type { BotModule, ModuleCommand, ModuleCtx } from './types';

interface TicketCfg {
  enabled: boolean; categoryId: string; staffRoleId: string;
  transcriptChannelId: string; maxOpenPerUser: number;
}
const cfg = (c: Record<string, unknown>): TicketCfg => c as unknown as TicketCfg;

const isGuildText = (ch: unknown): ch is TextChannel =>
  Boolean(ch) && typeof ch === 'object' && 'permissionOverwrites' in (ch as object);

function isStaff(member: GuildMember | null, config: TicketCfg): boolean {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return Boolean(config.staffRoleId && member.roles.cache.has(config.staffRoleId));
}

async function openCount(botId: number, guildId: string, userId: string): Promise<number> {
  const rows = await db.select({ id: tickets.id }).from(tickets).where(and(
    eq(tickets.botId, botId), eq(tickets.discordGuildId, guildId),
    eq(tickets.discordUserId, userId), eq(tickets.status, 'open')));
  return rows.length;
}

async function findOpenByChannel(botId: number, guildId: string, channelId: string) {
  const [row] = await db.select().from(tickets).where(and(
    eq(tickets.botId, botId), eq(tickets.discordGuildId, guildId),
    eq(tickets.discordChannelId, channelId), eq(tickets.status, 'open')));
  return row ?? null;
}

const closeRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId('ticket:close').setLabel('Tutup Tiket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
);

async function createTicket(
  ctx: ModuleCtx, member: GuildMember, subject: string,
  reply: (s: string) => Promise<unknown>,
): Promise<void> {
  const config = cfg(ctx.config);
  const max = Math.max(1, config.maxOpenPerUser ?? 1);
  if ((await openCount(ctx.botId, ctx.guild.id, member.id)) >= max) {
    return void reply(`❌ Maksimal ${max} tiket terbuka per user. Tutup tiketmu dulu.`);
  }
  const me = ctx.guild.members.me;
  if (!me) return void reply('❌ Bot belum siap, coba lagi sebentar.');

  const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles];
  const channel = await ctx.guild.channels.create({
    name: `ticket-${member.user.username}`.toLowerCase().slice(0, 100),
    type: ChannelType.GuildText,
    parent: config.categoryId || null,
    permissionOverwrites: [
      { id: ctx.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow },
      ...(config.staffRoleId ? [{ id: config.staffRoleId, allow }] : []),
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
    ],
  }).catch((e) => { recordError(ctx.botId, e); return null; });

  if (!channel || !('send' in channel)) return void reply('❌ Gagal membuat kanal tiket (cek kategori & izin bot).');

  await db.insert(tickets).values({
    botId: ctx.botId, discordGuildId: ctx.guild.id, discordChannelId: channel.id, discordUserId: member.id,
  });
  await (channel as TextChannel).send({
    content: `🎫 Tiket **${subject}** — pelanggan <@${member.id}>${config.staffRoleId ? `, staf <@&${config.staffRoleId}>` : ''}`,
    allowedMentions: { parse: ['users', 'roles'] },
    components: [closeRow()],
  });
  await reply(`✅ Tiket dibuat: <#${channel.id}>`);
}

// ponytail: transkrip maks 500 pesan terakhir (5 batch x 100); naikkan jika tiket panjang
async function closeTicket(
  ctx: ModuleCtx, channel: TextChannel, closedByTag: string,
  reply: (s: string) => Promise<unknown>,
): Promise<void> {
  const config = cfg(ctx.config);
  const ticket = await findOpenByChannel(ctx.botId, ctx.guild.id, channel.id);
  if (!ticket) return void reply('❌ Channel ini bukan kanal tiket aktif.');

  if (config.transcriptChannelId) {
    const lines: string[] = [];
    let before: string | undefined;
    for (let i = 0; i < 5; i++) {
      const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!batch || batch.size === 0) break;
      for (const m of batch.values()) lines.push(`[${m.createdAt.toISOString()}] ${m.author?.tag ?? '?'}: ${m.content}`);
      before = batch.last()!.id;
      if (batch.size < 100) break;
    }
    const tch = await ctx.client.channels.fetch(config.transcriptChannelId).catch(() => null);
    if (tch?.isTextBased() && 'send' in tch) {
      const file = new AttachmentBuilder(Buffer.from(lines.reverse().join('\n'), 'utf8'), { name: `transkrip-${channel.name}.txt` });
      await tch.send({ content: `📄 Transkrip tiket ${channel.name} (ditutup oleh ${closedByTag})`, files: [file] }).catch(() => {});
    }
  }

  await db.update(tickets).set({ status: 'closed', closedAt: new Date() }).where(eq(tickets.id, ticket.id));
  await reply(`🔒 Tiket ditutup oleh ${closedByTag}. Kanal dihapus 5 detik lagi.`);
  setTimeout(() => { void channel.delete(`tiket ditutup oleh ${closedByTag}`).catch(() => {}); }, 5000);
}

const ticketCmd: ModuleCommand = {
  name: 'ticket',
  description: 'Kelola tiket support: open, close, add',
  args: [
    { name: 'action', type: 'string' },
    { name: 'user', type: 'user' },
    { name: 'subject', type: 'string', rest: true },
  ],
  buildSlash: () => new SlashCommandBuilder()
    .setName('ticket').setDescription('Kelola tiket support')
    .addSubcommand((s) => s.setName('open').setDescription('Buka tiket baru')
      .addStringOption((o) => o.setName('subject').setDescription('Subjek (kosong = isi lewat form)').setMaxLength(200)))
    .addSubcommand((s) => s.setName('close').setDescription('Tutup tiket (di dalam kanal tiket)'))
    .addSubcommand((s) => s.setName('add').setDescription('Tambahkan user ke tiket (staf)')
      .addUserOption((o) => o.setName('user').setDescription('User yang ditambahkan').setRequired(true)))
    .toJSON(),
  async execute(ctx, args) {
    if (!ctx.guild || !ctx.member) return ctx.reply('❌ Command ini hanya untuk server.');
    const config = cfg(ctx.config);
    const action = String(args.action ?? '').toLowerCase();

    if (action === 'open') {
      const subject = String(args.subject ?? '').trim();
      if (!subject) {
        if (!ctx.showModal) return ctx.reply('❌ Tulis subjek: `!ticket open <subjek>`.');
        const modal = new ModalBuilder().setCustomId('ticket:modal').setTitle('Tiket Baru')
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('subject').setLabel('Subjek tiket')
              .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200),
          ));
        return void (await ctx.showModal(modal));
      }
      return createTicket(
        { client: ctx.client, botId: ctx.botId, guild: ctx.guild, config: ctx.config },
        ctx.member, subject, (s) => ctx.reply(s));
    }

    if (action === 'close') {
      if (!isGuildText(ctx.channel)) return ctx.reply('❌ Pakai command ini di dalam kanal tiket.');
      const ticket = await findOpenByChannel(ctx.botId, ctx.guild.id, ctx.channel.id);
      if (!ticket) return ctx.reply('❌ Channel ini bukan kanal tiket aktif.');
      if (ticket.discordUserId !== ctx.user.id && !isStaff(ctx.member, config)) {
        return ctx.reply('❌ Hanya pemilik tiket atau staf yang bisa menutup.');
      }
      return closeTicket(
        { client: ctx.client, botId: ctx.botId, guild: ctx.guild, config: ctx.config },
        ctx.channel, ctx.user.tag, (s) => ctx.reply(s));
    }

    if (action === 'add') {
      if (!isStaff(ctx.member, config)) return ctx.reply('❌ Hanya staf yang bisa menambahkan user.');
      if (!isGuildText(ctx.channel)) return ctx.reply('❌ Pakai command ini di dalam kanal tiket.');
      const ticket = await findOpenByChannel(ctx.botId, ctx.guild.id, ctx.channel.id);
      if (!ticket) return ctx.reply('❌ Channel ini bukan kanal tiket aktif.');
      const target = args.user as GuildMember | null;
      if (!target) return ctx.reply('❌ User tidak ditemukan.');
      await ctx.channel.permissionOverwrites
        .edit(target.id, { ViewChannel: true, SendMessages: true })
        .catch((e) => recordError(ctx.botId, e));
      return ctx.reply(`✅ <@${target.id}> ditambahkan ke tiket.`);
    }

    return ctx.reply('Pakai: `/ticket open [subjek]`, `/ticket close`, `/ticket add @user`.');
  },
};

export const ticketsModule: BotModule = {
  name: 'tickets',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  commands: [ticketCmd],
  async onInteraction(ctx: ModuleCtx, interaction: Interaction) {
    if (interaction.isButton() && interaction.customId === 'ticket:close') {
      if (!isGuildText(interaction.channel)) return;
      const member = interaction.member as GuildMember;
      const ticket = await findOpenByChannel(ctx.botId, ctx.guild.id, interaction.channel.id);
      if (!ticket) return void interaction.reply({ content: '❌ Bukan kanal tiket aktif.', ephemeral: true }).catch(() => {});
      if (ticket.discordUserId !== interaction.user.id && !isStaff(member, cfg(ctx.config))) {
        return void interaction.reply({ content: '❌ Hanya pemilik tiket atau staf yang bisa menutup.', ephemeral: true }).catch(() => {});
      }
      return closeTicket(ctx, interaction.channel, interaction.user.tag,
        (s) => interaction.reply({ content: s, ephemeral: true }).catch(() => {}));
    }
    if (interaction.isModalSubmit() && interaction.customId === 'ticket:modal') {
      const subject = interaction.fields.getTextInputValue('subject').trim();
      const member = interaction.member as GuildMember;
      return createTicket(ctx, member, subject || 'Tanpa subjek',
        (s) => interaction.reply({ content: s, ephemeral: true }).catch(() => {}));
    }
  },
};
