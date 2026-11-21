import { Router, type Request } from 'express';
import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
import {
  BOTS_CHANNEL, BOT_STATUS_KEY, botConfigs, botGuilds, bots, botLevelConfigSchema,
  buildInviteUrl, commandLogs, createBotSchema, db, decryptToken, encryptToken, errors,
  guildConfigSchema, isSnowflake, logger, moduleSchemas, redis, TEMPLATES, updateBotSchema,
  type ModuleName,
} from '@platform/core';
import { asyncHandler, requireAuth, type BotRow } from '../lib/auth';
import { rateLimit } from '../lib/limiter';
import { discordFetch, validateBotToken } from '../lib/discord';

export const botsRouter = Router();

const SAFE_COLUMNS = {
  id: bots.id, name: bots.name, prefix: bots.prefix, status: bots.status,
  tokenLast4: bots.tokenLast4, avatarUrl: bots.avatarUrl, applicationId: bots.applicationId,
  createdAt: bots.createdAt,
};

function safeBot(b: BotRow) {
  return { id: b.id, name: b.name, prefix: b.prefix, status: b.status, tokenMasked: `••••${b.tokenLast4}`, avatarUrl: b.avatarUrl, applicationId: b.applicationId, createdAt: b.createdAt };
}

function publishBot(botId: number, action: 'reload' | 'stop'): void {
  redis.publish(BOTS_CHANNEL, JSON.stringify({ botId, action })).catch((e) => logger.error({ err: e }, 'gagal publish reload'));
}

export function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

/** Bot bisa diakses pemilik ATAU staf (managers). Aksi destruktif (hapus, kelola staf) tetap cek assertOwner. */
export async function loadOwnedBot(req: Request): Promise<BotRow> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'id tidak valid');
  const [bot] = await db.select().from(bots).where(and(
    eq(bots.id, id),
    or(
      eq(bots.userId, req.user!.id),
      sql`${bots.managers} @> ARRAY[${req.user!.discordId}]::text[]`,
    ),
  ));
  if (!bot) throw httpError(404, 'bot tidak ditemukan');
  return bot;
}

export function assertOwner(bot: BotRow, req: Request): void {
  if (bot.userId !== req.user!.id) throw httpError(403, 'hanya pemilik bot yang bisa melakukan ini');
}

export async function botLevelModules(botId: number): Promise<ModuleName[]> {
  const [row] = await db.select().from(botConfigs).where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, '')));
  return botLevelConfigSchema.parse((row?.data as Record<string, unknown>) ?? {}).modules;
}

function parseRuntimeStatus(raw: string | null): 'online' | 'offline' {
  if (!raw) return 'offline';
  try { return JSON.parse(raw).state === 'online' ? 'online' : 'offline'; } catch { return 'offline'; }
}

function requireSnowflake(v: string): string {
  if (!isSnowflake(v)) throw httpError(400, 'guildId tidak valid');
  return v;
}

export async function assertBotInGuild(botId: number, guildId: string): Promise<void> {
  const [row] = await db.select().from(botGuilds).where(and(eq(botGuilds.botId, botId), eq(botGuilds.discordGuildId, guildId)));
  if (!row) throw httpError(404, 'bot belum tergabung di guild ini');
}

async function assertUserManagesGuild(discordUserId: string, guildId: string): Promise<void> {
  const raw = await redis.get(`user_guilds:${discordUserId}`);
  const guilds: Array<{ id: string }> = raw ? JSON.parse(raw) : [];
  if (!guilds.some((g) => g.id === guildId)) {
    throw httpError(403, 'kamu tidak mengelola server ini (login ulang bila daftar servermu berubah)');
  }
}

// ---- CRUD ----

botsRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const gc = db.select({ botId: botGuilds.botId, count: sql<number>`count(*)::int`.as('count') })
    .from(botGuilds).groupBy(botGuilds.botId).as('gc');
  const rows = await db.select({
    ...SAFE_COLUMNS,
    guildCount: sql<number>`coalesce(${gc.count}, 0)::int`,
  }).from(bots).leftJoin(gc, eq(gc.botId, bots.id)).where(or(
    eq(bots.userId, req.user!.id),
    sql`${bots.managers} @> ARRAY[${req.user!.discordId}]::text[]`,
  )).orderBy(desc(bots.createdAt));
  const statuses = rows.length ? await redis.mget(...rows.map((b) => BOT_STATUS_KEY(b.id))) : [];
  res.json({ bots: rows.map((b, i) => ({ ...b, runtimeStatus: parseRuntimeStatus(statuses[i]) })) });
}));

const createLimiter = rateLimit({ windowSec: 60, max: 5, key: (req) => `user:${req.user?.id ?? req.ip}` });

botsRouter.post('/', requireAuth, createLimiter, asyncHandler(async (req, res) => {
  const input = createBotSchema.parse(req.body);
  const identity = await validateBotToken(input.token);
  if (!identity) throw httpError(400, 'Token bot tidak valid atau tidak bisa diverifikasi ke Discord.');

  const [bot] = await db.insert(bots).values({
    userId: req.user!.id,
    applicationId: identity.applicationId,
    name: input.name,
    avatarUrl: identity.avatar ? `https://cdn.discordapp.com/avatars/${identity.botUserId}/${identity.avatar}.png` : null,
    tokenEncrypted: encryptToken(input.token),
    tokenLast4: input.token.slice(-4),
    prefix: input.prefix,
  }).returning();

  await db.insert(botConfigs)
    .values({ botId: bot.id, discordGuildId: '', data: { modules: TEMPLATES[input.template].modules } })
    .onConflictDoUpdate({
      target: [botConfigs.botId, botConfigs.discordGuildId],
      set: { data: { modules: TEMPLATES[input.template].modules }, updatedAt: new Date() },
    });

  publishBot(bot.id, 'reload');
  logger.info({ botId: bot.id, userId: req.user!.id }, 'bot dibuat');
  res.status(201).json({
    bot: { ...safeBot(bot), modules: TEMPLATES[input.template].modules, inviteUrl: buildInviteUrl(bot.applicationId, TEMPLATES[input.template].modules) },
  });
}));

botsRouter.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const [modules, guildRows, statusRaw] = await Promise.all([
    botLevelModules(bot.id),
    db.select().from(botGuilds).where(eq(botGuilds.botId, bot.id)).orderBy(botGuilds.name),
    redis.get(BOT_STATUS_KEY(bot.id)),
  ]);
  res.json({
    bot: {
      ...safeBot(bot),
      modules,
      runtimeStatus: parseRuntimeStatus(statusRaw),
      inviteUrl: buildInviteUrl(bot.applicationId, modules),
      guilds: guildRows.map((g) => ({ id: g.id, discordGuildId: g.discordGuildId, name: g.name })),
      ...(bot.userId === req.user!.id ? { managers: bot.managers } : {}),
    },
  });
}));

// ---- Staf (managers) — kelola oleh pemilik ----

const MANAGER_LIMIT = 10;

botsRouter.post('/:id/managers', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  assertOwner(bot, req);
  const discordId = String((req.body as { discordId?: unknown })?.discordId ?? '');
  if (!isSnowflake(discordId)) throw httpError(400, 'discordId tidak valid');
  if (bot.managers.includes(discordId)) throw httpError(400, 'staf sudah terdaftar');
  if (bot.managers.length >= MANAGER_LIMIT) throw httpError(400, `maksimal ${MANAGER_LIMIT} staf`);
  await db.update(bots).set({ managers: [...bot.managers, discordId], updatedAt: new Date() }).where(eq(bots.id, bot.id));
  res.json({ ok: true, managers: [...bot.managers, discordId] });
}));

botsRouter.delete('/:id/managers/:discordId', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  assertOwner(bot, req);
  const managers = bot.managers.filter((m) => m !== req.params.discordId);
  await db.update(bots).set({ managers, updatedAt: new Date() }).where(eq(bots.id, bot.id));
  res.json({ ok: true, managers });
}));

botsRouter.patch('/:id', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const input = updateBotSchema.parse(req.body);

  if (input.modules) {
    await db.insert(botConfigs)
      .values({ botId: bot.id, discordGuildId: '', data: { modules: input.modules } })
      .onConflictDoUpdate({
        target: [botConfigs.botId, botConfigs.discordGuildId],
        set: { data: { modules: input.modules }, updatedAt: new Date() },
      });
  }

  await db.update(bots).set({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.prefix !== undefined ? { prefix: input.prefix } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    updatedAt: new Date(),
  }).where(eq(bots.id, bot.id));

  publishBot(bot.id, input.status === 'paused' ? 'stop' : 'reload');
  logger.info({ botId: bot.id }, 'bot diperbarui');
  res.json({ ok: true });
}));

botsRouter.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  assertOwner(bot, req);
  await db.delete(bots).where(eq(bots.id, bot.id));
  publishBot(bot.id, 'stop');
  logger.info({ botId: bot.id }, 'bot dihapus');
  res.json({ ok: true });
}));

// ---- Config per guild (generik untuk semua modul) ----

// Bank soal/kutipan bisa 1+ MB — jangan ikut GET/PUT config biasa. Diambil/disimpan
// lewat /config/:module hanya saat pengguna membuka editor bank tersebut.
const BANK_KEY = { quiz: 'questions', quotes: 'quotes' } as const;
type BankModule = keyof typeof BANK_KEY;
const isBankModule = (name: string): name is BankModule => name in BANK_KEY;

botsRouter.get('/:id/guilds/:guildId/config', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const guildId = requireSnowflake(req.params.guildId);
  await assertBotInGuild(bot.id, guildId);

  const [row] = await db.select().from(botConfigs).where(and(eq(botConfigs.botId, bot.id), eq(botConfigs.discordGuildId, guildId)));
  const data = guildConfigSchema.parse((row?.data as Record<string, unknown>) ?? {});
  const config = Object.fromEntries(Object.entries(moduleSchemas).map(([name, schema]) => {
    const value = schema.parse((data as Record<string, unknown>)[name] ?? {}) as Record<string, unknown>;
    return [name, isBankModule(name) ? { ...value, [BANK_KEY[name]]: [] } : value];
  }));
  res.json({ config });
}));

const configLimiter = rateLimit({ windowSec: 60, max: 30, key: (req) => `user:${req.user?.id ?? req.ip}` });

/** Ambil satu modul utuh, termasuk bank soal/kutipan — dipakai editor bank saja. */
botsRouter.get('/:id/guilds/:guildId/config/:module', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const guildId = requireSnowflake(req.params.guildId);
  await assertBotInGuild(bot.id, guildId);
  const name = req.params.module;
  if (!(name in moduleSchemas)) throw httpError(400, 'modul tidak dikenal');
  const [row] = await db.select().from(botConfigs)
    .where(and(eq(botConfigs.botId, bot.id), eq(botConfigs.discordGuildId, guildId)));
  const data = guildConfigSchema.parse((row?.data as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  res.json({ config: moduleSchemas[name as keyof typeof moduleSchemas].parse(data[name] ?? {}) });
}));

/** Simpan satu modul utuh termasuk bank — endpoint terpisah supaya PUT config tetap ringan. */
botsRouter.put('/:id/guilds/:guildId/config/:module', requireAuth, configLimiter, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const guildId = requireSnowflake(req.params.guildId);
  await assertBotInGuild(bot.id, guildId);
  await assertUserManagesGuild(req.user!.discordId, guildId);
  const name = req.params.module;
  if (!(name in moduleSchemas)) throw httpError(400, 'modul tidak dikenal');
  const value = moduleSchemas[name as keyof typeof moduleSchemas].parse(req.body);
  const [existing] = await db.select().from(botConfigs)
    .where(and(eq(botConfigs.botId, bot.id), eq(botConfigs.discordGuildId, guildId)));
  const merged = { ...((existing?.data as Record<string, unknown>) ?? {}), [name]: value };
  await db.insert(botConfigs).values({ botId: bot.id, discordGuildId: guildId, data: merged })
    .onConflictDoUpdate({
      target: [botConfigs.botId, botConfigs.discordGuildId],
      set: { data: merged, updatedAt: new Date() },
    });
  publishBot(bot.id, 'reload');
  res.json({ ok: true });
}));

botsRouter.put('/:id/guilds/:guildId/config', requireAuth, configLimiter, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const guildId = requireSnowflake(req.params.guildId);
  await assertBotInGuild(bot.id, guildId);
  await assertUserManagesGuild(req.user!.discordId, guildId);

  const parsed = guildConfigSchema.parse(req.body) as Record<string, unknown>;
  const [existing] = await db.select().from(botConfigs).where(and(eq(botConfigs.botId, bot.id), eq(botConfigs.discordGuildId, guildId)));
  const oldData = (existing?.data as Record<string, unknown>) ?? {};
  const data: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(moduleSchemas)) {
    if (parsed[name] === undefined) continue;
    const value = schema.parse(parsed[name]) as Record<string, unknown>;
    if (isBankModule(name)) {
      const key = BANK_KEY[name];
      const oldBank = (oldData[name] as Record<string, unknown>)?.[key];
      data[name] = { ...value, [key]: Array.isArray(oldBank) && oldBank.length ? oldBank : value[key] };
    } else data[name] = value;
  }
  if (Object.keys(data).length === 0) throw httpError(400, 'config kosong');

  const merged = { ...oldData, ...data };

  await db.insert(botConfigs)
    .values({ botId: bot.id, discordGuildId: guildId, data: merged })
    .onConflictDoUpdate({
      target: [botConfigs.botId, botConfigs.discordGuildId],
      set: { data: merged, updatedAt: new Date() },
    });

  publishBot(bot.id, 'reload');
  logger.info({ botId: bot.id, guildId }, 'config guild diperbarui');
  res.json({ ok: true });
}));

// ---- Monitoring (FR-06) ----

botsRouter.get('/:id/errors', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const rows = await db.select().from(errors).where(eq(errors.botId, bot.id)).orderBy(desc(errors.createdAt)).limit(limit);
  res.json({ errors: rows.map((e) => ({ id: e.id, message: e.message, createdAt: e.createdAt })) });
}));

botsRouter.get('/:id/stats', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const top = await db.select({ name: commandLogs.commandName, count: sql<number>`count(*)::int` })
    .from(commandLogs)
    .where(and(eq(commandLogs.botId, bot.id), gte(commandLogs.createdAt, new Date(Date.now() - 30 * 24 * 3600 * 1000))))
    .groupBy(commandLogs.commandName)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
  const last24 = await db.select({ total: sql<number>`count(*)::int` })
    .from(commandLogs)
    .where(and(eq(commandLogs.botId, bot.id), gte(commandLogs.createdAt, new Date(Date.now() - 24 * 3600 * 1000))));
  res.json({ topCommands: top, commands24h: last24[0]?.total ?? 0 });
}));

// ---- Avatar (set avatar aplikasi bot di Discord) ----

const AVATAR_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/;

botsRouter.post('/:id/avatar', requireAuth, configLimiter, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const dataUri = String((req.body as { dataUri?: unknown })?.dataUri ?? '');
  if (!AVATAR_RE.test(dataUri)) throw httpError(400, 'harus data URL gambar (png/jpeg/webp/gif)');
  if (dataUri.length > 14_000_000) throw httpError(400, 'gambar terlalu besar (maks ~10 MB)');
  const res2 = await discordFetch('/users/@me', {
    token: decryptToken(bot.tokenEncrypted), method: 'PATCH', body: JSON.stringify({ avatar: dataUri }),
  });
  if (!res2.ok) throw httpError(502, `gagal set avatar ke Discord (HTTP ${res2.status})`);
  const u = (await res2.json()) as { id: string; avatar: string | null };
  const avatarUrl = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null;
  await db.update(bots).set({ avatarUrl, updatedAt: new Date() }).where(eq(bots.id, bot.id));
  logger.info({ botId: bot.id }, 'avatar bot diperbarui');
  res.json({ ok: true, avatarUrl });
}));

// ---- Channel & role (via token bot, untuk dropdown config) ----

async function fetchGuildResource(bot: BotRow, guildId: string, path: 'channels' | 'roles') {
  const res = await discordFetch(`/guilds/${guildId}/${path}`, { token: decryptToken(bot.tokenEncrypted) });
  if (!res.ok) throw httpError(502, `gagal mengambil ${path} dari Discord (HTTP ${res.status})`);
  return res.json() as Promise<Array<{ id: string; name: string; type?: number; managed?: boolean }>>;
}

botsRouter.get('/:id/guilds/:guildId/channels', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const guildId = requireSnowflake(req.params.guildId);
  await assertBotInGuild(bot.id, guildId);
  const channels = await fetchGuildResource(bot, guildId, 'channels');
  res.json({
    // 0 = text, 4 = category (untuk tiket), 5 = announcement
    channels: channels.filter((c) => c.type === 0 || c.type === 4 || c.type === 5)
      .map((c) => ({ id: c.id, name: c.name, type: c.type ?? 0 })),
  });
}));

botsRouter.get('/:id/guilds/:guildId/roles', requireAuth, asyncHandler(async (req, res) => {
  const bot = await loadOwnedBot(req);
  const guildId = requireSnowflake(req.params.guildId);
  await assertBotInGuild(bot.id, guildId);
  const roles = await fetchGuildResource(bot, guildId, 'roles');
  res.json({ roles: roles.filter((r) => !r.managed && r.name !== '@everyone').map((r) => ({ id: r.id, name: r.name })) });
}));
