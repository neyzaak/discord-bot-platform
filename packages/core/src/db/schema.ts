import {
  boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  discordId: text('discord_id').notNull().unique(),
  username: text('username').notNull(),
  avatar: text('avatar'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bots = pgTable('bots', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  avatarUrl: text('avatar_url'),
  tokenEncrypted: text('token_encrypted').notNull(),
  tokenLast4: varchar('token_last4', { length: 8 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('running'), // running | paused
  prefix: varchar('prefix', { length: 8 }).notNull().default('!'),
  /** Discord ID staf yang boleh mengelola bot ini (selain pemilik). */
  managers: text('managers').array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const botGuilds = pgTable('bot_guilds', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordGuildId: text('discord_guild_id').notNull(),
  name: text('name').notNull().default(''),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('bot_guilds_bot_guild_uq').on(t.botId, t.discordGuildId)]);

/** data JSONB per (bot, guild); discordGuildId '' = config default level bot ({modules}). */
export const botConfigs = pgTable('bot_configs', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordGuildId: text('discord_guild_id').notNull().default(''),
  data: jsonb('data').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('bot_configs_bot_guild_uq').on(t.botId, t.discordGuildId)]);

export const commandLogs = pgTable('command_logs', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordGuildId: text('discord_guild_id'),
  discordUserId: text('discord_user_id'),
  commandName: varchar('command_name', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const errors = pgTable('errors', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').references(() => bots.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  stack: text('stack'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tiket aktif per kanal. */
export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordGuildId: text('discord_guild_id').notNull(),
  discordChannelId: text('discord_channel_id').notNull(),
  discordUserId: text('discord_user_id').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('open'), // open | closed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (t) => [uniqueIndex('tickets_channel_uq').on(t.botId, t.discordChannelId)]);

/** State per-member (XP leveling + dompet ekonomi + skor quiz) per bot+guild+user. */
export const guildMembers = pgTable('guild_members', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordGuildId: text('discord_guild_id').notNull(),
  discordUserId: text('discord_user_id').notNull(),
  xp: integer('xp').notNull().default(0),
  level: integer('level').notNull().default(0),
  balance: integer('balance').notNull().default(0),
  quizScore: integer('quiz_score').notNull().default(0),
  lastXpAt: timestamp('last_xp_at', { withTimezone: true }),
  lastDailyAt: timestamp('last_daily_at', { withTimezone: true }),
  lastWorkAt: timestamp('last_work_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('guild_members_uq').on(t.botId, t.discordGuildId, t.discordUserId)]);

/** Data pemain Wizzy — dipisah per bot supaya tidak tabrak dengan bot lain. */
export const wizzyUsers = pgTable('wizzy_users', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordUserId: text('discord_user_id').notNull(),
  house: text('house').notNull().default(''),
  galleons: integer('galleons').notNull().default(100),
  xp: integer('xp').notNull().default(0),
  level: integer('level').notNull().default(1),
  dailyStreak: integer('daily_streak').notNull().default(0),
  lastDailyAt: timestamp('last_daily_at', { withTimezone: true }),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  rankPoints: integer('rank_points').notNull().default(0),
  teamSlots: integer('team_slots').notNull().default(3),
  wand: text('wand').notNull().default(''),
  dungeonFloor: integer('dungeon_floor').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('wizzy_users_uq').on(t.botId, t.discordUserId)]);

export const wizzyCreatures = pgTable('wizzy_creatures', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordUserId: text('discord_user_id').notNull(),
  creatureId: text('creature_id').notNull(),
  level: integer('level').notNull().default(1),
  xp: integer('xp').notNull().default(0),
  isInTeam: boolean('is_in_team').notNull().default(false),
  caughtAt: timestamp('caught_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('wizzy_creatures_user_idx').on(t.botId, t.discordUserId)]);

export const wizzyInventory = pgTable('wizzy_inventory', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordUserId: text('discord_user_id').notNull(),
  itemId: text('item_id').notNull(),
  quantity: integer('quantity').notNull().default(0),
}, (t) => [uniqueIndex('wizzy_inventory_uq').on(t.botId, t.discordUserId, t.itemId)]);

export const wizzyBuffs = pgTable('wizzy_buffs', {
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordUserId: text('discord_user_id').notNull(),
  buff: text('buff').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.botId, t.discordUserId, t.buff] })]);

export const wizzyCovens = pgTable('wizzy_covens', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  bank: integer('bank').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('wizzy_covens_uq').on(t.botId, t.name)]);

export const wizzyCovenMembers = pgTable('wizzy_coven_members', {
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  covenId: integer('coven_id').notNull().references(() => wizzyCovens.id, { onDelete: 'cascade' }),
  discordUserId: text('discord_user_id').notNull(),
  role: text('role').notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.botId, t.discordUserId] })]);

export const wizzyBattles = pgTable('wizzy_battles', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  p1: text('p1').notNull(),
  p2: text('p2').notNull(),
  winner: text('winner'),
  bet: integer('bet').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Data minancing Wizzy per bot+user: rod, umpan, tas ikan, dan statistik. */
export const wizzyFishing = pgTable('wizzy_fishing', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordUserId: text('discord_user_id').notNull(),
  data: jsonb('data').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('wizzy_fishing_bot_user_uq').on(t.botId, t.discordUserId)]);

/** Endpoint ingest webhook eksternal per kanal target. Token = kredensial. */
export const webhooks = pgTable('webhooks', {
  id: serial('id').primaryKey(),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  discordGuildId: text('discord_guild_id').notNull(),
  channelId: text('channel_id').notNull(),
  name: varchar('name', { length: 64 }).notNull(),
  source: varchar('source', { length: 16 }).notNull(), // github | generic
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
