import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits,
  ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, TextInputBuilder, TextInputStyle,
  type Client, type Interaction, type Message,
} from 'discord.js';
import { and, eq, sql } from 'drizzle-orm';
import latarBase64 from '../../assets/latar-quotes.png';
import { botConfigs, db, logger, quotesConfigSchema, recordError, redis } from '@platform/core';
import type { BotModule, CommandContext, ModuleCommand, ModuleCtx } from './types';

type QuotesCfg = ReturnType<typeof quotesConfigSchema.parse>;
type Quote = QuotesCfg['quotes'][number];

/** State kartu per pesan (tombol mengubah ini lalu gambar dirender ulang). */
interface CardState {
  text: string;
  author: string;
  imageUrl: string;
  pos: 'kiri' | 'kanan';
  size: 'kecil' | 'sedang' | 'besar';
  font: 'poppins' | 'playfair';
}

const W = 1200, H = 675;
const TEXT_PX = { kecil: 40, sedang: 52, besar: 64 } as const;
const ORDER = {
  pos: ['kiri', 'kanan'] as const,
  size: ['kecil', 'sedang', 'besar'] as const,
  font: ['poppins', 'playfair'] as const,
};
const ASSET_DIRS = ['../../assets/', './assets/'].map((p) => fileURLToPath(new URL(p, import.meta.url)));
const asset = (name: string) => ASSET_DIRS.map((d) => join(d, name)).find(existsSync) ?? '';

// ponytail: font/latar opsional — kalau file tidak ikut ter-copy ke deploy, canvas pakai sans-serif/warna solid
let canvasMod: typeof import('@napi-rs/canvas') | null | undefined;
type CardImage = Awaited<ReturnType<NonNullable<typeof canvasMod>['loadImage']>>;
let bgImage: CardImage | null | undefined;
async function getCanvas() {
  if (canvasMod !== undefined) return canvasMod;
  try {
    canvasMod = await import('@napi-rs/canvas');
    for (const [file, family] of [['fonts/Poppins-SemiBold.ttf', 'Poppins'], ['fonts/PlayfairDisplay-SemiBold.ttf', 'Playfair']] as const) {
      const p = asset(file);
      if (!p) { logger.warn({ file }, 'font quotes tidak ditemukan — pakai sans-serif'); continue; }
      try {
        canvasMod.GlobalFonts.registerFromPath(p, family);
      } catch (e) { logger.warn({ err: e, file }, 'gagal daftar font'); }
    }
  } catch (e) {
    logger.warn({ err: e }, 'canvas tidak tersedia — /quote nonaktif');
    canvasMod = null;
  }
  return canvasMod;
}

async function getBg(c: NonNullable<typeof canvasMod>): Promise<CardImage | null> {
  if (bgImage !== undefined) return bgImage;
  try { bgImage = await c.loadImage(Buffer.from(latarBase64, 'base64')); }
  catch (e) { logger.warn({ err: e }, 'latar quotes gagal dimuat — pakai warna solid'); bgImage = null; }
  return bgImage;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const nextOf = <T extends string>(arr: readonly T[], cur: T): T => arr[(arr.indexOf(cur) + 1) % arr.length]!;

/** Tanggal "dianggap WIB" — pakai getUTC* pada date yang digeser +7 jam. */
function wibNow(): Date { return new Date(Date.now() + 7 * 3_600_000); }
function wibDayIndex(): number { return Math.floor((Date.now() + 7 * 3_600_000) / 86_400_000); }

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tanggalId = (d: Date): string => `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

function wrapText(ctx: { measureText: (t: string) => { width: number } }, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(cand).width > maxW) { out.push(line); line = word; }
      else line = cand;
    }
    if (line) out.push(line);
  }
  return out.length ? out : ['…'];
}

async function renderCard(botName: string, cfg: QuotesCfg, st: CardState): Promise<Buffer> {
  const c = await getCanvas();
  if (!c) throw new Error('canvas tidak tersedia');
  const canvas = c.createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const zones = {
    // ponytail: gambar mengisi sepertiga kartu (400/1200), sisanya teks
    kiri: { x: 0, w: 400, tx: 440, tw: 700 },
    kanan: { x: 800, w: 400, tx: 60, tw: 700 },
  };
  const z = zones[st.pos];
  const bgImg = await getBg(c);

  // Latar kiriman jadi satu-satunya dasar kartu (fallback solid hanya kalau aset hilang).
  ctx.fillStyle = '#0e1424';
  ctx.fillRect(0, 0, W, H);
  if (bgImg) {
    const s = Math.max(W / bgImg.width, H / bgImg.height);
    const dw = bgImg.width * s, dh = bgImg.height * s;
    ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const veil = ctx.createLinearGradient(0, 0, W, H);
    veil.addColorStop(0, 'rgba(6,10,22,0.38)');
    veil.addColorStop(1, 'rgba(6,10,22,0.58)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
  }

  //ponytail: zona sepertiga khusus foto per-quote (imageUrl). Kalau kosong, latar di atas yang tampil.
  if (st.imageUrl) {
    const photo = await c.loadImage(st.imageUrl).catch((e) => { logger.warn({ err: e }, 'quotes: foto gagal dimuat'); return null; });
    if (photo) {
      const scale = Math.max(z.w / photo.width, H / photo.height);
      const dw = photo.width * scale, dh = photo.height * scale;
      ctx.save();
      ctx.beginPath(); ctx.rect(z.x, 0, z.w, H); ctx.clip();
      ctx.drawImage(photo, z.x + (z.w - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.restore();

      const scrim = ctx.createLinearGradient(0, 0, 0, H);
      scrim.addColorStop(0, 'rgba(4,7,16,0.30)');
      scrim.addColorStop(1, 'rgba(4,7,16,0.55)');
      ctx.fillStyle = scrim;
      ctx.fillRect(z.x, 0, z.w, H);

      const edge = st.pos === 'kiri' ? z.x + z.w : z.x;
      const dir = st.pos === 'kiri' ? 1 : -1;
      const fade = ctx.createLinearGradient(edge, 0, edge + dir * 220, 0);
      fade.addColorStop(0, 'rgba(14,20,36,0)');
      fade.addColorStop(1, 'rgba(14,20,36,1)');
      ctx.fillStyle = fade;
      ctx.fillRect(Math.min(edge, edge + dir * 220), 0, 220, H);
    }
  }

  const now = wibNow();
  const jam = `${String(now.getUTCHours()).padStart(2, '0')}.${String(now.getUTCMinutes()).padStart(2, '0')}`;
  ctx.textAlign = 'left';
  ctx.font = '600 20px "Poppins", sans-serif';
  ctx.fillStyle = 'rgba(226,232,240,0.75)';
  ctx.fillText(`${botName}  ·  ${jam}`, 48, 56);

  ctx.textAlign = 'right';
  ctx.font = '600 22px "Poppins", sans-serif';
  ctx.fillStyle = 'rgba(203,213,225,0.85)';
  ctx.fillText(tanggalId(now), W - 48, 56);

  const fam = st.font === 'playfair' ? 'Playfair' : 'Poppins';
  const fontStr = (px: number) => `600 ${px}px "${fam}", sans-serif`;

  let px = TEXT_PX[st.size];
  let lines: string[] = [];
  const maxTextH = H - 290;
  for (;;) {
    ctx.font = fontStr(px);
    lines = wrapText(ctx, st.text, z.tw);
    if (lines.length * px * 1.3 <= maxTextH || px <= 20) break;
    px -= 2;
  }

  const lh = px * 1.3;
  let y = H / 2 - (lines.length * lh) / 2 + px;

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#818cf8';
  ctx.font = fontStr(Math.round(px * 2.2));
  ctx.textAlign = 'left';
  ctx.fillText('“', z.tx, y - px * 1.2);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  ctx.font = fontStr(px);
  for (const line of lines) {
    ctx.fillText(line, z.tx, y);
    y += lh;
  }

  if (st.author) {
    ctx.font = `600 ${Math.round(px * 0.46)}px "Poppins", sans-serif`;
    ctx.fillStyle = 'rgba(165,180,252,0.95)';
    ctx.fillText(`— ${st.author}`, z.tx, y + px * 0.45);
  }

  // Watermark di sisi berlawanan dengan teks, biar nama penulis tidak menempel padanya.
  ctx.textAlign = st.pos === 'kiri' ? 'left' : 'right';
  ctx.font = '600 22px "Poppins", sans-serif';
  ctx.fillStyle = 'rgba(148,163,184,0.75)';
  ctx.fillText(cfg.watermark, st.pos === 'kiri' ? 48 : W - 48, H - 40);

  return canvas.toBuffer('image/png');
}

function buttons(st: CardState) {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('q:pos').setStyle(ButtonStyle.Secondary).setLabel(`Posisi Foto: ${cap(st.pos)}`),
    new ButtonBuilder().setCustomId('q:size').setStyle(ButtonStyle.Secondary).setLabel(`Ukuran Teks: ${cap(st.size)}`),
    new ButtonBuilder().setCustomId('q:font').setStyle(ButtonStyle.Secondary).setLabel(`Font: ${st.font === 'playfair' ? 'Playfair' : 'Poppins'}`),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('q:rev').setStyle(ButtonStyle.Primary).setLabel('Revisi Tulisan'),
    new ButtonBuilder().setCustomId('q:reset').setStyle(ButtonStyle.Secondary).setLabel('Reset Tampilan'),
  );
  return [row1, row2];
}

async function cardPayload(botName: string, cfg: QuotesCfg, st: CardState) {
  const png = await renderCard(botName, cfg, st);
  return { files: [new AttachmentBuilder(png, { name: 'quote.png' })], components: buttons(st) };
}

function stateFrom(cfg: QuotesCfg, q: Quote): CardState {
  return { text: q.text, author: q.author, imageUrl: q.imageUrl, pos: cfg.photoPosition, size: cfg.textSize, font: cfg.font };
}

const stateKey = (botId: number, msgId: string) => `qmsg:${botId}:${msgId}`;
async function loadState(botId: number, msgId: string): Promise<CardState | null> {
  const raw = await redis.get(stateKey(botId, msgId)).catch(() => null);
  if (!raw) return null;
  try {
    const st = JSON.parse(raw) as CardState;
    if ((st.pos as string) === 'tengah') st.pos = 'kiri'; // state lama dari mode yang sudah dihapus
    return st;
  } catch { return null; }
}
async function saveState(botId: number, msgId: string, st: CardState): Promise<void> {
  // ponytail: state kedaluwarsa 7 hari — setelah itu tombol memakai default config lagi
  await redis.set(stateKey(botId, msgId), JSON.stringify(st), 'EX', 7 * 86_400).catch(() => {});
}

/** Setting modul saja — bank kutipan tidak ikut ditarik dari DB (hemat egress). */
async function loadCfg(botId: number, guildId: string): Promise<QuotesCfg> {
  const [row] = await db.select({
    cfg: sql<Record<string, unknown> | null>`(${botConfigs.data} -> 'quotes') #- '{quotes}'`,
  }).from(botConfigs).where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, guildId)));
  return quotesConfigSchema.parse((row?.cfg ?? {}) as Record<string, unknown>);
}

/** Ambil 1 kutipan langsung di Postgres. `dayIndex` kosong = acak. */
async function pickQuote(botId: number, guildId: string, dayIndex?: number): Promise<Quote | null> {
  const arr = sql`${botConfigs.data}->'quotes'->'quotes'`;
  const idx = dayIndex === undefined
    ? sql`floor(random() * NULLIF(jsonb_array_length(${arr}), 0))::int`
    : sql`((${dayIndex}::int) % NULLIF(jsonb_array_length(${arr}), 0))::int`;
  const [row] = await db.select({ q: sql<Quote | null>`(${arr})->${idx}`.as('q') })
    .from(botConfigs).where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, guildId)));
  const q = row?.q;
  if (!q || typeof q.text !== 'string' || !q.text.trim()) return null;
  return { text: q.text, author: typeof q.author === 'string' ? q.author : '', imageUrl: typeof q.imageUrl === 'string' ? q.imageUrl : '' };
}

function stateFor(botId: number, msg: Message, cfg: QuotesCfg): Promise<CardState> {
  return loadState(botId, msg.id).then((st) => st ?? stateFrom(cfg, {
    text: 'Kutipan hari ini', author: '', imageUrl: '',
  }));
}

const quoteCommand: ModuleCommand = {
  name: 'quote',
  description: 'Kirim kartu kutipan (kosongkan teks = pilih dari bank kutipan)',
  defer: true,
  args: [{ name: 'teks', type: 'string', rest: true }],
  buildSlash: () => new SlashCommandBuilder()
    .setName('quote').setDescription('Kirim kartu kutipan')
    .addStringOption((o) => o.setName('teks').setDescription('Teks kutipan — pisahkan penulis dengan " | "').setMaxLength(300))
    .toJSON(),
  async execute(ctx, args) {
    if (!ctx.guild) return ctx.reply('❌ Hanya di server.');
    if (!(await getCanvas())) return ctx.reply('❌ Render gambar tidak tersedia di server ini.');
    const cfg = ctx.config as unknown as QuotesCfg;

    const raw = String(args.teks ?? '').trim();
    const [teks, penulis] = raw.split('|').map((s) => s.trim());
    const q: Quote | null = teks
      ? { text: teks.slice(0, 300), author: (penulis || '').slice(0, 64), imageUrl: '' }
      : await pickQuote(ctx.botId, ctx.guild.id);
    if (!q) return ctx.reply('❌ Belum ada kutipan di bank. Tambahkan di dashboard → Quotes, atau `/quote teks:...`.');

    const ch = ctx.channel;
    if (!ch || !ch.isTextBased() || !('send' in ch)) return ctx.reply('❌ Kanal ini tidak bisa dikirimi pesan.');

    const st = stateFrom(cfg, q);
    const msg = await ch.send(await cardPayload(ctx.client.user?.username ?? 'Bot', cfg, st));
    await saveState(ctx.botId, msg.id, st);

    // Prefix command: hapus pesan peminta setelah kartu tampil (butuh Manage Messages).
    if (ctx.sourceMessage) {
      await ctx.sourceMessage.delete().catch(() => {});
      return;
    }
    return ctx.reply('✅ Kartu kutipan dikirim.');
  },
};

/** Jam posting harian (WIB) — cek tiap 15 menit, kunci redis mencegah dobel per hari. */
async function tick(client: Client, botId: number): Promise<void> {
  const now = wibNow();
  const hour = now.getUTCHours();
  const dateKey = now.toISOString().slice(0, 10);

  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = await loadCfg(botId, guild.id);
      if (!cfg.enabled || !cfg.daily || !cfg.channelId) continue;
      if (cfg.scheduleHour !== hour) continue;

      const q = await pickQuote(botId, guild.id, wibDayIndex());
      if (!q) continue;

      const once = await redis.set(`qsent:${botId}:${guild.id}:${dateKey}`, '1', 'EX', 129_600, 'NX');
      if (once !== 'OK') continue;

      const ch = await guild.channels.fetch(cfg.channelId).catch(() => null);
      if (!ch || !ch.isTextBased() || !('send' in ch)) continue;

      const st = stateFrom(cfg, q);
      const msg = await ch.send(await cardPayload(client.user?.username ?? 'Bot', cfg, st));
      await saveState(botId, msg.id, st);
      logger.info({ botId, guildId: guild.id, messageId: msg.id }, 'quotes: kutipan harian terkirim');
    } catch (e) {
      await recordError(botId, e);
    }
  }
}

const timers = new Map<number, NodeJS.Timeout>();

async function handleInteraction(ctx: ModuleCtx, interaction: Interaction): Promise<void> {
  const isQuoteButton = interaction.isButton() && interaction.customId.startsWith('q:');
  const isModal = interaction.isModalSubmit() && interaction.customId === 'q:revmodal';
  if (!isQuoteButton && !isModal) return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    if (interaction.isRepliable()) await interaction.reply({ content: '❌ Butuh izin **Manage Messages**.', ephemeral: true }).catch(() => {});
    return;
  }

  const cfg = ctx.config as unknown as QuotesCfg;
  const msg = interaction.message;
  if (!msg) return;
  const st = await stateFor(ctx.botId, msg, cfg);
  const botName = interaction.client.user?.username ?? 'Bot';

  if (isModal) {
    if (!interaction.isFromMessage()) return;
    const text = interaction.fields.getTextInputValue('quote_text').trim().slice(0, 300);
    st.text = text || st.text;
    st.author = interaction.fields.getTextInputValue('quote_author').trim().slice(0, 64);
    await interaction.update(await cardPayload(botName, cfg, st));
    await saveState(ctx.botId, msg.id, st);
    return;
  }

  if (!interaction.isButton()) return;
  const action = interaction.customId.slice(2);
  if (action === 'pos') st.pos = nextOf(ORDER.pos, st.pos);
  else if (action === 'size') st.size = nextOf(ORDER.size, st.size);
  else if (action === 'font') st.font = nextOf(ORDER.font, st.font);
  else if (action === 'reset') Object.assign(st, stateFrom(cfg, { text: st.text, author: st.author, imageUrl: st.imageUrl }));
  else if (action === 'rev') {
    const modal = new ModalBuilder().setCustomId('q:revmodal').setTitle('Revisi Tulisan')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('quote_text').setLabel('Teks kutipan')
            .setStyle(TextInputStyle.Paragraph).setMaxLength(300).setRequired(true).setValue(st.text),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('quote_author').setLabel('Sumber / penulis (opsional)')
            .setStyle(TextInputStyle.Short).setMaxLength(64).setRequired(false).setValue(st.author),
        ),
      );
    return void interaction.showModal(modal);
  } else return;

  await interaction.update(await cardPayload(botName, cfg, st));
  await saveState(ctx.botId, msg.id, st);
}

export const quotesModule: BotModule = {
  name: 'quotes',
  intents: [GatewayIntentBits.Guilds],
  commands: [quoteCommand],
  onInteraction: handleInteraction,
  start(client, botId) {
    if (timers.has(botId)) return;
    timers.set(botId, setInterval(() => { void tick(client, botId).catch((e) => recordError(botId, e)); }, 15 * 60_000));
  },
  stop(botId) {
    if (botId == null) {
      for (const t of timers.values()) clearInterval(t);
      timers.clear();
      return;
    }
    const t = timers.get(botId);
    if (t) { clearInterval(t); timers.delete(botId); }
  },
};
