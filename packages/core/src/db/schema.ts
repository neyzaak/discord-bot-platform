import {
  integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar,
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
