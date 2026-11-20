import { GatewayIntentBits, SlashCommandBuilder } from 'discord.js';
import { and, eq, sql } from 'drizzle-orm';
import { db, wizzyCreatures, wizzyUsers, type ModuleName } from '@platform/core';
import type { BotModule, CommandContext, ModuleCommand } from './types';

const COLOR = 0x7b2ff7;
const FOOTER = 'Wizzy • Dunia Sihir';
const GOLD = 0xf5c542;
const DAY_MS = 86_400_000;

const RARITIES = {
  common: { label: 'Common', chance: 60, price: 10, emoji: '⚪' },
  uncommon: { label: 'Uncommon', chance: 25, price: 40, emoji: '🟢' },
  rare: { label: 'Rare', chance: 10, price: 150, emoji: '🔵' },
  epic: { label: 'Epic', chance: 4, price: 600, emoji: '🟣' },
  legendary: { label: 'Legendary', chance: 0.9, price: 3000, emoji: '🟡' },
  mythic: { label: 'Mythic', chance: 0.1, price: 25000, emoji: '🔴' },
} as const;
type Rarity = keyof typeof RARITIES;

const CREATURES = [
  { id: 'pixie', name: 'Pixie', emoji: '🧚', rarity: 'common' },
  { id: 'niffler', name: 'Niffler', emoji: '🦡', rarity: 'common' },
  { id: 'bowtruckle', name: 'Bowtruckle', emoji: '🌿', rarity: 'common' },
  { id: 'firecrab', name: 'Fire Crab', emoji: '🦀', rarity: 'common' },
  { id: 'hippogriff', name: 'Hippogriff', emoji: '🦅', rarity: 'uncommon' },
  { id: 'kelpie', name: 'Kelpie', emoji: '🐴', rarity: 'uncommon' },
  { id: 'puffskein', name: 'Puffskein', emoji: '🐹', rarity: 'uncommon' },
  { id: 'unicorn', name: 'Unicorn', emoji: '🦄', rarity: 'rare' },
  { id: 'centaur', name: 'Centaur', emoji: '🏹', rarity: 'rare' },
  { id: 'merfolk', name: 'Merfolk', emoji: '🧜', rarity: 'rare' },
  { id: 'thestral', name: 'Thestral', emoji: '💀', rarity: 'epic' },
  { id: 'basilisk', name: 'Basilisk', emoji: '🐍', rarity: 'epic' },
  { id: 'griffin', name: 'Griffin', emoji: '🦁', rarity: 'epic' },
  { id: 'phoenix', name: 'Phoenix', emoji: '🔥', rarity: 'legendary' },
  { id: 'dragon', name: 'Dragon', emoji: '🐲', rarity: 'legendary' },
  { id: 'kraken', name: 'Kraken', emoji: '🦑', rarity: 'legendary' },
  { id: 'archmage', name: 'Archmage Spirit', emoji: '🌌', rarity: 'mythic' },
  { id: 'wyrm', name: 'Ancient Wyrm', emoji: '🐉', rarity: 'mythic' },
] as const;
const byId = Object.fromEntries(CREATURES.map((c) => [c.id, c])) as Record<string, (typeof CREATURES)[number]>;

const HOUSES = ['Ignis 🔥', 'Aqua 💧', 'Ventus 🌪️', 'Terra 🪨'];
const fmt = (n: number) => n.toLocaleString('id-ID');
const cur = (ctx: CommandContext) => String(ctx.config.currency || 'Galleon');
const cdMs = (ctx: CommandContext) => (Number(ctx.config.huntCooldownSec) || 15) * 1000;
const embed = (title: string, description: string, color = COLOR) => ({ title, description, color, footer: { text: FOOTER } });

const getUser = async (botId: number, userId: string) => {
  const [u] = await db.select().from(wizzyUsers)
    .where(and(eq(wizzyUsers.botId, botId), eq(wizzyUsers.discordUserId, userId)));
  return u;
};
const getCreatures = async (botId: number, userId: string) =>
  db.select().from(wizzyCreatures)
    .where(and(eq(wizzyCreatures.botId, botId), eq(wizzyCreatures.discordUserId, userId)));

function rollRarity(): Rarity {
  const entries = Object.entries(RARITIES) as [Rarity, (typeof RARITIES)[Rarity]][];
  let roll = Math.random() * entries.reduce((s, [, r]) => s + r.chance, 0);
  for (const [key, r] of entries) { roll -= r.chance; if (roll <= 0) return key; }
  return 'common';
}
function huntOnce() {
  const rarity = rollRarity();
  const pool = CREATURES.filter((c) => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)]!;
}

type Run = (ctx: CommandContext, args: Record<string, unknown>) => Promise<unknown>;
function cmd(
  name: string, description: string, run: Run,
  arg?: { name: string; description: string; rest?: boolean },
): ModuleCommand {
  return {
    name, description,
    args: arg ? [{ name: arg.name, type: 'string', rest: arg.rest }] : [],
    buildSlash: () => {
      const b = new SlashCommandBuilder().setName(name).setDescription(description);
      if (arg) b.addStringOption((o) => o.setName(arg.name).setDescription(arg.description).setRequired(false));
      return b.toJSON();
    },
    execute: run,
  } as ModuleCommand;
}

const needUser = async (ctx: CommandContext) => {
  const u = await getUser(ctx.botId, ctx.user.id);
  if (!u) await ctx.reply('Kamu belum mulai! Ketik `gstart` dulu 🧙‍♂️');
  return u;
};

const targetUser = (ctx: CommandContext, raw: unknown) => {
  const text = String(raw ?? '');
  const id = text.match(/^<@!?(\d+)>$/)?.[1] ?? (/^\d{5,25}$/.test(text) ? text : null);
  return id ?? ctx.user.id;
};

const commands: ModuleCommand[] = [
  cmd('start', 'Mulai petualangan di Dunia Sihir', async (ctx) => {
    if (await getUser(ctx.botId, ctx.user.id)) {
      return ctx.reply('Kamu sudah punya akun, penyihir! Ketik `ghunt` untuk berburu.');
    }
    const house = HOUSES[Math.floor(Math.random() * HOUSES.length)]!;
    await db.insert(wizzyUsers).values({ botId: ctx.botId, discordUserId: ctx.user.id, house });
    return ctx.reply({ embeds: [embed('✨ Selamat datang di Dunia Sihir!',
      `Topi seleksi memilihmu masuk house **${house}**!\nKamu mendapat **100 ${cur(ctx)}**.\n\nKetik \`ghunt\` untuk berburu makhluk pertamamu.`)] });
  }),

  cmd('profile', 'Kartu penyihir', async (ctx, args) => {
    const id = targetUser(ctx, args.user);
    const u = await getUser(ctx.botId, id);
    if (!u) return ctx.reply(id === ctx.user.id ? 'Ketik `gstart` dulu!' : 'Pemain itu belum mulai.');
    const member = ctx.guild?.members.cache.get(id) ?? await ctx.guild?.members.fetch(id).catch(() => null);
    const display = member?.user ?? ctx.client.users.cache.get(id) ?? ctx.user;
    const owned = await getCreatures(ctx.botId, id);
    const dex = new Set(owned.map((c) => c.creatureId)).size;
    return ctx.reply({ embeds: [{
      ...embed('🧙 Kartu Penyihir', `**${display.username}**`),
      thumbnail: { url: display.displayAvatarURL() },
      fields: [
        { name: 'House', value: u.house, inline: true },
        { name: 'Level', value: `${u.level} (${u.xp}/${u.level * 100} XP)`, inline: true },
        { name: cur(ctx), value: `💰 ${fmt(u.galleons)}`, inline: true },
        { name: 'Koleksi', value: `🏆 ${owned.length} makhluk`, inline: true },
        { name: 'Battle', value: `${u.wins}M / ${u.losses}K`, inline: true },
        { name: 'Dex', value: `${dex}/${CREATURES.length} jenis`, inline: true },
        { name: 'Streak Daily', value: `🔥 ${u.dailyStreak}`, inline: true },
      ],
    }] });
  }, { name: 'user', description: 'ID atau mention user (kosong = diri sendiri)' }),

  cmd('daily', 'Klaim hadiah harian', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const now = Date.now();
    const since = u.lastDailyAt ? now - u.lastDailyAt.getTime() : DAY_MS;
    if (since < DAY_MS) {
      const left = DAY_MS - since;
      return ctx.reply(`⏳ Daily berikutnya dalam **${Math.floor(left / 3_600_000)}j ${Math.floor((left % 3_600_000) / 60_000)}m**.`);
    }
    const streak = since < 2 * DAY_MS ? Math.min(u.dailyStreak + 1, 30) : 1;
    const reward = 200 + streak * 20;
    await db.update(wizzyUsers).set({ dailyStreak: streak, lastDailyAt: new Date(now) })
      .where(eq(wizzyUsers.id, u.id));
    await db.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} + ${reward}` })
      .where(eq(wizzyUsers.id, u.id));
    return ctx.reply({ embeds: [embed('🎁 Hadiah Harian',
      `Kamu mendapat **${fmt(reward)} ${cur(ctx)}**!\n🔥 Streak: **${streak}** hari`)] });
  }),

  cmd('cash', 'Cek saldo Galleon', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    return ctx.reply(`💰 **${ctx.user.username}**, saldomu: **${fmt(u.galleons)} ${cur(ctx)}**`);
  }),

  cmd('hunt', 'Berburu makhluk sihir', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const key = `${ctx.botId}:${ctx.user.id}`;
    const left = (cooldowns.get(key) ?? 0) - Date.now();
    if (left > 0) return ctx.reply(`⏳ Tunggu **${Math.ceil(left / 1000)} detik** lagi.`);
    cooldowns.set(key, Date.now() + cdMs(ctx));

    const caught = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, huntOnce);
    const levelUp = await db.transaction(async (tx) => {
      for (const c of caught) {
        await tx.insert(wizzyCreatures).values({ botId: ctx.botId, discordUserId: ctx.user.id, creatureId: c.id });
      }
      let xp = u.xp + caught.length * 5, level = u.level;
      while (xp >= level * 100) { xp -= level * 100; level++; }
      await tx.update(wizzyUsers).set({ xp, level }).where(eq(wizzyUsers.id, u.id));
      return level > u.level ? level : 0;
    });
    const lines = caught.map((c) => `${c.emoji} **${c.name}** ${RARITIES[c.rarity].emoji} ${RARITIES[c.rarity].label}`);
    let desc = `${ctx.user.username} berburu dan menemukan:\n\n${lines.join('\n')}`;
    if (levelUp) desc += `\n\n🎉 **Naik ke level ${levelUp}!**`;
    return ctx.reply({ embeds: [embed('🏆 Hasil Berburu', desc)] });
  }),

  cmd('zoo', 'Lihat koleksi makhluk', async (ctx) => {
    const u = await needUser(ctx);
    if (!u) return;
    const owned = await getCreatures(ctx.botId, ctx.user.id);
    if (!owned.length) return ctx.reply('Koleksimu kosong. Ketik `ghunt`!');
    const count = new Map<string, number>();
    for (const o of owned) count.set(o.creatureId, (count.get(o.creatureId) ?? 0) + 1);
    const sections = (Object.keys(RARITIES) as Rarity[]).map((key) => {
      const items = CREATURES.filter((c) => c.rarity === key && count.has(c.id))
        .map((c) => `${c.emoji}x${count.get(c.id)}`).join(' ');
      return items ? `${RARITIES[key].emoji} **${RARITIES[key].label}**: ${items}` : '';
    }).filter(Boolean);
    return ctx.reply({ embeds: [embed(`📚 Zoo ${ctx.user.username}`,
      `${sections.join('\n')}\n\n📖 Dex: **${count.size}/${CREATURES.length}** jenis`)] });
  }),

  cmd('sell', 'Jual makhluk', async (ctx, args) => {
    const u = await needUser(ctx);
    if (!u) return;
    const target = String(args.target ?? '').trim().toLowerCase();
    if (!target) return ctx.reply('Pakai: `gsell all`, `gsell <rarity>`, atau `gsell <nama makhluk>`');
    const key = target.replace(/\s/g, '');
    const owned = (await getCreatures(ctx.botId, ctx.user.id)).filter((c) => !c.isInTeam);
    const toSell = owned.filter((c) => {
      const info = byId[c.creatureId];
      if (!info) return false;
      if (target === 'all') return true;
      if (target in RARITIES) return info.rarity === target;
      return info.id === key || info.name.toLowerCase().replace(/\s/g, '') === key;
    });
    if (!toSell.length) return ctx.reply('Tidak ada makhluk yang cocok untuk dijual (makhluk di tim tidak ikut terjual).');
    const total = toSell.reduce((s, c) => s + RARITIES[byId[c.creatureId]!.rarity as Rarity].price, 0);
    await db.transaction(async (tx) => {
      for (const c of toSell) {
        await tx.delete(wizzyCreatures).where(eq(wizzyCreatures.id, c.id));
      }
      await tx.update(wizzyUsers).set({ galleons: sql`${wizzyUsers.galleons} + ${total}` })
        .where(eq(wizzyUsers.id, u.id));
    });
    return ctx.reply(`💰 Menjual **${toSell.length}** makhluk seharga **${fmt(total)} ${cur(ctx)}**!`);
  }, { name: 'target', description: 'all | rarity | nama makhluk', rest: true }),

  cmd('help', 'Daftar command Wizzy', async (ctx) => ctx.reply({ embeds: [embed('🔮 Bantuan Wizzy', [
    '**🧙 Dasar**', '`gstart` mulai petualangan', '`gprofile [@user]` kartu penyihir',
    '`gdaily` hadiah harian', '`gcash` cek saldo', '', '**🏆 Berburu**',
    '`ghunt` (`gh`) berburu makhluk', '`gzoo` lihat koleksi',
    '`gsell <all|rarity|nama>` jual makhluk', '', '*Battle, shop, dan lainnya segera hadir!*',
  ].join('\n'))] })),
];

const cooldowns = new Map<string, number>();
const ALIASES: Record<string, string> = {
  h: 'hunt', bal: 'cash', balance: 'cash', p: 'profile', profil: 'profile',
  z: 'zoo', koleksi: 'zoo', s: 'sell', commands: 'help',
};

export const wizzyModule: BotModule = {
  name: 'wizzy' as ModuleName,
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  commands,
  async onPrefixCommand(ctx, name, rest) {
    const canonical = ALIASES[name];
    if (!canonical) return false;
    const cmd = commands.find((c) => c.name === canonical);
    if (!cmd) return false;
    const args: Record<string, unknown> = {};
    if (cmd.args[0]) args[cmd.args[0].name] = cmd.args[0].rest ? rest.join(' ') : rest[0] ?? '';
    await cmd.execute(ctx, args);
    return true;
  },
  stop() { cooldowns.clear(); },
};
