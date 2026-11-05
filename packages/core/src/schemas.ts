import { z } from 'zod';

/** Modul aktif platform (10): F1 welcome+moderation, F2 tickets/logging/utilities/customcmd, F3 leveling/economy/webhooks, prioritas pengguna: quiz. */
export const MODULE_NAMES = [
  'welcome', 'moderation', 'tickets', 'logging', 'utilities',
  'customcmd', 'leveling', 'economy', 'webhooks', 'quiz',
] as const;
export type ModuleName = (typeof MODULE_NAMES)[number];

const snowflakeOrEmpty = z.string().regex(/^(\d{5,25})?$/, 'harus ID Discord (angka) atau kosong');

export const welcomeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  channelId: snowflakeOrEmpty.default(''),
  message: z.string().min(1).max(1000).default('Selamat datang {user} di {server}!'),
  dmEnabled: z.boolean().default(false),
  dmMessage: z.string().max(1000).default('Halo {user}, selamat datang di {server}!'),
  autoRoleId: snowflakeOrEmpty.default(''),
});

export const moderationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  moderatorRoleId: snowflakeOrEmpty.default(''),
  modLogChannelId: snowflakeOrEmpty.default(''),
});

export const ticketsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  categoryId: snowflakeOrEmpty.default(''),
  staffRoleId: snowflakeOrEmpty.default(''),
  transcriptChannelId: snowflakeOrEmpty.default(''),
  maxOpenPerUser: z.number().int().min(1).max(5).default(1),
});

export const loggingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  channelId: snowflakeOrEmpty.default(''),
  logMessageDelete: z.boolean().default(true),
  logMessageEdit: z.boolean().default(true),
  logMemberJoin: z.boolean().default(true),
  logMemberLeave: z.boolean().default(true),
  logRoleChange: z.boolean().default(true),
});

export const utilitiesConfigSchema = z.object({
  enabled: z.boolean().default(true),
});

const customCmdEntry = z.object({
  name: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,32}$/, 'nama: a-z, 0-9, - , _ (maks 32)'),
  response: z.string().min(1).max(1000),
  embed: z.boolean().default(false),
});

export const RESERVED_COMMANDS = [
  'kick', 'ban', 'timeout', 'clear', 'ticket',
  'ping', 'avatar', 'userinfo', 'serverinfo', 'calc', 'weather',
  'rank', 'leaderboard', 'balance', 'daily', 'work', 'transfer', 'shop', 'buy',
  'quiz',
];

export const customcmdConfigSchema = z.object({
  enabled: z.boolean().default(true),
  commands: z.array(customCmdEntry).max(25, 'maksimal 25 custom command per server').default([]),
}).superRefine((v, ctx) => {
  const names = v.commands.map((c) => c.name);
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: 'custom', message: 'ada nama custom command yang duplikat', path: ['commands'] });
  }
  for (const [i, c] of v.commands.entries()) {
    if (RESERVED_COMMANDS.includes(c.name)) {
      ctx.addIssue({ code: 'custom', message: `"${c.name}" adalah nama command bawaan`, path: ['commands', i, 'name'] });
    }
  }
});

export const levelingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  xpMin: z.number().int().min(1).max(50).default(5),
  xpMax: z.number().int().min(1).max(50).default(15),
  cooldownSec: z.number().int().min(0).max(600).default(60),
  announceChannelId: snowflakeOrEmpty.default(''),
  levelUpMessage: z.string().min(1).max(500).default('🎉 {user} naik ke level {level}!'),
  roleRewards: z.array(z.object({
    level: z.number().int().min(1).max(500),
    roleId: z.string().regex(/^\d{5,25}$/, 'pilih role'),
  })).max(20, 'maksimal 20 role reward').default([]),
});

export const economyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  currencyName: z.string().trim().min(1).max(16).default('koin'),
  dailyAmount: z.number().int().min(1).max(100000).default(100),
  workMin: z.number().int().min(1).max(10000).default(10),
  workMax: z.number().int().min(1).max(10000).default(50),
  workCooldownSec: z.number().int().min(60).max(86400).default(3600),
  shop: z.array(z.object({
    name: z.string().trim().min(1).max(32),
    price: z.number().int().min(1).max(1000000),
    roleId: z.string().regex(/^\d{5,25}$/, 'pilih role'),
  })).max(10, 'maksimal 10 item toko').default([]),
}).superRefine((v, ctx) => {
  if (v.workMax < v.workMin) {
    ctx.addIssue({ code: 'custom', message: 'workMax harus >= workMin', path: ['workMax'] });
  }
});

export const webhooksConfigSchema = z.object({
  enabled: z.boolean().default(true),
});

export const quizQuestionsSchema = z.array(z.object({
  question: z.string().trim().min(1).max(300),
  choices: z.array(z.string().trim().min(1).max(100)).min(2).max(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(500).default(''),
})).max(5000, 'maksimal 5000 soal per server').default([]);

export const quizConfigSchema = z.object({
  enabled: z.boolean().default(true),
  title: z.string().trim().min(1).max(100).default('🧩 Tebak-Tebakan'),
  pointsName: z.string().trim().min(1).max(32).default('Activity Points'),
  timePerQuestionSec: z.number().int().min(5).max(600).default(240),
  pointsPerQuestion: z.number().int().min(10).max(1000).default(100),
  questionsPerSession: z.number().int().min(1).max(50).default(10),
  questions: quizQuestionsSchema,
}).superRefine((v, ctx) => {
  for (const [i, q] of v.questions.entries()) {
    if (q.correctIndex >= q.choices.length) {
      ctx.addIssue({ code: 'custom', message: `soal #${i + 1}: jawaban benar di luar daftar pilihan`, path: ['questions', i, 'correctIndex'] });
    }
    const uniq = new Set(q.choices.map((c) => c.toLowerCase()));
    if (uniq.size !== q.choices.length) {
      ctx.addIssue({ code: 'custom', message: `soal #${i + 1}: ada pilihan duplikat`, path: ['questions', i] });
    }
  }
});

export const moduleSchemas = {
  welcome: welcomeConfigSchema,
  moderation: moderationConfigSchema,
  tickets: ticketsConfigSchema,
  logging: loggingConfigSchema,
  utilities: utilitiesConfigSchema,
  customcmd: customcmdConfigSchema,
  leveling: levelingConfigSchema,
  economy: economyConfigSchema,
  webhooks: webhooksConfigSchema,
  quiz: quizConfigSchema,
} satisfies Record<ModuleName, z.ZodTypeAny>;

/** Bentuk `bot_configs.data` untuk satu guild. */
export const guildConfigSchema = z.object({
  welcome: welcomeConfigSchema.optional(),
  moderation: moderationConfigSchema.optional(),
  tickets: ticketsConfigSchema.optional(),
  logging: loggingConfigSchema.optional(),
  utilities: utilitiesConfigSchema.optional(),
  customcmd: customcmdConfigSchema.optional(),
  leveling: levelingConfigSchema.optional(),
  economy: economyConfigSchema.optional(),
  webhooks: webhooksConfigSchema.optional(),
  quiz: quizConfigSchema.optional(),
});

/** Bentuk `bot_configs.data` level bot (guild ''). */
export const botLevelConfigSchema = z.object({
  modules: z.array(z.enum(MODULE_NAMES)).default([]),
});

export const TEMPLATES = {
  welcome: { modules: ['welcome'] as ModuleName[] },
  moderation: { modules: ['moderation'] as ModuleName[] },
  starter: { modules: ['welcome', 'moderation'] as ModuleName[] },
} as const;

export const createBotSchema = z.object({
  name: z.string().trim().min(2).max(100),
  prefix: z.string().trim().min(1).max(8).regex(/^\S+$/, 'prefix tidak boleh mengandung spasi').default('!'),
  template: z.enum(['welcome', 'moderation', 'starter']),
  token: z.string().trim().min(50).max(120),
});

export const updateBotSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  prefix: z.string().trim().min(1).max(8).regex(/^\S+$/).optional(),
  status: z.enum(['running', 'paused']).optional(),
  modules: z.array(z.enum(MODULE_NAMES)).optional(),
});

/** Bit permission resmi Discord — dipakai untuk menghitung permission URL undangan. */
const PERMISSION_BITS: Record<string, bigint> = {
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  ManageChannels: 1n << 4n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  ManageRoles: 1n << 28n,
  ModerateMembers: 1n << 40n,
};

/** Permission minimal per modul — jangan minta Administrator. */
export const moduleInvitePermissions: Record<ModuleName, string[]> = {
  welcome: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageRoles'],
  moderation: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'KickMembers', 'BanMembers', 'ModerateMembers', 'ManageMessages', 'ManageChannels'],
  tickets: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageChannels', 'ManageRoles'],
  logging: ['ViewChannel', 'SendMessages', 'EmbedLinks'],
  utilities: ['ViewChannel', 'SendMessages', 'EmbedLinks'],
  customcmd: ['ViewChannel', 'SendMessages', 'EmbedLinks'],
  leveling: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageRoles'],
  economy: ['ViewChannel', 'SendMessages', 'EmbedLinks'],
  webhooks: ['ViewChannel', 'SendMessages', 'EmbedLinks'],
  quiz: ['ViewChannel', 'SendMessages', 'EmbedLinks'],
};

export function invitePermissionsBitfield(modules: readonly string[]): string {
  let bits = 0n;
  for (const m of modules) {
    for (const p of moduleInvitePermissions[m as ModuleName] ?? []) bits |= PERMISSION_BITS[p] ?? 0n;
  }
  return bits.toString();
}

export function buildInviteUrl(applicationId: string, modules: readonly string[]): string {
  const q = new URLSearchParams({
    client_id: applicationId,
    scope: 'bot applications.commands',
    permissions: invitePermissionsBitfield(modules),
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

/** Netralkan mention massal dari teks buatan user. */
export function sanitizeText(s: string): string {
  return s.replaceAll('@everyone', '@\u200beveryone').replaceAll('@here', '@\u200bhere');
}

/** Ganti {placeholder} lalu sanitasi. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return sanitizeText(tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? ''));
}

export const isSnowflake = (v: string): boolean => /^\d{5,25}$/.test(v);
