import type {
  APIEmbed, Client, GatewayIntentBits, Guild, GuildMember, Interaction, ModalBuilder,
  Message, PartialGuildMember, PartialMessage, RESTPostAPIApplicationCommandsJSONBody,
  TextBasedChannel, User,
} from 'discord.js';
import type { ModuleName } from '@platform/core';

export interface CommandContext {
  client: Client;
  botId: number;
  guild: Guild | null;
  member: GuildMember | null;
  user: User;
  channel: TextBasedChannel | null;
  config: Record<string, unknown>;
  reply: (payload: string | { embeds: APIEmbed[] }) => Promise<unknown>;
  /** Hanya tersedia untuk slash command — dipakai mis. modal tiket. */
  showModal?: (modal: ModalBuilder) => Promise<unknown>;
}

export interface ModuleCtx { client: Client; botId: number; guild: Guild; config: Record<string, unknown> }

export interface ModuleCommand {
  name: string;
  description: string;
  requiredPermission?: bigint;
  args: Array<{ name: string; type: 'user' | 'int' | 'string'; rest?: boolean }>;
  buildSlash: () => RESTPostAPIApplicationCommandsJSONBody;
  execute: (ctx: CommandContext, args: Record<string, unknown>) => Promise<unknown>;
}

export interface BotModule {
  name: ModuleName;
  intents: GatewayIntentBits[];
  commands: ModuleCommand[];
  onMemberAdd?: (ctx: ModuleCtx, member: GuildMember) => Promise<void>;
  onMemberRemove?: (ctx: ModuleCtx, member: GuildMember | PartialGuildMember) => Promise<void>;
  onMemberUpdate?: (ctx: ModuleCtx, oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => Promise<void>;
  onMessageDelete?: (ctx: ModuleCtx, message: Message | PartialMessage) => Promise<void>;
  onMessageUpdate?: (ctx: ModuleCtx, oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => Promise<void>;
  /** Setiap pesan guild (sebelum dispatch prefix). */
  onMessage?: (ctx: ModuleCtx, message: Message) => Promise<void>;
  /** Tombol & modal (interaksi non-command). */
  onInteraction?: (ctx: ModuleCtx, interaction: Interaction) => Promise<void>;
  /** Custom command prefix. Return true jika nama ditangani. */
  onPrefixCommand?: (ctx: CommandContext, name: string, rest: string[]) => Promise<boolean>;
}
