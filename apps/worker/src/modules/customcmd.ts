import { GatewayIntentBits, type APIEmbed } from 'discord.js';
import { renderTemplate } from '@platform/core';
import type { BotModule, CommandContext } from './types';

interface CustomEntry { name: string; response: string; embed: boolean }

export const customcmdModule: BotModule = {
  name: 'customcmd',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  commands: [], // prefix-only, sesuai PRD "command teks kustom"
  async onPrefixCommand(ctx: CommandContext, name: string): Promise<boolean> {
    const list = Array.isArray(ctx.config.commands) ? (ctx.config.commands as CustomEntry[]) : [];
    const entry = list.find((c) => c.name === name);
    if (!entry) return false;
    const text = renderTemplate(entry.response, { server: ctx.guild?.name ?? 'server' });
    const payload: string | { embeds: APIEmbed[] } = entry.embed
      ? { embeds: [{ description: text, color: 0x5865f2 }] }
      : text;
    await ctx.reply(payload);
    return true;
  },
};
