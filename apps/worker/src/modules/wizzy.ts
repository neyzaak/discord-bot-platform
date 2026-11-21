import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits, SlashCommandBuilder,
  type APIEmbed, type Interaction, type Message,
} from 'discord.js';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import {
  db, wizzyBattles, wizzyBuffs, wizzyCovens, wizzyCovenMembers, wizzyCreatures,
  wizzyFishing, wizzyInventory, wizzyUsers, type ModuleName,
} from '@platform/core';
import type { BotModule, CommandContext, ModuleCommand, ModuleCtx } from './types';

// ---- konstanta & data ----
const COLOR = 0x7b2ff7;
const FOOTER = 'Wizzy • Dunia Sihir';
const DAY = 86_400_000;

const RARITIES = {
  common: { label: 'Common', chance: 60, price: 10, emoji: '⚪' },
  uncommon: { label: 'Uncommon', chance: 25, price: 40, emoji: '🟢' },
  rare: { label: 'Rare', chance: 10, price: 150, emoji: '🔵' },
  epic: { label: 'Epic', chance: 4, price: 600, emoji: '🟣' },
  legendary: { label: 'Legendary', chance: 0.9, price: 3000, emoji: '🟡' },
  mythic: { label: 'Mythic', chance: 0.1, price: 25000, emoji: '🔴' },
} as const;
type Rarity = keyof typeof RARITIES;
const RARITY_KEYS = Object.keys(RARITIES) as Rarity[];

type Creature = { id: string; name: string; emoji: string; rarity: Rarity; elements: string[] };
const CREATURES: Creature[] = [
  { id: 'pixie', name: 'Pixie', emoji: '🧚', rarity: 'common', elements: ['Angin'] },
  { id: 'niffler', name: 'Niffler', emoji: '🦡', rarity: 'common', elements: ['Tanah'] },
  { id: 'bowtruckle', name: 'Bowtruckle', emoji: '🌿', rarity: 'common', elements: ['Tanah'] },
  { id: 'firecrab', name: 'Fire Crab', emoji: '🦀', rarity: 'common', elements: ['Api'] },
  { id: 'hippogriff', name: 'Hippogriff', emoji: '🦅', rarity: 'uncommon', elements: ['Angin'] },
  { id: 'kelpie', name: 'Kelpie', emoji: '🐴', rarity: 'uncommon', elements: ['Air'] },
  { id: 'puffskein', name: 'Puffskein', emoji: '🐹', rarity: 'uncommon', elements: ['Cahaya'] },
  { id: 'unicorn', name: 'Unicorn', emoji: '🦄', rarity: 'rare', elements: ['Cahaya'] },
  { id: 'centaur', name: 'Centaur', emoji: '🏹', rarity: 'rare', elements: ['Tanah'] },
  { id: 'merfolk', name: 'Merfolk', emoji: '🧜', rarity: 'rare', elements: ['Air'] },
  { id: 'thestral', name: 'Thestral', emoji: '💀', rarity: 'epic', elements: ['Gelap'] },
  { id: 'basilisk', name: 'Basilisk', emoji: '🐍', rarity: 'epic', elements: ['Gelap'] },
  { id: 'griffin', name: 'Griffin', emoji: '🦁', rarity: 'epic', elements: ['Api'] },
  { id: 'phoenix', name: 'Phoenix', emoji: '🔥', rarity: 'legendary', elements: ['Api'] },
  { id: 'dragon', name: 'Dragon', emoji: '🐲', rarity: 'legendary', elements: ['Api'] },
  { id: 'kraken', name: 'Kraken', emoji: '🦑', rarity: 'legendary', elements: ['Air'] },
  { id: 'archmage', name: 'Archmage Spirit', emoji: '🌌', rarity: 'mythic', elements: ['Cahaya', 'Gelap'] },
  { id: 'wyrm', name: 'Ancient Wyrm', emoji: '🐉', rarity: 'mythic', elements: ['Api', 'Air', 'Angin', 'Tanah', 'Cahaya', 'Gelap'] },
];
const byId = Object.fromEntries(CREATURES.map((c) => [c.id, c])) as Record<string, Creature>;

type Item = { id: string; name: string; emoji: string; type: 'potion' | 'wand' | 'upgrade'; price: number; desc: string; atk?: number; elemBonus?: number };
const ITEMS: Item[] = [
  { id: 'potion_hp', name: 'Ramuan HP', emoji: '🧪', type: 'potion', price: 100, desc: 'Battle berikutnya: HP seluruh tim +25%' },
  { id: 'potion_lucky', name: 'Ramuan Lucky', emoji: '🍀', type: 'potion', price: 300, desc: '30 menit: peluang rarity tinggi x2 saat berburu' },
  { id: 'wand_wood', name: 'Wand Kayu', emoji: '🪄', type: 'wand', price: 500, atk: 5, desc: '+5 ATK semua makhluk' },
  { id: 'wand_elder', name: 'Wand Elder', emoji: '🪄', type: 'wand', price: 5000, atk: 15, desc: '+15 ATK semua makhluk' },
  { id: 'wand_element', name: 'Wand Elemen', emoji: '🔮', type: 'wand', price: 20000, atk: 10, elemBonus: 0.3, desc: '+10 ATK & serangan efektif +30% lebih kuat' },
  { id: 'team_slot', name: 'Slot Tim Tambahan', emoji: '➕', type: 'upgrade', price: 10000, desc: '+1 slot tim (maks 5)' },
];
const itemById = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<string, Item>;
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const findItem = (s: unknown) => {
  const n = norm(s);
  return n ? ITEMS.find((i) => i.id === n || norm(i.id) === n || norm(i.name) === n || i.id.endsWith(`_${n}`)) ?? null : null;
};
const findCreature = (s: unknown) => {
  const n = norm(s);
  return n ? CREATURES.find((c) => c.id === n || norm(c.name) === n) ?? null : null;
};

const HOUSES = ['Ignis 🔥', 'Aqua 💧', 'Ventus 🌪️', 'Terra 🪨'];
const fmt = (n: number) => n.toLocaleString('id-ID');
const embed = (title: string, description: string, color = COLOR): APIEmbed => ({ title, description, color, footer: { text: FOOTER } });

// ---- data memancing ----
const FISH_COOLDOWN_MS = 8_000;
const PULL_WINDOW_MS = 4_000;
const TRASH_CHANCE = 0.08;
const REPAIR_COST_PER_POINT = 2;

const FRARITY = {
  common: { label: 'Biasa', color: 0x95a5a6, weight: 60, xp: 10, luckMul: 0 },
  uncommon: { label: 'Tidak Umum', color: 0x2ecc71, weight: 25, xp: 25, luckMul: 1 },
  rare: { label: 'Langka', color: 0x3498db, weight: 10, xp: 60, luckMul: 2 },
  epic: { label: 'Epik', color: 0x9b59b6, weight: 4, xp: 150, luckMul: 3 },
  legendary: { label: 'Legendaris', color: 0xf1c40f, weight: 1, xp: 400, luckMul: 4 },
  trash: { label: 'Sampah', color: 0x7f8c8d, weight: 0, xp: 2, luckMul: 0 },
} as const;
type FRarity = keyof typeof FRARITY;
const FLOCATIONS = {
  kolam: { name: 'Kolam', emoji: '🪷', level: 1 },
  sungai: { name: 'Sungai', emoji: '🏞️', level: 3 },
  danau: { name: 'Danau', emoji: '🌄', level: 6 },
  laut: { name: 'Laut', emoji: '🌊', level: 10 },
  dalam: { name: 'Laut Dalam', emoji: '🌌', level: 15 },
} as const;
type FishDef = { name: string; emoji: string; rarity: FRarity; min: number; max: number; price: number; loc: string[] };
const FISH: Record<string, FishDef> = {
  lele: { name: 'Ikan Lele', emoji: '🐟', rarity: 'common', min: 0.3, max: 1.5, price: 12, loc: ['kolam', 'sungai'] },
  mujair: { name: 'Ikan Mujair', emoji: '🐟', rarity: 'common', min: 0.2, max: 1, price: 14, loc: ['kolam', 'danau'] },
  nila: { name: 'Ikan Nila', emoji: '🐠', rarity: 'uncommon', min: 0.4, max: 2, price: 22, loc: ['kolam', 'sungai'] },
  koi: { name: 'Ikan Koi', emoji: '🎏', rarity: 'rare', min: 1, max: 4, price: 55, loc: ['kolam'] },
  koiemas: { name: 'Koi Emas', emoji: '✨', rarity: 'epic', min: 2, max: 6, price: 120, loc: ['kolam'] },
  naga: { name: 'Ikan Naga Kolam', emoji: '🐉', rarity: 'legendary', min: 5, max: 12, price: 300, loc: ['kolam'] },
  gabus: { name: 'Ikan Gabus', emoji: '🐟', rarity: 'common', min: 0.5, max: 2.5, price: 18, loc: ['sungai'] },
  patin: { name: 'Ikan Patin', emoji: '🐠', rarity: 'uncommon', min: 1, max: 4, price: 28, loc: ['sungai', 'danau'] },
  arwana: { name: 'Arwana', emoji: '🐲', rarity: 'epic', min: 2, max: 5, price: 150, loc: ['sungai'] },
  belida: { name: 'Ikan Belida', emoji: '🐡', rarity: 'rare', min: 1.5, max: 5, price: 70, loc: ['sungai'] },
  bawal: { name: 'Ikan Bawal', emoji: '🐠', rarity: 'common', min: 0.4, max: 2, price: 20, loc: ['danau'] },
  mas: { name: 'Ikan Mas', emoji: '🐟', rarity: 'uncommon', min: 0.8, max: 3, price: 32, loc: ['danau'] },
  toman: { name: 'Ikan Toman', emoji: '🐊', rarity: 'rare', min: 3, max: 9, price: 85, loc: ['danau'] },
  pesut: { name: 'Pesut Danau', emoji: '🐬', rarity: 'legendary', min: 20, max: 60, price: 260, loc: ['danau'] },
  kembung: { name: 'Ikan Kembung', emoji: '🐟', rarity: 'common', min: 0.2, max: 1, price: 25, loc: ['laut'] },
  kakap: { name: 'Ikan Kakap', emoji: '🐠', rarity: 'uncommon', min: 1, max: 6, price: 45, loc: ['laut'] },
  tuna: { name: 'Ikan Tuna', emoji: '🐟', rarity: 'rare', min: 10, max: 80, price: 40, loc: ['laut', 'dalam'] },
  hiu: { name: 'Hiu Kecil', emoji: '🦈', rarity: 'epic', min: 20, max: 120, price: 35, loc: ['laut'] },
  gurita: { name: 'Gurita', emoji: '🐙', rarity: 'rare', min: 2, max: 12, price: 60, loc: ['laut'] },
  lanternfish: { name: 'Ikan Lentera', emoji: '🔦', rarity: 'common', min: 0.1, max: 0.8, price: 60, loc: ['dalam'] },
  anglerfish: { name: 'Ikan Pemancing', emoji: '👹', rarity: 'uncommon', min: 0.5, max: 4, price: 85, loc: ['dalam'] },
  cumicumi: { name: 'Cumi Raksasa', emoji: '🦑', rarity: 'epic', min: 50, max: 250, price: 25, loc: ['dalam'] },
  paus: { name: 'Paus Mini', emoji: '🐋', rarity: 'legendary', min: 300, max: 900, price: 6, loc: ['laut', 'dalam'] },
  kraken: { name: 'Kraken Bayi', emoji: '🦑', rarity: 'legendary', min: 100, max: 400, price: 14, loc: ['dalam'] },
};
const TRASH: Record<string, FishDef> = {
  sepatu: { name: 'Sepatu Bot Bekas', emoji: '👢', rarity: 'trash', min: 0.3, max: 0.9, price: 3, loc: [] },
  kaleng: { name: 'Kaleng Karatan', emoji: '🥫', rarity: 'trash', min: 0.1, max: 0.3, price: 4, loc: [] },
  ranting: { name: 'Ranting Basah', emoji: '🪵', rarity: 'trash', min: 0.2, max: 1, price: 2, loc: [] },
  botol: { name: 'Botol Plastik', emoji: '🍼', rarity: 'trash', min: 0.05, max: 0.2, price: 5, loc: [] },
};
const ALL_FISH: Record<string, FishDef> = { ...FISH, ...TRASH };
const RODS = {
  bambu: { name: 'Joran Bambu', emoji: '🎋', price: 0, level: 1, dur: 50, luck: 0 },
  fiberglass: { name: 'Joran Fiberglass', emoji: '🎣', price: 500, level: 3, dur: 100, luck: 0.15 },
  karbon: { name: 'Joran Karbon', emoji: '⚡', price: 2500, level: 8, dur: 200, luck: 0.35 },
  emas: { name: 'Joran Emas', emoji: '👑', price: 15000, level: 15, dur: 400, luck: 0.7 },
} as const;
type RodKey = keyof typeof RODS;
const BAITS = {
  cacing: { name: 'Cacing', emoji: '🪱', price: 10, luck: 0.05 },
  udang: { name: 'Udang Segar', emoji: '🦐', price: 35, luck: 0.2 },
  emas: { name: 'Umpan Emas', emoji: '🌟', price: 150, luck: 0.5 },
} as const;
type BaitKey = keyof typeof BAITS;
const kg = (n: number) => `${n.toFixed(2)} kg`;
const rand = (a: number, b: number) => Math.random() * (b - a) + a;
const findFish = (s: unknown): [string, FishDef] | null => {
  const n = norm(s);
  return n ? Object.entries(ALL_FISH).find(([id, f]) => id === n || norm(f.name) === n) ?? null : null;
};

type FishingData = {
  rod: RodKey; rodDur: number; bait: Partial<Record<BaitKey, number>>;
  inv: Record<string, { count: number; kg: number }>;
  stats: { caught: number; escaped: number; biggest: number; biggestName: string };
};
const newFishingData = (): FishingData => ({
  rod: 'bambu', rodDur: RODS.bambu.dur, bait: {}, inv: {},
  stats: { caught: 0, escaped: 0, biggest: 0, biggestName: '-' },
});

type AnyCtx = CommandContext | ModuleCtx;
const num = (ctx: AnyCtx, key: string, def: number) => {
  const v = Number((ctx.config as Record<string, unknown>)[key]);
  return Number.isFinite(v) && v > 0 ? v : def;
};
const cur = (ctx: AnyCtx) => String((ctx.config as Record<string, unknown>).currency || 'Galleon');

// ---- db helpers ----
type UserRow = typeof wizzyUsers.$inferSelect;
const getUser = async (botId: number, id: string) =>
  (await db.select().from(wizzyUsers).where(and(eq(wizzyUsers.botId, botId), eq(wizzyUsers.discordUserId, id))).limit(1))[0];
const getCreatures = async (botId: number, id: string) =>
  db.select().from(wizzyCreatures).where(and(eq(wizzyCreatures.botId, botId), eq(wizzyCreatures.discordUserId, id)));
const getTeam = async (botId: number, id: string) =>
  db.select().from(wizzyCreatures)
    .where(and(eq(wizzyCreatures.botId, botId), eq(wizzyCreatures.discordUserId, id), eq(wizzyCreatures.isInTeam, true)))
    .orderBy(wizzyCreatures.id);
const addCreature = (botId: number, id: string, creatureId: string) =>
  db.insert(wizzyCreatures).values({ botId, discordUserId: id, creatureId });
const addGalleons = (botId: number, id: string, amount: number) =>
  db.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} + ${amount}` })
    .where(and(eq(wizzyUsers.botId, botId), eq(wizzyUsers.discordUserId, id)));
const spend = async (botId: number, id: string, amount: number) => {
  const r = await db.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} - ${amount}` })
    .where(and(eq(wizzyUsers.botId, botId), eq(wizzyUsers.discordUserId, id), sql`${wizzyUsers.galleons} >= ${amount}`))
    .returning({ id: wizzyUsers.id });
  return r.length > 0;
};
async function addXp(botId: number, id: string, amount: number, maxLevel: number) {
  const u = await getUser(botId, id);
  if (!u) return { levelUp: false, level: 0 };
  let xp = u.xp + amount, level = u.level;
  while (level < maxLevel && xp >= level * 100) { xp -= level * 100; level++; }
  if (level >= maxLevel) xp = 0;
  await db.update(wizzyUsers).set({ xp, level }).where(eq(wizzyUsers.id, u.id));
  return { levelUp: level > u.level, level };
}
const needUser = async (ctx: CommandContext) => {
  const u = await getUser(ctx.botId, ctx.user.id);
  if (!u) await ctx.reply(`Kamu belum mulai! Ketik \`${'g'}start\` dulu 🧙‍♂️`);
  return u;
};
const mentionId = (raw: unknown) => {
  if (raw && typeof raw === 'object') return (raw as { id?: string }).id ?? null;
  const t = String(raw ?? '');
  return t.match(/^<@!?(\d+)>$/)?.[1] ?? (/^\d{5,25}$/.test(t) ? t : null);
};

const getQty = async (botId: number, id: string, itemId: string) =>
  (await db.select().from(wizzyInventory).where(and(eq(wizzyInventory.botId, botId), eq(wizzyInventory.discordUserId, id), eq(wizzyInventory.itemId, itemId))).limit(1))[0]?.quantity ?? 0;
const addItem = (botId: number, id: string, itemId: string, qty: number) =>
  db.insert(wizzyInventory).values({ botId, discordUserId: id, itemId, quantity: qty })
    .onConflictDoUpdate({
      target: [wizzyInventory.botId, wizzyInventory.discordUserId, wizzyInventory.itemId],
      set: { quantity: sql`${wizzyInventory.quantity} + ${qty}` },
    });
const removeItem = async (botId: number, id: string, itemId: string, qty: number) => {
  const r = await db.update(wizzyInventory).set({ quantity: sql`${wizzyInventory.quantity} - ${qty}` })
    .where(and(eq(wizzyInventory.botId, botId), eq(wizzyInventory.discordUserId, id), eq(wizzyInventory.itemId, itemId), sql`${wizzyInventory.quantity} >= ${qty}`))
    .returning({ id: wizzyInventory.id });
  if (r.length) await db.delete(wizzyInventory).where(and(
    eq(wizzyInventory.botId, botId), eq(wizzyInventory.discordUserId, id),
    eq(wizzyInventory.itemId, itemId), sql`${wizzyInventory.quantity} <= 0`,
  ));
  return r.length > 0;
};
const hasBuff = async (botId: number, id: string, buff: string) =>
  (await db.select().from(wizzyBuffs).where(and(eq(wizzyBuffs.botId, botId), eq(wizzyBuffs.discordUserId, id), eq(wizzyBuffs.buff, buff), gt(wizzyBuffs.expiresAt, new Date()))).limit(1)).length > 0;
const setBuff = (botId: number, id: string, buff: string, ms: number) =>
  db.insert(wizzyBuffs).values({ botId, discordUserId: id, buff, expiresAt: new Date(Date.now() + ms) })
    .onConflictDoUpdate({
      target: [wizzyBuffs.botId, wizzyBuffs.discordUserId, wizzyBuffs.buff],
      set: { expiresAt: new Date(Date.now() + ms) },
    });
const clearBuff = (botId: number, id: string, buff: string) =>
  db.delete(wizzyBuffs).where(and(eq(wizzyBuffs.botId, botId), eq(wizzyBuffs.discordUserId, id), eq(wizzyBuffs.buff, buff)));
const myCoven = async (botId: number, id: string) =>
  (await db.select({ c: wizzyCovens, role: wizzyCovenMembers.role })
    .from(wizzyCovenMembers)
    .innerJoin(wizzyCovens, eq(wizzyCovens.id, wizzyCovenMembers.covenId))
    .where(and(eq(wizzyCovenMembers.botId, botId), eq(wizzyCovenMembers.discordUserId, id))).limit(1))[0];

const getFishing = async (botId: number, id: string): Promise<FishingData> => {
  const row = (await db.select().from(wizzyFishing)
    .where(and(eq(wizzyFishing.botId, botId), eq(wizzyFishing.discordUserId, id))).limit(1))[0];
  const d = (row?.data ?? {}) as Partial<FishingData>;
  const base = newFishingData();
  return { ...base, ...d, bait: { ...d.bait }, inv: { ...d.inv }, stats: { ...base.stats, ...d.stats } };
};
const saveFishing = (botId: number, id: string, data: FishingData) =>
  db.insert(wizzyFishing).values({ botId, discordUserId: id, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [wizzyFishing.botId, wizzyFishing.discordUserId],
      set: { data, updatedAt: new Date() },
    });

// ---- battle engine ----
const CYCLE: Record<string, string> = { Api: 'Angin', Angin: 'Tanah', Tanah: 'Air', Air: 'Api' };
const SKILLS: Record<string, { name: string; desc: string }> = {
  Api: { name: 'Semburan Api', desc: 'Serangan x1,8' },
  Air: { name: 'Penyembuhan Air', desc: 'Pulihkan 30% HP' },
  Angin: { name: 'Badai Ganda', desc: 'Serang 2x (x0,8)' },
  Tanah: { name: 'Perisai Bumi', desc: 'Perisai 30% HP maksimum' },
  Cahaya: { name: 'Cahaya Suci', desc: 'Pulihkan 20% HP + serang x1,2' },
  Gelap: { name: 'Sedot Jiwa', desc: 'Serang x1,5, sedot 50% damage jadi HP' },
};
const BASE: Record<Rarity, { hp: number; atk: number; def: number; spd: number }> = {
  common: { hp: 50, atk: 10, def: 5, spd: 10 },
  uncommon: { hp: 70, atk: 14, def: 8, spd: 12 },
  rare: { hp: 100, atk: 20, def: 12, spd: 14 },
  epic: { hp: 150, atk: 30, def: 18, spd: 16 },
  legendary: { hp: 220, atk: 45, def: 28, spd: 20 },
  mythic: { hp: 350, atk: 70, def: 45, spd: 25 },
};
const statsFor = (type: Creature, level = 1) => {
  const b = BASE[type.rarity], m = 1 + 0.08 * (level - 1);
  return {
    hp: Math.round(b.hp * m), atk: Math.round(b.atk * m), def: Math.round(b.def * m),
    spd: Math.round(b.spd * (1 + 0.02 * (level - 1))),
  };
};
const feedCost = (level: number) => level * 50;
type Fighter = {
  id: string; name: string; emoji: string; elements: string[]; level: number;
  maxHp: number; hp: number; atk: number; def: number; spd: number;
  cd: number; shield: number; revive: boolean; side: 'A' | 'B'; elemBonus: number;
};
function makeFighter(type: Creature, level: number, side: 'A' | 'B', wand?: Item | null, hpBoost = 1): Fighter {
  const s = statsFor(type, level), hp = Math.round(s.hp * hpBoost);
  return {
    id: type.id, name: type.name, emoji: type.emoji, elements: type.elements, level,
    maxHp: hp, hp, atk: s.atk + (wand?.atk ?? 0), def: s.def, spd: s.spd,
    cd: 1, shield: 0, revive: type.id === 'phoenix', side, elemBonus: wand?.elemBonus ?? 0,
  };
}
const pairMult = (a: string, d: string) => {
  if (CYCLE[a] === d) return 1.5;
  if (CYCLE[d] === a) return 0.7;
  if ((a === 'Cahaya' && d === 'Gelap') || (a === 'Gelap' && d === 'Cahaya')) return 1.5;
  return 1;
};
const elemMult = (atk: string[], def: string[], bonus = 0) => {
  const d = def[0]!;
  let best = -1;
  for (const a of atk) best = Math.max(best, pairMult(a, d));
  return best > 1 ? best + bonus : best;
};
const tag = (f: Fighter) => `${f.side === 'A' ? '🔵' : '🔴'}${f.emoji}${f.name}`;
const alive = (arr: Fighter[]) => arr.filter((f) => f.hp > 0);
const rnd = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
function hit(f: Fighter, t: Fighter, mult: number, log: string[], label: string) {
  const em = elemMult(f.elements, t.elements, f.elemBonus);
  let dmg = ((f.atk * 100) / (100 + t.def)) * mult * em * (0.9 + Math.random() * 0.2);
  const crit = Math.random() < 0.1;
  if (crit) dmg *= 1.5;
  dmg = Math.max(1, Math.round(dmg));
  const total = dmg;
  if (t.shield > 0) { const abs = Math.min(t.shield, dmg); t.shield -= abs; dmg -= abs; }
  t.hp -= dmg;
  log.push(`${tag(f)} ${label} ${tag(t)} **-${total}**${em > 1 ? ' ⚡' : em < 1 ? ' 🛡️' : ''}${crit ? ' 💥' : ''}`);
  if (t.hp <= 0) {
    if (t.revive) { t.revive = false; t.hp = Math.round(t.maxHp * 0.5); log.push(`🔥 ${tag(t)} bangkit lagi dengan **Rebirth**!`); }
    else log.push(`💀 ${tag(t)} tumbang`);
  }
  return dmg;
}
function heal(f: Fighter, amount: number, log: string[], label: string) {
  const before = f.hp;
  f.hp = Math.min(f.maxHp, f.hp + amount);
  log.push(`${tag(f)} ${label} **+${f.hp - before} HP**`);
}
function act(f: Fighter, foes: Fighter[], log: string[]) {
  const t = rnd(foes);
  if (f.cd > 0) { f.cd--; hit(f, t, 1, log, '⚔️'); return; }
  f.cd = 3;
  switch (f.elements[0]) {
    case 'Api': hit(f, t, 1.8, log, '🔥 Semburan Api →'); break;
    case 'Air': heal(f, Math.round(f.maxHp * 0.3), log, '💧 Penyembuhan Air'); break;
    case 'Angin': {
      hit(f, t, 0.8, log, '🌪️ Badai →');
      const rest = alive(foes);
      if (rest.length) hit(f, rnd(rest), 0.8, log, '🌪️ Badai →');
      break;
    }
    case 'Tanah': {
      const s = Math.round(f.maxHp * 0.3);
      f.shield += s;
      log.push(`${tag(f)} 🪨 Perisai Bumi **+${s} perisai**`);
      break;
    }
    case 'Cahaya': heal(f, Math.round(f.maxHp * 0.2), log, '✨ Cahaya Suci'); hit(f, t, 1.2, log, '✨ →'); break;
    case 'Gelap': { const d = hit(f, t, 1.5, log, '🌑 Sedot Jiwa →'); heal(f, Math.round(d * 0.5), log, '🌑 menyedot'); break; }
    default: hit(f, t, 1, log, '⚔️');
  }
}
function simulate(A: Fighter[], B: Fighter[]) {
  const log: string[] = [], all = [...A, ...B];
  let round = 0;
  while (round < 15 && alive(A).length && alive(B).length) {
    round++;
    log.push(`**— Giliran ${round} —**`);
    const order = alive(all).sort((x, y) => y.spd - x.spd || Math.random() - 0.5);
    for (const f of order) {
      if (f.hp <= 0) continue;
      const foes = alive(f.side === 'A' ? B : A);
      if (!foes.length) break;
      act(f, foes, log);
    }
  }
  const a = alive(A).length, b = alive(B).length;
  return { winner: a && !b ? 'A' as const : b && !a ? 'B' as const : 'draw' as const, log, rounds: round };
}
const renderLog = (log: string[]) => {
  const t = log.join('\n');
  if (t.length <= 3300) return t;
  const cut = t.slice(-3300);
  return `…${cut.slice(cut.indexOf('\n'))}`;
};
const summary = (arr: Fighter[]) => arr.map((f) => `${f.emoji}${Math.max(0, f.hp)}/${f.maxHp}`).join(' ');

const rollRarity = (lucky: boolean): Rarity => {
  const entries = RARITY_KEYS.map((k) => [k, k === 'common' || !lucky ? RARITIES[k].chance : RARITIES[k].chance * 2] as const);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  let roll = Math.random() * total;
  for (const [key, c] of entries) { roll -= c; if (roll <= 0) return key; }
  return 'common';
};
const pickOf = (rarity: Rarity) => rnd(CREATURES.filter((c) => c.rarity === rarity));
const hunt = (lucky: boolean) => Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => pickOf(rollRarity(lucky)));
async function prepare(botId: number, id: string, side: 'A' | 'B', consumeBoost: boolean) {
  const u = await getUser(botId, id);
  if (!u) return [];
  const wand = u.wand ? itemById[u.wand] ?? null : null;
  const boosted = await hasBuff(botId, id, 'hpboost');
  if (boosted && consumeBoost) await clearBuff(botId, id, 'hpboost');
  const teamRows = await getTeam(botId, id);
  return teamRows.flatMap((c) => {
    const t = byId[c.creatureId];
    return t ? [makeFighter(t, c.level, side, wand, boosted ? 1.25 : 1)] : [];
  });
}

// ---- command helper ----
type ArgSpec = { name: string; description: string; type?: 'user' | 'int' | 'string'; rest?: boolean };
type Run = (ctx: CommandContext, args: Record<string, unknown>) => Promise<unknown>;
function cmd(name: string, description: string, run: Run, args: ArgSpec[] = []): ModuleCommand {
  return {
    name, description,
    args: args.map((a) => ({ name: a.name, type: a.type ?? 'string', rest: a.rest })),
    buildSlash: () => {
      const b = new SlashCommandBuilder().setName(name).setDescription(description);
      for (const a of args) {
        if (a.type === 'user') b.addUserOption((o) => o.setName(a.name).setDescription(a.description).setRequired(false));
        else if (a.type === 'int') b.addIntegerOption((o) => o.setName(a.name).setDescription(a.description).setRequired(false));
        else b.addStringOption((o) => o.setName(a.name).setDescription(a.description).setRequired(false));
      }
      return b.toJSON();
    },
    execute: run,
  };
}
const userArg = (name = 'user', description = 'ID atau mention user (kosong = diri sendiri)'): ArgSpec => ({ name, description, type: 'user' });
const strArg = (name: string, description: string, rest = false): ArgSpec => ({ name, description, rest });

const parseAmount = (s: unknown, max: number) => {
  if (String(s ?? '').toLowerCase() === 'all') return max > 0 ? max : null;
  const n = Number.parseInt(String(s ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
};
const boardRows = async (botId: number, kind: string) => {
  if (kind === 'zoo') return db.select({ id: wizzyCreatures.discordUserId, v: sql<number>`count(*)::int` }).from(wizzyCreatures)
    .where(eq(wizzyCreatures.botId, botId)).groupBy(wizzyCreatures.discordUserId).orderBy(sql`count(*) desc`).limit(10);
  if (kind === 'battle') return db.select({ id: wizzyUsers.discordUserId, v: wizzyUsers.rankPoints, wins: wizzyUsers.wins }).from(wizzyUsers)
    .where(eq(wizzyUsers.botId, botId)).orderBy(desc(wizzyUsers.rankPoints), desc(wizzyUsers.wins)).limit(10);
  if (kind === 'coven') return db.select({ id: wizzyCovens.name, v: wizzyCovens.bank }).from(wizzyCovens)
    .where(eq(wizzyCovens.botId, botId)).orderBy(desc(wizzyCovens.bank)).limit(10);
  return db.select({ id: wizzyUsers.discordUserId, v: wizzyUsers.galleons }).from(wizzyUsers)
    .where(eq(wizzyUsers.botId, botId)).orderBy(desc(wizzyUsers.galleons)).limit(10);
};
const sendBoard = async (ctx: CommandContext, kind: string) => {
  const rows = await boardRows(ctx.botId, kind);
  const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `**${i + 1}.**`;
  const title = kind === 'zoo' ? '🦄 Top Kolektor' : kind === 'battle' ? '⚔️ Peringkat Battle' : kind === 'coven' ? '🏰 Coven Terkaya' : '💰 Top Galleon';
  const unit = kind === 'zoo' ? 'makhluk' : kind === 'battle' ? 'RP' : 'Galleon';
  const lines = rows.map((r, i) => `${medal(i)} ${kind === 'coven' ? `**${r.id}**` : `<@${r.id}>`} — ${fmt(r.v)} ${unit}${'wins' in r && kind === 'battle' ? ` (${r.wins} menang)` : ''}`);
  await ctx.reply({ embeds: [embed(title, lines.join('\n') || 'Belum ada data.')] });
};

// ---- tombol battle / trade / spawn (prefix-only) ----
type Pending =
  | { kind: 'b'; challenger: string; challengerName: string; target: string; bet: number; msg: Message; timer?: NodeJS.Timeout }
  | { kind: 't'; challenger: string; challengerName: string; target: string; mine: string; theirs: string; msg: Message; timer?: NodeJS.Timeout }
  | { kind: 's'; creatureId: string; msg: Message; timer?: NodeJS.Timeout }
  | { kind: 'f'; botId: number; fisher: string; rod: RodKey; bait: BaitKey | null; loc: string; msg: Message; timer?: NodeJS.Timeout };
const pending = new Map<string, Pending>();

function buttonRow(kind: Pending['kind'], kid: string, disabled = false) {
  const specs = kind === 'b'
    ? [['acc', 'Terima', ButtonStyle.Success], ['dec', 'Tolak', ButtonStyle.Danger]]
    : kind === 't'
      ? [['ok', 'Setuju', ButtonStyle.Success], ['no', 'Tolak', ButtonStyle.Danger]]
      : kind === 'f'
        ? [['pull', 'TARIK!', ButtonStyle.Success]]
        : [['catch', 'Tangkap!', ButtonStyle.Primary]];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...specs.map(([id, label, style]) =>
    new ButtonBuilder().setCustomId(`wiz:${kind}:${id}:${kid}`).setLabel(String(label)).setStyle(style as ButtonStyle).setDisabled(disabled)));
}
const sendWithButtons = (ctx: CommandContext, kind: Pending['kind'], kid: string, embeds: APIEmbed[], mention = '') =>
  ctx.sourceMessage!.reply({ ...(mention ? { content: mention } : {}), embeds, components: [buttonRow(kind, kid)], allowedMentions: { parse: [] } });
const busy = new Set<string>();
const fishingInProgress = new Set<string>();
const fishCooldowns = new Map<string, number>();
const unbusy = (p: Pending) => {
  if (p.kind === 's' || p.kind === 'f') return;
  busy.delete(p.challenger);
  busy.delete(p.target);
};
const armTimeout = (kid: string, msg: Message, kind: Pending['kind'], p: Pending, ms = 60_000, expired = embed('⏳ Kedaluwarsa', 'Tawaran tidak dijawab dalam 60 detik.')) => {
  const timer = setTimeout(async () => {
    if (!pending.has(kid)) return;
    pending.delete(kid);
    unbusy(p);
    if (p.kind === 'f') {
      fishingInProgress.delete(p.fisher);
      fishCooldowns.set(p.fisher, Date.now() + FISH_COOLDOWN_MS);
      void getFishing(p.botId, p.fisher).then(async (f) => {
        f.stats.escaped++;
        await saveFishing(p.botId, p.fisher, f);
      }).catch(() => {});
    }
    await msg.edit({ components: [buttonRow(kind, kid, true)], embeds: [expired] }).catch(() => {});
  }, ms);
  timer.unref?.();
  return timer;
};
const newKid = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const arm = (kid: string, msg: Message, p: Pending) => { p.timer = armTimeout(kid, msg, p.kind, p); return p.timer; };

async function resolveFishing(ctx: AnyCtx, p: Extract<Pending, { kind: 'f' }>): Promise<APIEmbed> {
  fishCooldowns.set(p.fisher, Date.now() + FISH_COOLDOWN_MS);
  fishingInProgress.delete(p.fisher);
  const f = await getFishing(ctx.botId, p.fisher);
  let item: [string, FishDef];
  if (Math.random() < TRASH_CHANCE) {
    const keys = Object.keys(TRASH);
    const id = keys[Math.floor(Math.random() * keys.length)]!;
    item = [id, TRASH[id]!];
  } else {
    const luck = RODS[p.rod].luck + (p.bait ? BAITS[p.bait].luck : 0);
    const pool = Object.entries(FISH).filter(([, d]) => d.loc.includes(p.loc));
    const weights = (Object.keys(FRARITY) as FRarity[]).filter((k) => k !== 'trash')
      .map((k) => [k, FRARITY[k].weight * (1 + luck * FRARITY[k].luckMul)] as const)
      .filter(([k]) => pool.some(([, d]) => d.rarity === k));
    const total = weights.reduce((s, [, w]) => s + w, 0);
    let roll = Math.random() * total;
    let chosen: FRarity = weights[0]![0];
    for (const [k, w] of weights) { roll -= w; if (roll <= 0) { chosen = k; break; } }
    const candidates = pool.filter(([, d]) => d.rarity === chosen);
    item = candidates[Math.floor(Math.random() * candidates.length)]!;
  }
  const [id, def] = item;
  const weight = Math.round(rand(def.min, def.max) * 100) / 100;
  const old = f.inv[id] ?? { count: 0, kg: 0 };
  f.inv[id] = { count: old.count + 1, kg: Math.round((old.kg + weight) * 100) / 100 };
  f.stats.caught++;
  const isRecord = def.rarity !== 'trash' && weight > f.stats.biggest;
  if (isRecord) { f.stats.biggest = weight; f.stats.biggestName = def.name; }
  await saveFishing(ctx.botId, p.fisher, f);
  const leveled = await addXp(ctx.botId, p.fisher, FRARITY[def.rarity].xp, num(ctx, 'maxLevel', 50));
  const r = FRARITY[def.rarity];
  const e = embed(`${def.emoji} Kamu mendapat ${def.name}!`, isRecord ? '🏆 **Rekor pribadi baru!**' : '', r.color);
  e.fields = [
    { name: 'Kelangkaan', value: r.label, inline: true },
    { name: 'Berat', value: kg(weight), inline: true },
    { name: 'Nilai Jual', value: `${fmt(Math.ceil(weight * def.price))} ${cur(ctx)}`, inline: true },
    { name: 'XP', value: `+${r.xp}`, inline: true },
    { name: 'Durabilitas joran', value: `${f.rodDur}/${RODS[f.rod].dur}`, inline: true },
  ];
  if (leveled.levelUp) e.fields.push({ name: '🎉 Naik Level!', value: `Sekarang level **${leveled.level}**` });
  return e;
}

async function resolveBattle(ctx: CommandContext, p: Extract<Pending, { kind: 'b' }>, accepted: boolean) {
  if (!accepted) return embed('⚔️ Battle', 'Tantangan ditolak.');
  const [a, b] = await Promise.all([getUser(ctx.botId, p.challenger), getUser(ctx.botId, p.target)]);
  if (!a || !b) return embed('⚔️ Battle', 'Salah satu pemain tidak ditemukan.');
  if (p.bet > a.galleons || p.bet > b.galleons) return embed('⚔️ Battle', 'Saldo salah satu pemain tidak cukup lagi.');
  const [A, B] = await Promise.all([prepare(ctx.botId, a.discordUserId, 'A', true), prepare(ctx.botId, b.discordUserId, 'B', true)]);
  if (!A.length || !B.length) return embed('⚔️ Battle', 'Tim salah satu pemain kosong. `gteam add <nama>`');
  const res = simulate(A, B);
  let footer = '';
  await db.transaction(async (tx) => {
    if (res.winner === 'draw') { footer = '🤝 **Seri!** (batas 15 giliran) — tidak ada taruhan yang berpindah.'; }
    else {
      const w = res.winner === 'A' ? a : b, l = res.winner === 'A' ? b : a;
      let paid = 0;
      if (p.bet > 0) {
        const r = await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} - ${p.bet}` })
          .where(and(eq(wizzyUsers.id, l.id), sql`${wizzyUsers.galleons} >= ${p.bet}`)).returning({ id: wizzyUsers.id });
        if (r.length) paid = p.bet;
      }
      await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} + ${paid + 50}` }).where(eq(wizzyUsers.id, w.id));
      await tx.update(wizzyUsers).set({ wins: sql`${wizzyUsers.wins} + 1`, rankPoints: sql`${wizzyUsers.rankPoints} + 25` }).where(eq(wizzyUsers.id, w.id));
      await tx.update(wizzyUsers).set({ losses: sql`${wizzyUsers.losses} + 1`, rankPoints: sql`greatest(0, ${wizzyUsers.rankPoints} - 15)` }).where(eq(wizzyUsers.id, l.id));
      await tx.insert(wizzyBattles).values({ botId: ctx.botId, p1: a.discordUserId, p2: b.discordUserId, winner: w.discordUserId, bet: paid });
      footer = `🏆 **<@${w.discordUserId}> menang!** +${fmt(50 + paid)} ${cur(ctx)}, +30 XP, +25 RP`;
    }
  });
  if (res.winner !== 'draw') {
    await addXp(ctx.botId, res.winner === 'A' ? a.discordUserId : b.discordUserId, 30, num(ctx, 'maxLevel', 50));
    await addXp(ctx.botId, res.winner === 'A' ? b.discordUserId : a.discordUserId, 10, num(ctx, 'maxLevel', 50));
  }
  const e = embed(`⚔️ ${p.challengerName} vs <@${p.target}>`, renderLog(res.log));
  e.fields = [
    { name: `🔵 ${p.challengerName}`, value: summary(A), inline: true },
    { name: `🔴 <@${p.target}>`, value: summary(B), inline: true },
    { name: 'Hasil', value: footer },
  ];
  return e;
}

async function resolveTrade(ctx: CommandContext, p: Extract<Pending, { kind: 't' }>, accept: boolean) {
  if (!accept) return embed('🔁 Tukar', 'Tawaran ditolak.');
  const mine = byId[p.mine], theirs = byId[p.theirs];
  const fee = 50;
  let text = '';
  try {
    await db.transaction(async (tx) => {
      const rows = await tx.select().from(wizzyCreatures)
        .where(and(eq(wizzyCreatures.botId, ctx.botId), sql`${wizzyCreatures.discordUserId} in (${p.challenger}, ${p.target})`));
      const a = rows.find((c) => c.discordUserId === p.challenger && c.creatureId === p.mine && !c.isInTeam);
      const b = rows.find((c) => c.discordUserId === p.target && c.creatureId === p.theirs && !c.isInTeam);
      if (!a || !b) { text = 'Salah satu makhluk sudah tidak tersedia.'; throw new Error('invalid'); }
      for (const [uid, name] of [[p.challenger, p.challengerName], [p.target, `<@${p.target}>`]] as const) {
        const r = await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} - ${fee}` })
          .where(and(eq(wizzyUsers.botId, ctx.botId), eq(wizzyUsers.discordUserId, uid), sql`${wizzyUsers.galleons} >= ${fee}`))
          .returning({ id: wizzyUsers.id });
        if (!r.length) { text = `${name} tidak punya cukup ${cur(ctx)} untuk biaya.`; throw new Error('fee'); }
      }
      await tx.update(wizzyCreatures).set({ discordUserId: p.target }).where(eq(wizzyCreatures.id, a.id));
      await tx.update(wizzyCreatures).set({ discordUserId: p.challenger }).where(eq(wizzyCreatures.id, b.id));
      text = `✅ Tukar sukses! ${mine.emoji} ${mine.name} ⇄ ${theirs.emoji} ${theirs.name}`;
    });
  } catch { if (!text) text = 'Transaksi gagal, coba lagi.'; }
  return embed('🔁 Tukar', text);
}

// ---- commands ----
const commands: ModuleCommand[] = [
  cmd('start', 'Mulai petualangan di Dunia Sihir', async (ctx) => {
    if (await getUser(ctx.botId, ctx.user.id)) return ctx.reply('Kamu sudah punya akun, penyihir! Ketik `ghunt` untuk berburu.');
    const house = rnd(HOUSES);
    await db.insert(wizzyUsers).values({
      botId: ctx.botId, discordUserId: ctx.user.id, house,
      teamSlots: num(ctx, 'startingSlots', 3),
    });
    return ctx.reply({ embeds: [embed('✨ Selamat datang di Dunia Sihir!',
      `Topi seleksi memilihmu masuk house **${house}**!\nKamu mendapat **100 ${cur(ctx)}**.\n\nKetik \`ghunt\` untuk berburu makhluk pertamamu.`)] });
  }),

  cmd('profile', 'Kartu penyihir', async (ctx, args) => {
    const id = mentionId(args.user) ?? ctx.user.id;
    const u = await getUser(ctx.botId, id);
    if (!u) return ctx.reply(id === ctx.user.id ? 'Ketik `gstart` dulu!' : 'Pemain itu belum mulai.');
    const member = ctx.guild?.members.cache.get(id) ?? await ctx.guild?.members.fetch(id).catch(() => null);
    const display = member?.user ?? ctx.client.users.cache.get(id) ?? ctx.user;
    const owned = await getCreatures(ctx.botId, id);
    const cov = await myCoven(ctx.botId, id);
    const wand = u.wand ? itemById[u.wand] : null;
    const e = embed('🧙 Kartu Penyihir', `**${display.username}**`);
    e.thumbnail = { url: display.displayAvatarURL() };
    e.fields = [
      { name: 'House', value: u.house, inline: true },
      { name: 'Level', value: `${u.level} (${u.xp}/${u.level * 100} XP)`, inline: true },
      { name: cur(ctx), value: `💰 ${fmt(u.galleons)}`, inline: true },
      { name: 'Koleksi', value: `🐉 ${owned.length} makhluk`, inline: true },
      { name: 'Battle', value: `${u.wins}M / ${u.losses}K • ${u.rankPoints} RP`, inline: true },
      { name: 'Dex', value: `📖 ${new Set(owned.map((c) => c.creatureId)).size}/${CREATURES.length}`, inline: true },
      { name: 'Streak Daily', value: `🔥 ${u.dailyStreak}`, inline: true },
      { name: 'Wand', value: wand ? `${wand.emoji} ${wand.name}` : '—', inline: true },
      { name: 'Dungeon', value: `Lantai ${u.dungeonFloor}`, inline: true },
      { name: 'Coven', value: cov ? cov.c.name : '—', inline: true },
    ];
    return ctx.reply({ embeds: [e] });
  }, [userArg()]),

  cmd('daily', 'Klaim hadiah harian', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const now = Date.now();
    const since = u.lastDailyAt ? now - u.lastDailyAt.getTime() : DAY;
    if (since < DAY) {
      const left = DAY - since;
      return ctx.reply(`⏳ Daily berikutnya dalam **${Math.floor(left / 3_600_000)}j ${Math.floor((left % 3_600_000) / 60_000)}m**.`);
    }
    const streak = since < 2 * DAY ? Math.min(u.dailyStreak + 1, 30) : 1;
    const reward = 200 + streak * 20;
    await db.update(wizzyUsers).set({ dailyStreak: streak, lastDailyAt: new Date(now), galleons: sql`${wizzyUsers.galleons} + ${reward}` }).where(eq(wizzyUsers.id, u.id));
    return ctx.reply({ embeds: [embed('🎁 Hadiah Harian', `Kamu mendapat **${fmt(reward)} ${cur(ctx)}**!\n🔥 Streak: **${streak}** hari`)] });
  }),

  cmd('cash', 'Cek saldo', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    return ctx.reply(`💰 **${ctx.user.username}**, saldomu: **${fmt(u.galleons)} ${cur(ctx)}**`);
  }),

  cmd('give', 'Kirim uang ke pemain lain', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const id = mentionId(args.user);
    if (!id || id === ctx.user.id) return ctx.reply('Pakai: `ggive @user <jumlah>`');
    if (!await getUser(ctx.botId, id)) return ctx.reply('Pemain itu belum mulai.');
    const amt = parseAmount(args.amount, u.galleons);
    if (!amt) return ctx.reply('Masukkan jumlah yang valid.');
    const tax = Math.floor(amt * num(ctx, 'giveTaxPct', 5) / 100), net = amt - tax;
    await db.transaction(async (tx) => {
      await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} - ${amt}` }).where(eq(wizzyUsers.id, u.id));
      await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} + ${net}` })
        .where(and(eq(wizzyUsers.botId, ctx.botId), eq(wizzyUsers.discordUserId, id)));
    });
    return ctx.reply(`💸 Kamu mengirim **${fmt(amt)} ${cur(ctx)}** ke <@${id}>.\nPajak ${num(ctx, 'giveTaxPct', 5)}%: ${fmt(tax)} • Diterima: **${fmt(net)}**`);
  }, [userArg(), strArg('amount', 'Jumlah atau all')]),

  cmd('hunt', 'Berburu makhluk sihir', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const lucky = await hasBuff(ctx.botId, u.discordUserId, 'lucky');
    const caught = hunt(lucky);
    const total = caught.length;
    await db.transaction(async (tx) => {
      for (const c of caught) await tx.insert(wizzyCreatures).values({ botId: ctx.botId, discordUserId: u.discordUserId, creatureId: c.id });
    });
    const res = await addXp(ctx.botId, u.discordUserId, total * 5, num(ctx, 'maxLevel', 50));
    const lines = caught.map((c) => `${c.emoji} **${c.name}** ${RARITIES[c.rarity].emoji} ${RARITIES[c.rarity].label}`);
    let desc = `${ctx.user.username} berburu${lucky ? ' 🍀' : ''} dan menemukan:\n\n${lines.join('\n')}`;
    if (res.levelUp) desc += `\n\n🎉 **Naik ke level ${res.level}!**`;
    return ctx.reply({ embeds: [embed('🐉 Hasil Berburu', desc)] });
  }),

  cmd('autohunt', 'Berburu otomatis berkali-kali', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const max = num(ctx, 'autohuntMax', 20), costPer = num(ctx, 'autohuntCost', 100);
    const n = Math.min(Number.parseInt(String(args.n ?? ''), 10) || 0, max);
    if (n < 1) return ctx.reply(`Pakai: \`gautohunt <1-${max}>\`\nBiaya **${fmt(costPer)} ${cur(ctx)}** per buruan.`);
    const cost = n * costPer;
    if (!(await spend(ctx.botId, u.discordUserId, cost))) return ctx.reply(`Saldo kurang. Butuh **${fmt(cost)} ${cur(ctx)}**.`);
    const lucky = await hasBuff(ctx.botId, u.discordUserId, 'lucky');
    const tally: Partial<Record<Rarity, number>> = {}, notable: string[] = [];
    let total = 0;
    await db.transaction(async (tx) => {
      for (let i = 0; i < n; i++) for (const c of hunt(lucky)) {
        await tx.insert(wizzyCreatures).values({ botId: ctx.botId, discordUserId: u.discordUserId, creatureId: c.id });
        tally[c.rarity] = (tally[c.rarity] ?? 0) + 1;
        if (['epic', 'legendary', 'mythic'].includes(c.rarity)) notable.push(`${c.emoji} ${c.name}`);
        total++;
      }
    });
    const res = await addXp(ctx.botId, u.discordUserId, total * 5, num(ctx, 'maxLevel', 50));
    const rows = RARITY_KEYS.filter((k) => tally[k]).map((k) => `${RARITIES[k].emoji} ${RARITIES[k].label}: **${tally[k]}**`).join('\n');
    let desc = `${n}x berburu otomatis (-${fmt(cost)} ${cur(ctx)})${lucky ? ' 🍀' : ''}\nTotal **${total}** makhluk:\n\n${rows}`;
    if (notable.length) desc += `\n\n🌟 **Temuan langka:** ${notable.join(', ')}`;
    if (res.levelUp) desc += `\n\n🎉 **Naik ke level ${res.level}!**`;
    return ctx.reply({ embeds: [embed('🤖 Auto Hunt', desc)] });
  }, [strArg('n', `Jumlah buruan (maks ${20})`)]),

  cmd('zoo', 'Lihat koleksi makhluk', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const owned = await getCreatures(ctx.botId, u.discordUserId);
    if (!owned.length) return ctx.reply('Koleksimu kosong. Ketik `ghunt`!');
    const count = new Map<string, number>();
    for (const o of owned) count.set(o.creatureId, (count.get(o.creatureId) ?? 0) + 1);
    const sections = RARITY_KEYS.map((k) => {
      const items = CREATURES.filter((c) => c.rarity === k && count.has(c.id)).map((c) => `${c.emoji}x${count.get(c.id)}`).join(' ');
      return items ? `${RARITIES[k].emoji} **${RARITIES[k].label}**: ${items}` : '';
    }).filter(Boolean);
    return ctx.reply({ embeds: [embed(`🦄 Zoo ${ctx.user.username}`, `${sections.join('\n')}\n\n📖 Dex: **${count.size}/${CREATURES.length}** jenis`)] });
  }),

  cmd('dex', 'Lihat progres koleksi', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const have = new Set((await getCreatures(ctx.botId, u.discordUserId)).map((c) => c.creatureId));
    const rows = RARITY_KEYS.map((k) => {
      const list = CREATURES.filter((c) => c.rarity === k);
      const got = list.filter((c) => have.has(c.id)).length;
      return `${RARITIES[k].emoji} **${RARITIES[k].label}** ${got}/${list.length}\n${list.map((c) => (have.has(c.id) ? c.emoji : '❔')).join(' ')}`;
    });
    const pct = Math.round((have.size / CREATURES.length) * 100);
    return ctx.reply({ embeds: [embed(`📖 Dex ${ctx.user.username} — ${pct}%`, rows.join('\n\n'))] });
  }),

  cmd('info', 'Info makhluk', async (ctx, args) => {
    const t = findCreature(args.q);
    if (!t) return ctx.reply('Pakai: `ginfo <nama makhluk>` (contoh: `ginfo phoenix`)');
    const r = RARITIES[t.rarity];
    const stat = (lv: number) => { const s = statsFor(t, lv); return `❤️${s.hp} ⚔️${s.atk} 🛡️${s.def} 💨${s.spd}`; };
    const skill = t.id === 'phoenix' ? 'Rebirth — bangkit sekali dengan 50% HP' : `${SKILLS[t.elements[0]!].name} — ${SKILLS[t.elements[0]!].desc}`;
    const u = await getUser(ctx.botId, ctx.user.id);
    const mine = u ? (await getCreatures(ctx.botId, u.discordUserId)).filter((c) => c.creatureId === t.id) : [];
    const e = embed(`${t.emoji} ${t.name}`, `${r.emoji} **${r.label}** • id: \`${t.id}\``);
    e.fields = [
      { name: 'Elemen', value: t.elements.join(' / '), inline: true },
      { name: 'Harga jual', value: `💰 ${fmt(r.price)}`, inline: true },
      { name: 'Skill', value: skill },
      { name: 'Stat Lv1', value: stat(1) },
      { name: 'Stat Lv25', value: stat(25) },
      { name: 'Stat Lv50', value: stat(50) },
    ];
    if (mine.length) e.fields.push({ name: 'Koleksimu', value: `${mine.length}x (terbaik Lv${Math.max(...mine.map((c) => c.level))})` });
    return ctx.reply({ embeds: [e] });
  }, [strArg('q', 'Nama makhluk', true)]),

  cmd('sell', 'Jual makhluk', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const target = String(args.target ?? '').trim().toLowerCase();
    if (!target) return ctx.reply('Pakai: `gsell all`, `gsell <rarity>`, atau `gsell <nama makhluk>`');
    const key = target.replace(/\s/g, '');
    const owned = (await getCreatures(ctx.botId, u.discordUserId)).filter((c) => !c.isInTeam);
    const toSell = owned.filter((c) => {
      const info = byId[c.creatureId];
      if (!info) return false;
      if (target === 'all') return true;
      if (target in RARITIES) return info.rarity === target;
      return info.id === key || norm(info.name) === key;
    });
    if (!toSell.length) return ctx.reply('Tidak ada makhluk yang cocok untuk dijual.');
    const total = toSell.reduce((s, c) => s + RARITIES[byId[c.creatureId]!.rarity].price, 0);
    await db.transaction(async (tx) => {
      for (const c of toSell) await tx.delete(wizzyCreatures).where(eq(wizzyCreatures.id, c.id));
      await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} + ${total}` }).where(eq(wizzyUsers.id, u.id));
    });
    return ctx.reply(`💰 Menjual **${toSell.length}** makhluk seharga **${fmt(total)} ${cur(ctx)}**!`);
  }, [strArg('target', 'all | rarity | nama', true)]),

  cmd('feed', 'Berikan makan makhluk naik level', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const t = findCreature(args.q);
    if (!t) return ctx.reply('Pakai: `gfeed <nama makhluk>`.');
    const owned = (await getCreatures(ctx.botId, u.discordUserId)).filter((c) => c.creatureId === t.id).sort((a, b) => b.level - a.level);
    const best = owned[0];
    if (!best) return ctx.reply(`Kamu tidak punya **${t.name}**.`);
    const max = num(ctx, 'maxLevel', 50);
    if (best.level >= max) return ctx.reply(`${t.emoji} ${t.name} sudah level maksimal (${max}).`);
    const cost = feedCost(best.level);
    if (!(await spend(ctx.botId, u.discordUserId, cost))) return ctx.reply(`Saldo kurang. Butuh **${fmt(cost)} ${cur(ctx)}**.`);
    await db.update(wizzyCreatures).set({ level: best.level + 1 }).where(eq(wizzyCreatures.id, best.id));
    const s = statsFor(t, best.level + 1);
    return ctx.reply(`🍖 ${t.emoji} **${t.name}** naik ke **Lv${best.level + 1}** (-${fmt(cost)} ${cur(ctx)})\n❤️${s.hp} ⚔️${s.atk} 🛡️${s.def} 💨${s.spd}`);
  }, [strArg('q', 'Nama makhluk', true)]),

  cmd('fuse', 'Gabungkan 3 makhluk jadi rarity berikutnya', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const rarity = String(args.rarity ?? '').toLowerCase() as Rarity;
    const idx = RARITY_KEYS.indexOf(rarity);
    if (idx < 0 || idx >= RARITY_KEYS.length - 1)
      return ctx.reply(`Pakai: \`gfuse <rarity>\` (${RARITY_KEYS.slice(0, -1).join('/')})\n3 makhluk level terendah (di luar tim) → 50% jadi rarity berikutnya. Biaya ${fmt(num(ctx, 'fuseCost', 200))} ${cur(ctx)}.`);
    const pool = (await getCreatures(ctx.botId, u.discordUserId)).filter((c) => !c.isInTeam && byId[c.creatureId]?.rarity === rarity).sort((a, b) => a.level - b.level);
    if (pool.length < 3) return ctx.reply(`Butuh 3 makhluk **${rarity}** di luar tim (kamu punya ${pool.length}).`);
    const cost = num(ctx, 'fuseCost', 200);
    if (!(await spend(ctx.botId, u.discordUserId, cost))) return ctx.reply(`Saldo kurang. Butuh ${fmt(cost)} ${cur(ctx)}.`);
    const used = pool.slice(0, 3), success = Math.random() < 0.5;
    const result = pickOf(success ? RARITY_KEYS[idx + 1]! : rarity);
    await db.transaction(async (tx) => {
      for (const c of used) await tx.delete(wizzyCreatures).where(eq(wizzyCreatures.id, c.id));
      await tx.insert(wizzyCreatures).values({ botId: ctx.botId, discordUserId: u.discordUserId, creatureId: result.id });
    });
    return ctx.reply(success
      ? `🔮 **Fusion berhasil!** 3 makhluk ${rarity} menjadi ${result.emoji} **${result.name}** (${RARITIES[result.rarity].label})!`
      : `💨 Fusion gagal... kamu hanya mendapat ${result.emoji} **${result.name}** (${RARITIES[result.rarity].label}).`);
  }, [strArg('rarity', 'common | uncommon | rare | epic | legendary')]),

  cmd('team', 'Atur tim battle', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const sub = String(args.sub ?? '').toLowerCase();
    if (!sub || sub === 'list') {
      const team = await getTeam(ctx.botId, u.discordUserId);
      const lines = team.map((c, i) => {
        const t = byId[c.creatureId], s = statsFor(t, c.level);
        return `**${i + 1}.** ${t.emoji} **${t.name}** Lv${c.level} (${t.elements.join('/')})\n   ❤️${s.hp} ⚔️${s.atk} 🛡️${s.def} 💨${s.spd}`;
      });
      return ctx.reply({ embeds: [embed(`🛡️ Tim ${ctx.user.username} (${team.length}/${u.teamSlots})`, lines.join('\n') || 'Tim kosong. Pakai `gteam add <nama>`')] });
    }
    if (sub === 'clear') {
      await db.update(wizzyCreatures).set({ isInTeam: false }).where(and(eq(wizzyCreatures.botId, ctx.botId), eq(wizzyCreatures.discordUserId, u.discordUserId)));
      return ctx.reply('🧹 Tim dikosongkan.');
    }
    if (sub !== 'add' && sub !== 'remove') return ctx.reply('Pakai: `gteam`, `gteam add <nama>`, `gteam remove <nama>`, `gteam clear`');
    const t = findCreature(args.q);
    if (!t) return ctx.reply('Makhluk tidak ditemukan. Cek id-nya dengan `ginfo`.');
    const team = await getTeam(ctx.botId, u.discordUserId);
    const owned = (await getCreatures(ctx.botId, u.discordUserId)).filter((c) => c.creatureId === t.id);
    if (sub === 'add') {
      if (team.length >= u.teamSlots) return ctx.reply(`Tim penuh (${u.teamSlots} slot). Beli slot di \`gshop\`.`);
      const pick = owned.filter((c) => !c.isInTeam).sort((a, b) => b.level - a.level)[0];
      if (!pick) return ctx.reply(`Kamu tidak punya **${t.name}** yang bebas.`);
      await db.update(wizzyCreatures).set({ isInTeam: true }).where(eq(wizzyCreatures.id, pick.id));
      return ctx.reply(`✅ ${t.emoji} **${t.name}** Lv${pick.level} masuk tim.`);
    }
    const pick = owned.find((c) => c.isInTeam);
    if (!pick) return ctx.reply(`**${t.name}** tidak ada di timmu.`);
    await db.update(wizzyCreatures).set({ isInTeam: false }).where(eq(wizzyCreatures.id, pick.id));
    return ctx.reply(`➖ ${t.emoji} **${t.name}** keluar dari tim.`);
  }, [strArg('sub', 'add | remove | clear'), strArg('q', 'Nama makhluk', true)]),

  cmd('shop', 'Lihat toko sihir', async (ctx) => {
    const lines = ITEMS.map((i) => `${i.emoji} **${i.name}** — 💰 ${fmt(i.price)}\n   ${i.desc} • id: \`${i.id.split('_').pop()}\``);
    return ctx.reply({ embeds: [embed('🛒 Toko Sihir', `${lines.join('\n\n')}\n\nBeli dengan \`gbuy <id> [jumlah]\` (contoh: \`gbuy lucky 2\`)`)] });
  }),

  cmd('buy', 'Beli item', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const tokens = String(args.q ?? '').trim().split(/\s+/).filter(Boolean);
    const last = tokens[tokens.length - 1] ?? '';
    const hasQty = tokens.length > 1 && /^\d+$/.test(last);
    const qty = hasQty ? Math.min(Number.parseInt(last, 10), 99) : 1;
    const item = findItem(hasQty ? tokens.slice(0, -1).join(' ') : tokens.join(' '));
    if (!item) return ctx.reply('Item tidak ditemukan. Lihat `gshop`.');
    if (item.type === 'wand') {
      if (await getQty(ctx.botId, u.discordUserId, item.id) > 0) return ctx.reply('Kamu sudah punya wand itu.');
      if (!(await spend(ctx.botId, u.discordUserId, item.price))) return ctx.reply(`Saldo kurang. Butuh **${fmt(item.price)} ${cur(ctx)}**.`);
      await addItem(ctx.botId, u.discordUserId, item.id, 1);
      return ctx.reply(`${item.emoji} Membeli **${item.name}**! Pasang dengan \`gequip ${item.id.split('_').pop()}\`.`);
    }
    if (item.type === 'upgrade') {
      if (u.teamSlots >= num(ctx, 'maxSlots', 5)) return ctx.reply(`Slot tim sudah maksimal (${num(ctx, 'maxSlots', 5)}).`);
      if (!(await spend(ctx.botId, u.discordUserId, item.price))) return ctx.reply(`Saldo kurang. Butuh **${fmt(item.price)} ${cur(ctx)}**.`);
      await db.update(wizzyUsers).set({ teamSlots: u.teamSlots + 1 }).where(eq(wizzyUsers.id, u.id));
      return ctx.reply(`➕ Slot tim sekarang **${u.teamSlots + 1}**!`);
    }
    const total = item.price * qty;
    if (!(await spend(ctx.botId, u.discordUserId, total))) return ctx.reply(`Saldo kurang. Butuh **${fmt(total)} ${cur(ctx)}**.`);
    await addItem(ctx.botId, u.discordUserId, item.id, qty);
    return ctx.reply(`${item.emoji} Membeli **${qty}x ${item.name}** (-${fmt(total)} ${cur(ctx)}).`);
  }, [strArg('q', 'id item [jumlah]', true)]),

  cmd('inv', 'Lihat inventori', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const rows = await db.select().from(wizzyInventory).where(and(eq(wizzyInventory.botId, ctx.botId), eq(wizzyInventory.discordUserId, u.discordUserId)));
    const list = rows.filter((r) => r.quantity > 0).map((r) => {
      const i = itemById[r.itemId];
      return i ? `${i.emoji} **${i.name}** x${r.quantity}` : null;
    }).filter(Boolean);
    const wand = u.wand ? itemById[u.wand] : null;
    const buffRows = await db.select().from(wizzyBuffs).where(and(eq(wizzyBuffs.botId, ctx.botId), eq(wizzyBuffs.discordUserId, u.discordUserId), gt(wizzyBuffs.expiresAt, new Date())));
    const buffs = buffRows.map((b) => `• ${b.buff === 'lucky' ? '🍀 Lucky' : b.buff === 'hpboost' ? '🧪 HP Boost' : b.buff} (${Math.ceil((b.expiresAt.getTime() - Date.now()) / 60_000)} mnt)`);
    return ctx.reply({ embeds: [embed('🎒 Inventori', `**Wand terpasang:** ${wand ? `${wand.emoji} ${wand.name}` : '—'}\n\n${list.join('\n') || 'Kosong. Belanja di `gshop`!'}\n\n**Buff aktif:**\n${buffs.join('\n') || '—'}`)] });
  }),

  cmd('use', 'Pakai item', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const item = findItem(args.q);
    if (!item) return ctx.reply('Pakai: `guse <item>` (hp / lucky)');
    if (item.type === 'wand') return ctx.reply(`Wand dipasang dengan \`gequip ${item.id.split('_').pop()}\`.`);
    if (item.type !== 'potion') return ctx.reply('Item ini tidak bisa dipakai.');
    if (!(await removeItem(ctx.botId, u.discordUserId, item.id, 1))) return ctx.reply(`Kamu tidak punya ${item.name}.`);
    if (item.id === 'potion_lucky') {
      await setBuff(ctx.botId, u.discordUserId, 'lucky', 30 * 60_000);
      return ctx.reply('🍀 Lucky aktif **30 menit**! Peluang rarity tinggi berlipat saat berburu.');
    }
    await setBuff(ctx.botId, u.discordUserId, 'hpboost', DAY);
    return ctx.reply('🧪 HP tim +25% di **battle berikutnya** (berlaku maks 24 jam).');
  }, [strArg('q', 'Nama item', true)]),

  cmd('equip', 'Pasang tongkat sihir', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const item = findItem(args.q);
    if (!item || item.type !== 'wand') return ctx.reply('Pakai: `gequip <wand>` (wood / elder / element)');
    if (await getQty(ctx.botId, u.discordUserId, item.id) < 1) return ctx.reply('Kamu belum punya wand itu. Beli di `gshop`.');
    await db.update(wizzyUsers).set({ wand: item.id }).where(eq(wizzyUsers.id, u.id));
    return ctx.reply(`${item.emoji} **${item.name}** terpasang! ${item.desc}`);
  }, [strArg('q', 'Nama wand', true)]),

  cmd('cf', 'Coin flip', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const bet = parseAmount(args.amount, Math.min(num(ctx, 'maxBet', 10_000), u.galleons));
    if (!bet) return ctx.reply('Masukkan jumlah taruhan (atau `all`).');
    const pick = String(args.side ?? 'h').toLowerCase().startsWith('t') ? 'tail' : 'head';
    const result = Math.random() < 0.5 ? 'head' : 'tail';
    await db.transaction(async (tx) => {
      await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} - ${bet}` }).where(eq(wizzyUsers.id, u.id));
      if (pick === result) await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} + ${bet * 2}` }).where(eq(wizzyUsers.id, u.id));
    });
    return ctx.reply(`🪙 Koin berputar... **${result.toUpperCase()}**!\n${pick === result ? `🎉 Menang **+${fmt(bet)} ${cur(ctx)}**!` : `💀 Kalah **-${fmt(bet)} ${cur(ctx)}**.`}`);
  }, [strArg('amount', 'Jumlah taruhan'), strArg('side', 'head / tail')]),

  cmd('slots', 'Mesin slot', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const bet = parseAmount(args.amount, Math.min(num(ctx, 'maxBet', 10_000), u.galleons));
    if (!bet) return ctx.reply('Masukkan jumlah taruhan (atau `all`).');
    const syms = ['🍀', '🔮', '🪄', '🐉', '✨'];
    const r = Array.from({ length: 3 }, () => rnd(syms));
    let mult = 0;
    if (r[0] === r[1] && r[1] === r[2]) mult = r[0] === '✨' ? 10 : 6;
    else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) mult = 1.5;
    const payout = Math.floor(bet * mult);
    await db.transaction(async (tx) => {
      await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} - ${bet}` }).where(eq(wizzyUsers.id, u.id));
      if (payout > 0) await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} + ${payout}` }).where(eq(wizzyUsers.id, u.id));
    });
    const net = payout - bet;
    return ctx.reply(`🎰 **[ ${r.join(' | ')} ]**\n${mult >= 6 ? '🎉 JACKPOT! ' : ''}${net > 0 ? `Menang **+${fmt(net)}**` : net === 0 ? 'Impas' : `Kalah **${fmt(net)}**`} ${cur(ctx)} (x${mult})`);
  }, [strArg('amount', 'Jumlah taruhan')]),

  cmd('pray', 'Doa: lucky 15 menit', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    await setBuff(ctx.botId, u.discordUserId, 'lucky', 15 * 60_000);
    return ctx.reply('🙏 Doamu didengar bintang-bintang... **Lucky aktif 15 menit!** 🍀');
  }),

  cmd('coven', 'Sistem coven / guild', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const sub = String(args.sub ?? 'info').toLowerCase(), rest = String(args.q ?? '').trim();
    const mine = await myCoven(ctx.botId, u.discordUserId);
    const cost = num(ctx, 'covenCost', 5_000), max = num(ctx, 'covenMax', 20);
    if (sub === 'create') {
      if (mine) return ctx.reply('Kamu sudah di dalam coven.');
      if (!/^[A-Za-z0-9 ]{3,20}$/.test(rest)) return ctx.reply('Nama coven 3-20 karakter (huruf, angka, spasi).');
      if ((await db.select().from(wizzyCovens).where(and(eq(wizzyCovens.botId, ctx.botId), eq(wizzyCovens.name, rest)))).length) return ctx.reply('Nama coven sudah dipakai.');
      if (!(await spend(ctx.botId, u.discordUserId, cost))) return ctx.reply(`Butuh **${fmt(cost)} ${cur(ctx)}** untuk membuat coven.`);
      const [c] = await db.insert(wizzyCovens).values({ botId: ctx.botId, name: rest, ownerId: u.discordUserId }).returning();
      await db.insert(wizzyCovenMembers).values({ botId: ctx.botId, covenId: c.id, discordUserId: u.discordUserId, role: 'owner' });
      return ctx.reply(`🏰 Coven **${rest}** berdiri! (-${fmt(cost)} ${cur(ctx)})`);
    }
    if (sub === 'join') {
      if (mine) return ctx.reply('Kamu sudah di dalam coven. `gcoven leave` dulu.');
      const [c] = await db.select().from(wizzyCovens).where(and(eq(wizzyCovens.botId, ctx.botId), eq(wizzyCovens.name, rest)));
      if (!c) return ctx.reply('Coven tidak ditemukan.');
      const members = await db.select().from(wizzyCovenMembers).where(eq(wizzyCovenMembers.covenId, c.id));
      if (members.length >= max) return ctx.reply('Coven itu penuh.');
      await db.insert(wizzyCovenMembers).values({ botId: ctx.botId, covenId: c.id, discordUserId: u.discordUserId });
      return ctx.reply(`✨ Kamu bergabung ke coven **${c.name}**!`);
    }
    if (sub === 'leave') {
      if (!mine) return ctx.reply('Kamu tidak punya coven.');
      await db.delete(wizzyCovenMembers).where(and(eq(wizzyCovenMembers.botId, ctx.botId), eq(wizzyCovenMembers.discordUserId, u.discordUserId)));
      if (mine.role === 'owner') {
        const next = (await db.select().from(wizzyCovenMembers).where(eq(wizzyCovenMembers.covenId, mine.c.id)).orderBy(wizzyCovenMembers.joinedAt))[0];
        if (next) {
          await db.update(wizzyCovenMembers).set({ role: 'owner' })
            .where(and(eq(wizzyCovenMembers.botId, ctx.botId), eq(wizzyCovenMembers.discordUserId, next.discordUserId)));
          await db.update(wizzyCovens).set({ ownerId: next.discordUserId }).where(eq(wizzyCovens.id, mine.c.id));
        } else await db.delete(wizzyCovens).where(eq(wizzyCovens.id, mine.c.id));
      }
      return ctx.reply(`👋 Kamu keluar dari coven **${mine.c.name}**.`);
    }
    if (sub === 'deposit') {
      if (!mine) return ctx.reply('Kamu tidak punya coven.');
      const amt = parseAmount(args.q, u.galleons);
      if (!amt) return ctx.reply('Pakai: `gcoven deposit <jumlah>`');
      if (!(await spend(ctx.botId, u.discordUserId, amt))) return ctx.reply('Saldo tidak cukup.');
      await db.update(wizzyCovens).set({ bank: sql`${wizzyCovens.bank} + ${amt}` }).where(eq(wizzyCovens.id, mine.c.id));
      return ctx.reply(`🏦 Menyetor **${fmt(amt)} ${cur(ctx)}** ke kas coven.`);
    }
    if (!mine) return ctx.reply(`Kamu belum punya coven. \`gcoven create <nama>\` (${fmt(cost)} ${cur(ctx)}) atau \`gcoven join <nama>\``);
    const members = await db.select().from(wizzyCovenMembers).where(eq(wizzyCovenMembers.covenId, mine.c.id)).orderBy(wizzyCovenMembers.joinedAt);
    const list = members.slice(0, 15).map((m) => `${m.role === 'owner' ? '👑' : '•'} <@${m.discordUserId}>`).join('\n');
    return ctx.reply({ embeds: [embed(`🏰 Coven ${mine.c.name}`, `🏦 Kas: **${fmt(mine.c.bank)} ${cur(ctx)}**\n👥 Anggota: **${members.length}/${max}**\n\n${list}`)] });
  }, [strArg('sub', 'create | join | leave | deposit | info'), strArg('q', 'Nama / jumlah', true)]),

  cmd('lb', 'Papan peringkat', async (ctx, args) => {
    const k = String(args.kind ?? 'coins').toLowerCase();
    return sendBoard(ctx, ['zoo', 'battle', 'coven'].includes(k) ? k : 'coins');
  }, [strArg('kind', 'coins | zoo | battle | coven')]),

  cmd('rank', 'Peringkat battle', async (ctx) => sendBoard(ctx, 'battle')),

  // ---- memancing ----
  cmd('mancing', 'Mulai memancing ikan', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const uid = u.discordUserId;
    const f = await getFishing(ctx.botId, uid);
    const rawLoc = String(args.lokasi ?? '').trim().toLowerCase();
    const locKey = (rawLoc in FLOCATIONS ? rawLoc : 'kolam') as keyof typeof FLOCATIONS;
    const rawBait = String(args.umpan ?? '').trim().toLowerCase();
    const baitKey = (rawBait in BAITS ? rawBait : null) as BaitKey | null;
    const loc = FLOCATIONS[locKey];
    if (fishingInProgress.has(uid)) return ctx.reply('⏳ Kamu masih memancing!');
    const left = (fishCooldowns.get(uid) ?? 0) - Date.now();
    if (left > 0) return ctx.reply(`⏳ Tunggu **${Math.ceil(left / 1000)} detik** lagi.`);
    if (u.level < loc.level) return ctx.reply(`🔒 ${loc.name} butuh **level ${loc.level}**. Levelmu ${u.level}.`);
    if (f.rodDur <= 0) return ctx.reply('🪝 Jorannmu rusak! `gperbaiki` atau beli di `gtoko`.');
    if (baitKey && !(f.bait[baitKey]! > 0)) return ctx.reply(`🚫 Kamu tidak punya **${BAITS[baitKey].name}**. Beli di \`gtoko\`.`);
    fishingInProgress.add(uid);
    try {
      if (baitKey) {
        f.bait[baitKey] = (f.bait[baitKey] ?? 0) - 1;
        if (f.bait[baitKey]! <= 0) delete f.bait[baitKey];
      }
      f.rodDur--;
      await saveFishing(ctx.botId, uid, f);
      const rod = RODS[f.rod];
      const msg = await ctx.reply({ embeds: [embed(`${loc.emoji} Memancing di ${loc.name}`,
        `${rod.emoji} Kamu melempar kail${baitKey ? ` dengan ${BAITS[baitKey].emoji} **${BAITS[baitKey].name}**` : ''}...\n\n*Tunggu sampai ada gigitan…*`, 0x3498db)] }) as unknown as Message;
      await new Promise((r) => setTimeout(r, rand(2000, 6000)));
      const kid = newKid();
      const p: Extract<Pending, { kind: 'f' }> = { kind: 'f', botId: ctx.botId, fisher: uid, rod: f.rod, bait: baitKey, loc: locKey, msg };
      pending.set(kid, p);
      await msg.edit({
        embeds: [embed('❗ ADA GIGITAN!', `Tekan **TARIK!** dalam ${PULL_WINDOW_MS / 1000} detik!`, 0xe67e22)],
        components: [buttonRow('f', kid)],
      });
      p.timer = armTimeout(kid, msg, 'f', p, PULL_WINDOW_MS,
        embed('💨 Ikan kabur!', 'Kamu terlalu lambat menarik kail.', 0xe74c3c));
    } catch {
      fishingInProgress.delete(uid);
      for (const [k, p] of pending) if (p.kind === 'f' && p.fisher === uid) pending.delete(k);
    }
  }, [strArg('lokasi', 'kolam | sungai | danau | laut | dalam'), strArg('umpan', 'cacing | udang | emas')]),

  cmd('tas', 'Lihat tas ikan, umpan, dan joranmu', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const f = await getFishing(ctx.botId, u.discordUserId);
    const rod = RODS[f.rod];
    const fishLines = Object.entries(f.inv).map(([id, d]) =>
      `${ALL_FISH[id]?.emoji ?? '❓'} **${ALL_FISH[id]?.name ?? id}** ×${d.count} — ${kg(d.kg)} (\`${id}\`)`);
    const baitLines = Object.entries(f.bait).map(([id, n]) =>
      `${BAITS[id as BaitKey]?.emoji ?? ''} ${BAITS[id as BaitKey]?.name ?? id} ×${n}`);
    const total = Object.entries(f.inv).reduce((s, [id, d]) => s + Math.ceil(d.kg * (ALL_FISH[id]?.price ?? 0)), 0);
    const e = embed(`🎒 Tas ${ctx.user.username}`, '', 0x1abc9c);
    e.fields = [
      { name: 'Joran', value: `${rod.emoji} ${rod.name} (${f.rodDur}/${rod.dur})`, inline: true },
      { name: 'Koin', value: `${fmt(u.galleons)} ${cur(ctx)}`, inline: true },
      { name: 'Tangkapan', value: fishLines.join('\n').slice(0, 1020) || '*Kosong*' },
      { name: 'Umpan', value: baitLines.join('\n') || '*Tidak ada*' },
    ];
    e.footer = { text: `Perkiraan nilai semua tangkapan: ${fmt(total)} koin` };
    await ctx.reply({ embeds: [e] });
  }),

  cmd('jual', 'Jual hasil tangkapan', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const f = await getFishing(ctx.botId, u.discordUserId);
    const target = String(args.ikan ?? '').trim().toLowerCase();
    let ids: string[];
    if (!target) ids = Object.keys(f.inv);
    else {
      const hit = findFish(target);
      const id = hit?.[0] ?? (target in ALL_FISH ? target : null);
      if (!id || !f.inv[id]) return ctx.reply('❌ Kamu tidak punya item itu.');
      ids = [id];
    }
    if (!ids.length) return ctx.reply('🎒 Tasmu kosong.');
    let total = 0, count = 0;
    for (const id of ids) {
      const d = f.inv[id]!;
      total += Math.ceil(d.kg * (ALL_FISH[id]?.price ?? 0));
      count += d.count;
      delete f.inv[id];
    }
    await saveFishing(ctx.botId, u.discordUserId, f);
    await addGalleons(ctx.botId, u.discordUserId, total);
    await ctx.reply({ embeds: [embed('💰 Penjualan Berhasil',
      `Menjual **${count}** item seharga **${fmt(total)} ${cur(ctx)}**\nSaldo: **${fmt(u.galleons + total)} ${cur(ctx)}**`, 0xf1c40f)] });
  }, [strArg('ikan', 'ID/nama ikan (kosong = jual semua)')]),

  cmd('toko', 'Lihat toko joran & umpan', async (ctx) => {
    const rods = Object.entries(RODS).filter(([k]) => k !== 'bambu')
      .map(([k, r]) => `${r.emoji} **${r.name}** — ${fmt(r.price)} ${cur(ctx)}\n┗ Lv ${r.level} • Durabilitas ${r.dur} • Luck +${Math.round(r.luck * 100)}% (\`${k}\`)`).join('\n');
    const baits = Object.entries(BAITS)
      .map(([k, b]) => `${b.emoji} **${b.name}** — ${fmt(b.price)} ${cur(ctx)}\n┗ Luck +${Math.round(b.luck * 100)}% (\`${k}\`)`).join('\n');
    const e = embed('🏪 Toko Pancing', '', 0xe67e22);
    e.fields = [{ name: 'Joran', value: rods }, { name: 'Umpan', value: baits }];
    e.footer = { text: 'Beli: `gbeli rod:karbon` / `gbeli bait:udang 5` • Perbaiki: `gperbaiki`' };
    await ctx.reply({ embeds: [e] });
  }),

  cmd('beli', 'Beli joran atau umpan', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const [type, key] = String(args.item ?? '').split(':');
    const qty = Math.max(1, Number.parseInt(String(args.jumlah ?? ''), 10) || 1);
    const f = await getFishing(ctx.botId, u.discordUserId);
    if (type === 'rod') {
      const rod = RODS[key as RodKey];
      if (!rod || key === 'bambu') return ctx.reply('Joran tidak ditemukan. Cek `gtoko`.');
      if (u.level < rod.level) return ctx.reply(`🔒 Butuh level ${rod.level}.`);
      if (f.rod === key) return ctx.reply('Kamu sudah memakai joran ini.');
      if (u.galleons < rod.price) return ctx.reply(`💸 Koin kurang. Butuh ${fmt(rod.price)} ${cur(ctx)}.`);
      if (!(await spend(ctx.botId, u.discordUserId, rod.price))) return ctx.reply('💸 Koin kurang.');
      f.rod = key as RodKey;
      f.rodDur = rod.dur;
      await saveFishing(ctx.botId, u.discordUserId, f);
      return ctx.reply(`✅ Membeli ${rod.emoji} **${rod.name}** dan langsung memakainya! Sisa: ${fmt(u.galleons - rod.price)} ${cur(ctx)}`);
    }
    const bait = BAITS[key as BaitKey];
    if (!bait) return ctx.reply('Item tidak ditemukan. Contoh: `gbeli rod:karbon` / `gbeli bait:udang 5`.');
    const cost = bait.price * qty;
    if (!(await spend(ctx.botId, u.discordUserId, cost))) return ctx.reply(`💸 Koin kurang. Butuh ${fmt(cost)} ${cur(ctx)}.`);
    f.bait[key as BaitKey] = (f.bait[key as BaitKey] ?? 0) + qty;
    await saveFishing(ctx.botId, u.discordUserId, f);
    return ctx.reply(`✅ Membeli ${bait.emoji} **${bait.name}** ×${qty} seharga ${fmt(cost)} ${cur(ctx)}. Sisa: ${fmt(u.galleons - cost)} ${cur(ctx)}`);
  }, [strArg('item', 'rod:karbon | bait:udang'), { name: 'jumlah', description: 'Jumlah umpan', type: 'int' }]),

  cmd('perbaiki', 'Perbaiki joranmu', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const f = await getFishing(ctx.botId, u.discordUserId);
    const rod = RODS[f.rod];
    const missing = rod.dur - f.rodDur;
    if (missing <= 0) return ctx.reply('🔧 Jorannmu masih prima.');
    const cost = missing * REPAIR_COST_PER_POINT;
    if (!(await spend(ctx.botId, u.discordUserId, cost))) return ctx.reply(`💸 Biaya perbaikan ${fmt(cost)} ${cur(ctx)}, koinmu kurang.`);
    f.rodDur = rod.dur;
    await saveFishing(ctx.botId, u.discordUserId, f);
    return ctx.reply(`🔧 ${rod.emoji} **${rod.name}** diperbaiki penuh seharga ${fmt(cost)} ${cur(ctx)}. Sisa: ${fmt(u.galleons - cost)} ${cur(ctx)}`);
  }),

  cmd('ensiklopedia', 'Daftar ikan di tiap lokasi', async (ctx, args) => {
    const key = String(args.lokasi ?? '').trim().toLowerCase();
    const loc = FLOCATIONS[key as keyof typeof FLOCATIONS];
    if (!loc) return ctx.reply('Lokasi: `kolam`, `sungai`, `danau`, `laut`, `dalam`.');
    const lines = Object.entries(FISH).filter(([, d]) => d.loc.includes(key))
      .sort((a, b) => Object.keys(FRARITY).indexOf(a[1].rarity) - Object.keys(FRARITY).indexOf(b[1].rarity))
      .map(([, d]) => `${d.emoji} **${d.name}** — ${FRARITY[d.rarity].label} • ${kg(d.min)}–${kg(d.max)} • ${d.price} ${cur(ctx)}/kg`);
    await ctx.reply({ embeds: [embed(`📖 ${loc.emoji} ${loc.name} (Lv ${loc.level})`, lines.join('\n'), 0x9b59b6)] });
  }, [strArg('lokasi', 'kolam | sungai | danau | laut | dalam')]),

  cmd('profilikan', 'Profil pemancing', async (ctx, args) => {
    const id = mentionId(args.user) ?? ctx.user.id;
    const u = await getUser(ctx.botId, id);
    if (!u) return ctx.reply('Pemain itu belum mulai.');
    const f = await getFishing(ctx.botId, id);
    const rod = RODS[f.rod];
    const unlocked = Object.entries(FLOCATIONS).filter(([, l]) => u.level >= l.level).map(([, l]) => `${l.emoji} ${l.name}`).join(', ');
    const need = u.level * 100;
    const filled = Math.max(0, Math.min(10, Math.round((u.xp / need) * 10)));
    const e = embed(`🎣 Profil <@${id}>`, '', 0x3498db);
    e.fields = [
      { name: 'Level', value: `**${u.level}**\n${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} ${u.xp}/${need} XP` },
      { name: 'Koin', value: `${fmt(u.galleons)} ${cur(ctx)}`, inline: true },
      { name: 'Joran', value: `${rod.emoji} ${rod.name}\n${f.rodDur}/${rod.dur}`, inline: true },
      { name: 'Tangkapan', value: fmt(f.stats.caught), inline: true },
      { name: 'Kabur', value: fmt(f.stats.escaped), inline: true },
      { name: 'Rekor Terberat', value: f.stats.biggest ? `${f.stats.biggestName} — ${kg(f.stats.biggest)}` : '-' },
      { name: 'Lokasi Terbuka', value: unlocked },
    ];
    await ctx.reply({ embeds: [e] });
  }, [userArg('user', 'Pemancing lain')]),

  cmd('topikan', 'Papan peringkat pemancing', async (ctx, args) => {
    const cat = String(args.kategori ?? 'coins').trim().toLowerCase();
    const kind = ['coins', 'level', 'caught', 'biggest'].includes(cat) ? cat : 'coins';
    const [fishRows, userRows] = await Promise.all([
      db.select().from(wizzyFishing).where(eq(wizzyFishing.botId, ctx.botId)),
      db.select().from(wizzyUsers).where(eq(wizzyUsers.botId, ctx.botId)),
    ]);
    const usersById = new Map(userRows.map((r) => [r.discordUserId, r]));
    const value = (id: string, d: FishingData) => kind === 'coins' ? (usersById.get(id)?.galleons ?? 0)
      : kind === 'level' ? (usersById.get(id)?.level ?? 0)
        : kind === 'caught' ? d.stats.caught : d.stats.biggest;
    const top = fishRows.map((r) => {
      const base = newFishingData(), d = (r.data ?? {}) as Partial<FishingData>;
      return { id: r.discordUserId, d: { ...base, ...d, stats: { ...base.stats, ...d.stats } } as FishingData };
    }).sort((a, b) => value(b.id, b.d) - value(a.id, a.d)).slice(0, 10);
    const titles: Record<string, string> = { coins: '💰 Terkaya', level: '⭐ Level Tertinggi', caught: '🐟 Paling Banyak Menangkap', biggest: '🏆 Ikan Terbesar' };
    const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `**${i + 1}.**`;
    const lines = top.map((r, i) => {
      const v = value(r.id, r.d);
      return `${medal(i)} <@${r.id}> — ${kind === 'biggest' ? kg(v) : fmt(v)}`;
    });
    await ctx.reply({ embeds: [embed(`🏅 Top Pemancing — ${titles[kind]}`, lines.join('\n') || 'Belum ada data.', 0xf1c40f)] });
  }, [strArg('kategori', 'coins | level | caught | biggest')]),

  cmd('help', 'Daftar command Wizzy', async (ctx) => ctx.reply({ embeds: [embed('📖 Bantuan Wizzy', [
    '**🪄 Dasar**', '`start` `profile [@u]` `daily` `cash` `give @u <jml>` (pajak 5%)', '',
    '**🐉 Berburu & Koleksi**', '`hunt` (`h`) • `autohunt <1-20>` (100/buruan)', '`zoo` • `dex` • `info <nama>`',
    '`sell <all|rarity|nama>` • `feed <nama>` • `fuse <rarity>`', '`trade @u <makhlukku> <makhluk dia>`', '',
    '**⚔️ Battle**', '`team` • `team add/remove <nama>` • `team clear`', '`battle @u [taruhan]` (`b`) • `dungeon` • `rank`', '',
    '**🎒 Item**', '`shop` • `buy <id> [jml]` • `inv` • `use <item>` • `equip <wand>`', '',
    '**🎰 Mini game**', '`cf <jml> [h/t]` • `slots <jml>` • `pray`', '',
    '**🏰 Sosial**', '`coven create/join/leave/deposit/info` • `lb [coins/zoo/battle/coven]`', '',
    '**🎣 Memancing**', '`mancing [lokasi] [umpan]` • `tas` • `jual [ikan]` • `toko`',
    '`beli <rod:id|bait:id> [jml]` • `perbaiki` • `ensiklopedia <lokasi>`',
    '`profilikan [@u]` • `topikan [coins/level/caught/biggest]`', '',
    `Awali command dengan prefix bot (\`g\`). Contoh: \`ghunt\``,
  ].join('\n'))] })),
];
commands.find((c) => c.name === 'mancing')!.publicReply = true;

// ---- command khusus prefix (butuh tombol) ----
const prefixCommands: ModuleCommand[] = [
  cmd('battle', 'Tantang battle pemain lain', async (ctx, args) => {
    if (!(await needUser(ctx))) return;
    const target = mentionId(args.user);
    if (!target || target === ctx.user.id) return ctx.reply('Pakai: `gbattle @user [taruhan]`');
    const rival = await getUser(ctx.botId, target);
    if (!rival) return ctx.reply('Lawanmu belum mulai.');
    const me = await getUser(ctx.botId, ctx.user.id);
    const cap = (u: UserRow) => Math.min(num(ctx, 'maxBet', 10_000), Math.floor(u.galleons * 0.5));
    const bet = Math.max(0, Number.parseInt(String(args.bet ?? ''), 10) || 0);
    if (bet > cap(me) || bet > cap(rival)) return ctx.reply(`Taruhan maksimal **${fmt(Math.min(cap(me), cap(rival)))} ${cur(ctx)}** (50% saldo).`);
    if (!(await getTeam(ctx.botId, me.discordUserId)).length || !(await getTeam(ctx.botId, rival.discordUserId)).length)
      return ctx.reply('Tim kosong. `gteam add <nama>` dulu.');
    if (busy.has(me.discordUserId) || busy.has(rival.discordUserId)) return ctx.reply('Salah satu pemain sedang battle.');
    busy.add(me.discordUserId); busy.add(rival.discordUserId);
    const kid = newKid();
    const e = embed('⚔️ Tantangan Battle!', `**${ctx.user.username}** menantang <@${target}>!\n💰 Taruhan: **${fmt(bet)} ${cur(ctx)}**\n\nWaktu 60 detik untuk merespon.`);
    const msg = await sendWithButtons(ctx, 'b', kid, [e], `<@${target}>`);
    const p: Extract<Pending, { kind: 'b' }> = {
      kind: 'b', challenger: me.discordUserId, challengerName: ctx.user.username, target, bet, msg,
    };
    pending.set(kid, p);
    arm(kid, msg, p);
  }, [userArg(), strArg('bet', 'Taruhan (opsional)')]),

  cmd('dungeon', 'Petualangan dungeon PvE', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const A = await prepare(ctx.botId, u.discordUserId, 'A', true);
    if (!A.length) return ctx.reply('Timmu kosong. `gteam add <nama>`');
    const floor = u.dungeonFloor, boss = floor % 5 === 0;
    const tier = Math.min(Math.floor(floor / 4), 4);
    const pickTier = (t: number) => pickOf(RARITY_KEYS[Math.max(0, Math.min(5, t))]!);
    const enemies = boss
      ? [makeFighter(pickTier(tier + 1), floor * 2 + 5, 'B')]
      : Array.from({ length: 3 }, () => makeFighter(pickTier(tier - Math.floor(Math.random() * 2)), 1 + Math.floor(floor * 1.5), 'B'));
    const res = simulate(A, enemies);
    const win = res.winner === 'A';
    let reward = Math.min(500, 100 + floor * 25);
    if (boss) reward = Math.min(500, Math.round(reward * 1.5));
    await db.transaction(async (tx) => {
      if (win) {
        await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} + ${reward}`, dungeonFloor: floor + 1 }).where(eq(wizzyUsers.id, u.id));
      }
    });
    await addXp(ctx.botId, u.discordUserId, win ? 20 + floor * 2 : 5, num(ctx, 'maxLevel', 50));
    const foot = win
      ? `🏆 Lantai ${floor} ${boss ? '(BOSS) ' : ''}selesai! +${fmt(reward)} ${cur(ctx)}, +${20 + floor * 2} XP\nLanjut ke lantai ${floor + 1}.`
      : res.winner === 'draw' ? '🤝 Seri, lantai belum selesai.' : '💀 Kamu kalah. Perkuat tim (`gfeed`, wand) lalu coba lagi.';
    const e = embed(`🏰 Dungeon Lantai ${floor}${boss ? ' 👑' : ''}`, renderLog(res.log));
    e.fields = [{ name: '🔵 Timmu', value: summary(A), inline: true }, { name: '🔴 Musuh', value: summary(enemies), inline: true }, { name: 'Hasil', value: foot }];
    return ctx.reply({ embeds: [e] });
  }),

  cmd('trade', 'Tukar makhluk dengan pemain lain', async (ctx, args) => {
    if (!(await needUser(ctx))) return;
    const target = mentionId(args.user);
    const mine = findCreature(args.mine), theirs = findCreature(args.theirs);
    if (!target || target === ctx.user.id || !mine || !theirs)
      return ctx.reply('Pakai: `gtrade @user <makhlukku> <makhluk dia>`\nGunakan id tanpa spasi (contoh: `gtrade @budi firecrab unicorn`). Biaya admin 50 Galleon per pihak.');
    if (!await getUser(ctx.botId, target)) return ctx.reply('Pemain itu belum mulai.');
    const free = async (id: string, t: Creature) => (await getCreatures(ctx.botId, id)).filter((c) => !c.isInTeam && c.creatureId === t.id)[0];
    if (!(await free(ctx.user.id, mine))) return ctx.reply(`Kamu tidak punya ${mine.name} yang bebas (di luar tim).`);
    if (!(await free(target, theirs))) return ctx.reply(`<@${target}> tidak punya ${theirs.name} yang bebas.`);
    const kid = newKid();
    const e = embed('🔁 Tawaran Tukar', `**${ctx.user.username}** memberi ${mine.emoji} **${mine.name}**\nuntuk ${theirs.emoji} **${theirs.name}** milik <@${target}>.\n\nBiaya admin: 50 ${cur(ctx)} per pihak.`);
    const msg = await sendWithButtons(ctx, 't', kid, [e], `<@${target}>`);
    const p: Extract<Pending, { kind: 't' }> = {
      kind: 't', challenger: ctx.user.id, challengerName: ctx.user.username, target,
      mine: mine.id, theirs: theirs.id, msg,
    };
    pending.set(kid, p);
    arm(kid, msg, p);
  }, [userArg(), strArg('mine', 'Makhlukmu'), strArg('theirs', 'Makhluk lawan')]),

  cmd('spawn', 'Munculkan makhluk liar (admin server)', async (ctx) => {
    if (!ctx.member?.permissions.has('ManageGuild')) return ctx.reply('Hanya yang punya izin **Manage Server**.');
    const roll = Math.random() * 100;
    const t = pickOf(roll < 70 ? 'rare' : roll < 95 ? 'epic' : 'legendary');
    const r = RARITIES[t.rarity];
    const kid = newKid();
    const e = embed('🌟 Makhluk liar muncul!', `${t.emoji} **${t.name}** (${r.emoji} ${r.label}) muncul!\nTekan tombol untuk menangkapnya — yang tercepat menang! (60 detik)`);
    const msg = await ctx.sourceMessage!.reply({ embeds: [e], components: [buttonRow('s', kid)], allowedMentions: { parse: [] } });
    const p: Extract<Pending, { kind: 's' }> = { kind: 's', creatureId: t.id, msg };
    pending.set(kid, p);
    arm(kid, msg, p);
  }),
];

const allCommands = [...commands, ...prefixCommands];
const ALIASES: Record<string, string> = {
  p: 'profile', profil: 'profile', h: 'hunt', z: 'zoo', koleksi: 'zoo', d: 'dex', i: 'info', f: 'feed',
  bal: 'cash', balance: 'cash', store: 'shop', inventory: 'inv', bag: 'inv', coinflip: 'cf',
  slot: 'slots', guild: 'coven', cv: 'coven', leaderboard: 'lb', top: 'lb', b: 'battle', fight: 'battle',
  pve: 'dungeon', dg: 'dungeon', tr: 'trade', commands: 'help',
  pancing: 'mancing', kail: 'mancing', fp: 'profilikan', fprofil: 'profilikan',
  ft: 'topikan', ftop: 'topikan', enso: 'ensiklopedia',
};

export const wizzyModule: BotModule = {
  name: 'wizzy' as ModuleName,
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  commands,
  async onPrefixCommand(ctx, name, rest) {
    const canonical = ALIASES[name] ?? (allCommands.some((c) => c.name === name) ? name : null);
    if (!canonical) return false;
    const c = allCommands.find((x) => x.name === canonical);
    if (!c) return false;
    const args: Record<string, unknown> = {};
    let i = 0;
    for (const a of c.args) {
      if (a.rest) { args[a.name] = rest.slice(i).join(' '); i = rest.length; }
      else args[a.name] = rest[i++] ?? '';
    }
    await c.execute(ctx, args);
    return true;
  },
  async onInteraction(ctx: ModuleCtx, interaction: Interaction) {
    if (!interaction.isButton()) return;
    const m = interaction.customId.match(/^wiz:([btfs]):([a-z]+):(\d+)$/);
    if (!m) return;
    const [, kind, action, kid] = m as unknown as [string, Pending['kind'], string, string];
    const p = pending.get(kid);
    if (!p) return void interaction.reply({ content: 'Tawaran ini sudah kedaluwarsa.', ephemeral: true }).catch(() => {});
    clearTimeout(p.timer);
    pending.delete(kid);
    const finish = async (e: APIEmbed) => {
      await interaction.update({ components: [buttonRow(kind, kid, true)], embeds: [e] }).catch(() => {});
      unbusy(p);
    };
    const notForYou = async () => {
      unbusy(p);
      await interaction.reply({ content: 'Tawaran ini bukan untukmu!', ephemeral: true }).catch(() => {});
    };
    const cmdCtx: CommandContext = {
      client: ctx.client, botId: ctx.botId, guild: ctx.guild,
      member: interaction.member as CommandContext['member'], user: interaction.user,
      channel: interaction.channel as CommandContext['channel'], config: ctx.config,
      reply: async () => undefined,
    };
    try {
      if (p.kind === 'b') {
        if (interaction.user.id !== p.target) return void notForYou();
        const e = await resolveBattle(cmdCtx, p, action === 'acc');
        await finish(e);
      } else if (p.kind === 't') {
        if (interaction.user.id !== p.target) return void notForYou();
        const e = await resolveTrade(cmdCtx, p, action === 'ok');
        await finish(e);
      } else if (p.kind === 'f') {
        if (interaction.user.id !== p.fisher) return void notForYou();
        const e = await resolveFishing(cmdCtx, p);
        await finish(e);
      } else {
        if (!await getUser(ctx.botId, interaction.user.id)) return void interaction.reply({ content: 'Ketik `gstart` dulu!', ephemeral: true }).catch(() => {});
        const c = byId[p.creatureId]!;
        await addCreature(ctx.botId, interaction.user.id, c.id);
        await finish(embed('🎯 Tertangkap!', `<@${interaction.user.id}> menangkap ${c.emoji} **${c.name}** (${RARITIES[c.rarity].emoji} ${RARITIES[c.rarity].label})!`));
      }
    } catch {
      await interaction.reply({ content: 'Sihirnya gagal!', ephemeral: true }).catch(() => {});
    }
  },
  stop() {
    for (const p of pending.values()) clearTimeout(p.timer);
    pending.clear(); busy.clear(); fishingInProgress.clear(); fishCooldowns.clear();
  },
};
