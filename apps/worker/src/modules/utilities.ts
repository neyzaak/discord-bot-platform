import { GatewayIntentBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import { sanitizeText } from '@platform/core';
import type { BotModule, CommandContext, ModuleCommand } from './types';

const ACCENT = 0x5865f2;
const optUser = (cmd: SlashCommandBuilder) =>
  cmd.addUserOption((o) => o.setName('user').setDescription('User (kosong = dirimu)'));

const ping: ModuleCommand = {
  name: 'ping', description: 'Cek latensi bot', args: [],
  buildSlash: () => new SlashCommandBuilder().setName('ping').setDescription('Cek latensi bot').toJSON(),
  async execute(ctx: CommandContext) {
    await ctx.reply(`🏓 Pong! Latensi gateway: \`${Math.max(0, ctx.client.ws.ping)}\` ms`);
  },
};

const avatar: ModuleCommand = {
  name: 'avatar', description: 'Tampilkan avatar user', args: [{ name: 'user', type: 'user' }],
  buildSlash: () => optUser(new SlashCommandBuilder().setName('avatar').setDescription('Tampilkan avatar user')).toJSON(),
  async execute(ctx, args) {
    const user = (args.user as GuildMember | null)?.user ?? ctx.user;
    await ctx.reply({
      embeds: [{
        title: `Avatar ${sanitizeText(user.tag)}`,
        image: { url: user.displayAvatarURL({ size: 1024, extension: 'png' }) },
        color: ACCENT,
      }],
    });
  },
};

const userinfo: ModuleCommand = {
  name: 'userinfo', description: 'Info user', args: [{ name: 'user', type: 'user' }],
  buildSlash: () => optUser(new SlashCommandBuilder().setName('userinfo').setDescription('Info user')).toJSON(),
  async execute(ctx, args) {
    const member = (args.user as GuildMember | null) ?? ctx.member;
    const user = member?.user ?? ctx.user;
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: 'ID', value: user.id, inline: true },
      { name: 'Akun dibuat', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
    ];
    if (member) {
      fields.push({ name: 'Join server', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '—', inline: true });
      fields.push({ name: 'Jumlah role', value: String(Math.max(0, member.roles.cache.size - 1)), inline: true });
    }
    await ctx.reply({
      embeds: [{
        title: sanitizeText(user.tag),
        thumbnail: { url: user.displayAvatarURL({ size: 256, extension: 'png' }) },
        fields,
        color: ACCENT,
      }],
    });
  },
};

const serverinfo: ModuleCommand = {
  name: 'serverinfo', description: 'Info server', args: [],
  buildSlash: () => new SlashCommandBuilder().setName('serverinfo').setDescription('Info server').toJSON(),
  async execute(ctx) {
    if (!ctx.guild) return ctx.reply('❌ Hanya di server.');
    const g = ctx.guild;
    const icon = g.iconURL({ size: 256, extension: 'png' });
    await ctx.reply({
      embeds: [{
        title: sanitizeText(g.name),
        ...(icon ? { thumbnail: { url: icon } } : {}),
        fields: [
          { name: 'ID', value: g.id, inline: true },
          { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
          { name: 'Anggota', value: String(g.memberCount), inline: true },
          { name: 'Kanal', value: String(g.channels.cache.size), inline: true },
          { name: 'Role', value: String(g.roles.cache.size), inline: true },
          { name: 'Dibuat', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        ],
        color: ACCENT,
      }],
    });
  },
};

const calc: ModuleCommand = {
  name: 'calc', description: 'Kalkulator: + - * / ( ) %', args: [{ name: 'expression', type: 'string', rest: true }],
  buildSlash: () => new SlashCommandBuilder().setName('calc').setDescription('Kalkulator')
    .addStringOption((o) => o.setName('expression').setDescription('Contoh: (2+3)*4').setRequired(true).setMaxLength(100)).toJSON(),
  async execute(ctx, args) {
    const expr = String(args.expression ?? '').trim().slice(0, 100);
    if (!expr) return ctx.reply('Contoh: `!calc (2+3)*4`');
    if (!/^[0-9+\-*/(). %]+$/.test(expr)) return ctx.reply('❌ Hanya angka dan operator + - * / ( ) % yang diizinkan.');
    try {
      // ponytail: whitelist regex + Function cukup untuk kalkulator; parser AST jika butuh ekspresi kompleks
      const result = Function(`"use strict"; return (${expr});`)() as unknown;
      if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('hasil tidak valid');
      await ctx.reply(`🧮 \`${expr}\` = \`${result}\``);
    } catch {
      await ctx.reply('❌ Ekspresi tidak bisa dihitung.');
    }
  },
};

const weather: ModuleCommand = {
  name: 'weather', description: 'Cuaca kota (sumber: wttr.in)', args: [{ name: 'city', type: 'string', rest: true }],
  buildSlash: () => new SlashCommandBuilder().setName('weather').setDescription('Cuaca kota')
    .addStringOption((o) => o.setName('city').setDescription('Nama kota, contoh: Jakarta').setRequired(true).setMaxLength(64)).toJSON(),
  async execute(ctx, args) {
    const city = sanitizeText(String(args.city ?? '').trim().slice(0, 64));
    if (!city || !/^[\p{L}\p{N}\s.,-]+$/u.test(city)) return ctx.reply('❌ Sebutkan nama kota, contoh: `!weather Jakarta`');
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as {
        current_condition?: Array<{ temp_C: string; FeelsLikeC: string; humidity: string; windspeedKmph: string; weatherDesc?: Array<{ value: string }> }>;
      };
      const c = data.current_condition?.[0];
      if (!c) throw new Error('kosong');
      await ctx.reply({
        embeds: [{
          title: `🌤️ Cuaca: ${city}`,
          description: c.weatherDesc?.[0]?.value ?? '—',
          color: ACCENT,
          fields: [
            { name: 'Suhu', value: `${c.temp_C}°C (terasa ${c.FeelsLikeC}°C)`, inline: true },
            { name: 'Kelembapan', value: `${c.humidity}%`, inline: true },
            { name: 'Angin', value: `${c.windspeedKmph} km/j`, inline: true },
          ],
          footer: { text: 'Sumber: wttr.in' },
        }],
      });
    } catch {
      await ctx.reply('❌ Cuaca tidak tersedia untuk kota itu saat ini.');
    }
  },
};

export const utilitiesModule: BotModule = {
  name: 'utilities',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  commands: [ping, avatar, userinfo, serverinfo, calc, weather],
};
