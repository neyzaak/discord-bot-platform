import { Client, Events, GatewayIntentBits, Routes, type ChatInputCommandInteraction, type Guild, type GuildMember, type Interaction, type Message, type ModalBuilder, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';
import { and, eq } from 'drizzle-orm';
import {
  BOT_STATUS_KEY, botConfigs, botGuilds, bots, botLevelConfigSchema, commandLogs,
  db, decryptToken, logger, moduleSchemas, recordError, redis, type ModuleName,
} from '@platform/core';
import { MODULES, type BotModule, type CommandContext, type ModuleCtx } from './modules/index';

// ponytail: semua intent union untuk semua bot; kurangi per-bot jika kuota intent jadi masalah
const ALL_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMembers,
];

type BotRow = typeof bots.$inferSelect;
type ReplyPayload = CommandContext['reply'] extends (p: infer P) => unknown ? P : never;

async function upsertGuild(botId: number, g: Guild): Promise<void> {
  await db.insert(botGuilds)
    .values({ botId, discordGuildId: g.id, name: g.name })
    .onConflictDoUpdate({ target: [botGuilds.botId, botGuilds.discordGuildId], set: { name: g.name } })
    .catch((e) => logger.error({ err: e, botId }, 'upsert guild gagal'));
}

async function parsePrefixArgs(cmd: BotModule['commands'][number], message: Message, tokens: string[]): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  let i = 0;
  for (const a of cmd.args) {
    if (a.type === 'user') {
      const raw = tokens[i++];
      const id = raw?.match(/^<@!?(\d+)>$/)?.[1] ?? (/^\d{5,25}$/.test(raw ?? '') ? raw : undefined);
      out[a.name] = id ? await message.guild!.members.fetch(id).catch(() => null) : null;
    } else if (a.type === 'int') {
      const n = Number.parseInt(tokens[i++] ?? '', 10);
      out[a.name] = Number.isFinite(n) ? n : null;
    } else if (a.rest) {
      out[a.name] = tokens.slice(i).join(' ');
      i = tokens.length;
    } else {
      out[a.name] = tokens[i++] ?? '';
    }
  }
  return out;
}

export class BotRunner {
  private client: Client | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private mods: BotModule[] = [];
  // ponytail: cache config 60 dtk; setiap PUT config publish reload -> runner baru = cache kosong
  private cfgCache = new Map<string, { v: Record<string, unknown>; exp: number }>();

  constructor(private readonly botId: number) {}

  async start(): Promise<void> {
    const [bot] = await db.select().from(bots).where(and(eq(bots.id, this.botId), eq(bots.status, 'running')));
    if (!bot) throw new Error(`bot ${this.botId} tidak ditemukan atau sedang dijeda`);
    const token = decryptToken(bot.tokenEncrypted);

    const [cfgRow] = await db.select().from(botConfigs)
      .where(and(eq(botConfigs.botId, bot.id), eq(botConfigs.discordGuildId, '')));
    const enabled = botLevelConfigSchema.parse((cfgRow?.data as Record<string, unknown>) ?? {}).modules;
    this.mods = MODULES.filter((m) => enabled.includes(m.name));
    const mods = this.mods;

    const client = new Client({ intents: ALL_INTENTS });
    this.client = client;

    client.once(Events.ClientReady, async (c) => {
      logger.info({ botId: bot.id, bot: c.user?.tag, guilds: c.guilds.cache.size, modules: mods.map((m) => m.name) }, 'bot online');
      for (const g of c.guilds.cache.values()) await upsertGuild(bot.id, g);
      try {
        const body: RESTPostAPIApplicationCommandsJSONBody[] = mods.flatMap((m) => m.commands.map((cmd) => cmd.buildSlash()));
        await c.rest.put(Routes.applicationCommands(bot.applicationId), { body });
      } catch (e) {
        await recordError(bot.id, e);
      }
    });

    client.on(Events.GuildCreate, (g) => void upsertGuild(bot.id, g));
    client.on(Events.GuildDelete, (g) => {
      void db.delete(botGuilds)
        .where(and(eq(botGuilds.botId, bot.id), eq(botGuilds.discordGuildId, g.id)))
        .catch((e) => logger.error({ err: e }, 'hapus guild gagal'));
    });

    client.on(Events.InteractionCreate, (i) => {
      if (i.isChatInputCommand()) void this.handleSlash(bot, i).catch((e) => recordError(bot.id, e));
      else void this.handleComponent(bot, i).catch((e) => recordError(bot.id, e));
    });
    client.on(Events.MessageCreate, (m) => {
      void this.handleMessage(bot, m).catch((e) => recordError(bot.id, e));
    });

    client.on(Events.GuildMemberAdd, (member) => {
      void this.forModules(bot, member.guild?.id, async (mod, config) => {
        await mod.onMemberAdd?.({ client: member.client, botId: bot.id, guild: member.guild, config }, member);
      }).catch((e) => recordError(bot.id, e));
    });
    client.on(Events.GuildMemberRemove, (member) => {
      void this.forModules(bot, member.guild?.id, async (mod, config) => {
        await mod.onMemberRemove?.({ client: member.client, botId: bot.id, guild: member.guild, config }, member);
      }).catch((e) => recordError(bot.id, e));
    });
    client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
      void this.forModules(bot, newMember.guild?.id, async (mod, config) => {
        await mod.onMemberUpdate?.({ client: newMember.client, botId: bot.id, guild: newMember.guild, config }, oldMember, newMember);
      }).catch((e) => recordError(bot.id, e));
    });
    client.on(Events.MessageDelete, (m) => {
      void this.forModules(bot, m.guild?.id, async (mod, config) => {
        await mod.onMessageDelete?.({ client: m.client, botId: bot.id, guild: m.guild!, config }, m);
      }).catch((e) => recordError(bot.id, e));
    });
    client.on(Events.MessageUpdate, (oldM, newM) => {
      void this.forModules(bot, newM.guild?.id, async (mod, config) => {
        await mod.onMessageUpdate?.({ client: newM.client, botId: bot.id, guild: newM.guild!, config }, oldM, newM);
      }).catch((e) => recordError(bot.id, e));
    });

    client.on(Events.Error, (e) => void recordError(bot.id, e));
    client.on(Events.ShardError, (e) => void recordError(bot.id, e));
    client.on(Events.ShardDisconnect, () => logger.warn({ botId: bot.id }, 'gateway terputus â€” discord.js reconnect otomatis'));

    logger.info({ botId: this.botId }, 'runner: memanggil client.login');
    await client.login(token);
    logger.info({ botId: this.botId }, 'runner: client.login selesai');
    this.startHeartbeat();
  }

  async stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    const client = this.client;
    this.client = null;
    await redis.del(BOT_STATUS_KEY(this.botId)).catch(() => {});
    if (client) await client.destroy().catch(() => {});
  }

  private startHeartbeat(): void {
    const beat = () => redis.set(BOT_STATUS_KEY(this.botId), JSON.stringify({ state: 'online', ts: Date.now() }), 'EX', 90).catch(() => {});
    beat();
    this.heartbeat = setInterval(beat, 30_000);
  }

  /** Jalankan hook modul untuk satu guild; config per modul dimuat (cache), modul nonaktif dilewati. */
  private async forModules(
    bot: BotRow,
    guildId: string | null | undefined,
    fn: (mod: BotModule, config: Record<string, unknown>) => Promise<void> | undefined | void,
  ): Promise<void> {
    if (!guildId || !this.client) return;
    for (const mod of this.mods) {
      const config = await this.guildConfig(bot, mod.name, guildId);
      if (config.enabled === false) continue;
      await fn(mod, config);
    }
  }

  private async guildConfig(bot: BotRow, moduleName: ModuleName, guildId: string): Promise<Record<string, unknown>> {
    const key = `${bot.id}:${guildId}:${moduleName}`;
    const hit = this.cfgCache.get(key);
    if (hit && hit.exp > Date.now()) return hit.v;
    const [row] = await db.select().from(botConfigs)
      .where(and(eq(botConfigs.botId, bot.id), eq(botConfigs.discordGuildId, guildId)));
    const data = (row?.data as Record<string, unknown>) ?? {};\n    const raw = (data[moduleName] as Record<string, unknown> ?? {}) as Record<string, unknown>;
    let v: Record<string, unknown>;
    // Quiz menyimpan 5000 soal di data.quiz.questions â€” sudah divalidasi saat seed,
    // jangan re-parse ulang setiap kali config dibaca (berat dan bisa gagal).
    if (moduleName === 'quiz' && Array.isArray(raw.questions)) {
      const { questions, ...rest } = raw;
      v = moduleSchemas[moduleName].parse(rest) as Record<string, unknown>;
      v.questions = questions;
    } else {
      v = moduleSchemas[moduleName].parse(raw) as Record<string, unknown>;
    }
    this.cfgCache.set(key, { v, exp: Date.now() + 60_000 });
    return v;
  }

  /** Setiap pesan guild: hook onMessage per modul (leveling/ekonomi), lalu dispatch prefix. */
  private async handleMessage(bot: BotRow, message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;
    await this.forModules(bot, message.guild.id, async (mod, config) => {
      await mod.onMessage?.({ client: message.client, botId: bot.id, guild: message.guild!, config }, message);
    });
    await this.handlePrefix(bot, message);
  }

  private async handleSlash(bot: BotRow, interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) return;
    const mod = this.mods.find((m) => m.commands.some((c) => c.name === interaction.commandName));
    const cmd = mod?.commands.find((c) => c.name === interaction.commandName);
    if (!mod || !cmd) return;

    const config = await this.guildConfig(bot, mod.name, interaction.guild.id);
    if (config.enabled === false) return void interaction.reply({ content: 'âŒ Modul ini dinonaktifkan di server ini.', ephemeral: true }).catch(() => {});

    if (!(await this.notRateLimited(bot.id, interaction.guild.id, interaction.user.id, cmd.name))) {
      return void interaction.reply({ content: 'â³ Terlalu cepat â€” coba lagi beberapa detik.', ephemeral: true }).catch(() => {});
    }

    const args: Record<string, unknown> = {};
    for (const a of cmd.args) {
      if (a.type === 'user') args[a.name] = (interaction.options.getMember(a.name) as GuildMember | null) ?? null;
      else if (a.type === 'int') args[a.name] = interaction.options.getInteger(a.name);
      else args[a.name] = interaction.options.getString(a.name) ?? '';
    }

    const ctx: CommandContext = {
      client: interaction.client,
      botId: bot.id,
      guild: interaction.guild,
      member: interaction.member as GuildMember,
      user: interaction.user,
      channel: interaction.channel,
      config,
      showModal: (modal: ModalBuilder) => interaction.showModal(modal),
      reply: (payload: ReplyPayload) => {
        const opts = typeof payload === 'string'
          ? { content: payload, ephemeral: true, allowedMentions: { parse: [] as never[] } }
          : { embeds: payload.embeds, ephemeral: true, allowedMentions: { parse: [] as never[] } };
        return interaction.replied ? interaction.followUp(opts) : interaction.reply(opts);
      },
    };

    try {
      await cmd.execute(ctx, args);
      await db.insert(commandLogs).values({
        botId: bot.id, discordGuildId: interaction.guild.id, discordUserId: interaction.user.id, commandName: cmd.name,
      });
    } catch (e) {
      await recordError(bot.id, e);
      await interaction.reply({ content: 'âŒ Terjadi kesalahan saat menjalankan command.', ephemeral: true }).catch(() => {});
    }
  }

  /** Tombol & modal -> hook onInteraction per modul. */
  private async handleComponent(bot: BotRow, interaction: Interaction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) return;
    for (const mod of this.mods) {
      if (!mod.onInteraction) continue;
      const config = await this.guildConfig(bot, mod.name, interaction.guild.id);
      if (config.enabled === false) continue;
      await mod.onInteraction({ client: interaction.client, botId: bot.id, guild: interaction.guild, config }, interaction);
    }
  }

  private async handlePrefix(bot: BotRow, message: Message): Promise<void> {
    if (message.author.bot || !message.guild || !message.member || !message.content.startsWith(bot.prefix)) return;
    const content = message.content.slice(bot.prefix.length).trim();
    if (!content) return;
    const [nameRaw, ...rest] = content.split(/\s+/);
    const name = nameRaw.toLowerCase();

    const mod = this.mods.find((m) => m.commands.some((c) => c.name === name));
    const cmd = mod?.commands.find((c) => c.name === name);

    if (!mod || !cmd) {
      // Custom command (prefix-only): nama bawaan selalu menang.
      const customMod = this.mods.find((m) => m.onPrefixCommand);
      if (!customMod) return;
      const config = await this.guildConfig(bot, customMod.name, message.guild.id);
      if (config.enabled === false) return;
      if (!(await this.notRateLimited(bot.id, message.guild.id, message.author.id, name))) {
        return void message.reply({ content: 'â³ Terlalu cepat â€” coba lagi beberapa detik.', allowedMentions: { parse: [] } });
      }
      const ctx = this.prefixContext(bot, message, config);
      const handled = await customMod.onPrefixCommand!(ctx, name, rest);
      if (handled) {
        await db.insert(commandLogs).values({
          botId: bot.id, discordGuildId: message.guild.id, discordUserId: message.author.id, commandName: name,
        }).catch((e) => recordError(bot.id, e));
      }
      return;
    }

    if (!(await this.notRateLimited(bot.id, message.guild.id, message.author.id, cmd.name))) {
      return void message.reply({ content: 'â³ Terlalu cepat â€” coba lagi beberapa detik.', allowedMentions: { parse: [] } });
    }

    const config = await this.guildConfig(bot, mod.name, message.guild.id);
    if (config.enabled === false) return void message.reply({ content: 'âŒ Modul ini dinonaktifkan di server ini.', allowedMentions: { parse: [] } });

    const args = await parsePrefixArgs(cmd, message, rest);
    const ctx = this.prefixContext(bot, message, config);

    try {
      await cmd.execute(ctx, args);
      await db.insert(commandLogs).values({
        botId: bot.id, discordGuildId: message.guild.id, discordUserId: message.author.id, commandName: cmd.name,
      });
    } catch (e) {
      await recordError(bot.id, e);
      await message.reply({ content: 'âŒ Terjadi kesalahan saat menjalankan command.', allowedMentions: { parse: [] } }).catch(() => {});
    }
  }

  private prefixContext(bot: BotRow, message: Message, config: Record<string, unknown>): CommandContext {
    return {
      client: message.client,
      botId: bot.id,
      guild: message.guild,
      member: message.member ?? null,
      user: message.author,
      channel: message.channel,
      config,
      reply: (payload: ReplyPayload) => message.reply({
        ...(typeof payload === 'string' ? { content: payload } : payload),
        allowedMentions: { parse: [] },
      }),
    };
  }

  /** Cooldown 3 detik per user/guild/command. */
  private async notRateLimited(botId: number, guildId: string, userId: string, cmd: string): Promise<boolean> {
    const ok = await redis.set(`rl:cmd:${botId}:${guildId}:${userId}:${cmd}`, '1', 'EX', 3, 'NX');
    return ok === 'OK';
  }
}

