import { GatewayIntentBits, type GuildMember } from 'discord.js';
import { recordError, renderTemplate } from '@platform/core';
import type { BotModule } from './types';

export const welcomeModule: BotModule = {
  name: 'welcome',
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  commands: [],
  async onMemberAdd({ client, botId, guild, config }, member: GuildMember) {
    if (config.enabled === false) return;

    if (typeof config.autoRoleId === 'string' && config.autoRoleId) {
      await member.roles.add(config.autoRoleId).catch((e) => recordError(botId, e));
    }

    if (typeof config.channelId === 'string' && config.channelId) {
      const channel = await client.channels.fetch(config.channelId).catch(() => null);
      if (channel?.isTextBased() && 'send' in channel) {
        await channel.send({
          content: renderTemplate(String(config.message ?? 'Selamat datang {user}!'), {
            user: `<@${member.id}>`,
            server: guild.name,
          }),
          // Hanya mention member tsb — @everyone/@here dari template sudah dinetralkan.
          allowedMentions: { parse: [], users: [member.id], roles: [] },
        }).catch((e) => recordError(botId, e));
      }
    }

    if (config.dmEnabled && typeof config.dmMessage === 'string' && config.dmMessage) {
      await member.send(renderTemplate(config.dmMessage, { user: member.user.username, server: guild.name }))
        .catch(() => { /* DM member tertutup — abaikan */ });
    }
  },
};
