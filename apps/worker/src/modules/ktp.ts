import {
  AttachmentBuilder, GatewayIntentBits, SlashCommandBuilder,
  type APIEmbed, type GuildMember,
} from 'discord.js';
import { and, eq } from 'drizzle-orm';
import { botConfigs, db, logger, recordError } from '@platform/core';
import type { BotModule, ModuleCommand, ModuleCtx } from './types';

let canvasMod: { createCanvas: (w: number, h: number) => any; loadImage: (url: string) => Promise<any> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  canvasMod = require('@napi-rs/canvas');
} catch (e) {
  logger.warn({ err: e }, 'canvas tidak tersedia — /ktp fallback embed');
}
const createCanvas = canvasMod?.createCanvas ?? ((w: number, h: number) => { throw new Error('canvas not available'); });
const loadImage = canvasMod?.loadImage ?? (async (url: string) => { throw new Error('canvas not available'); });

interface KtpData {
  nama?: string; tempat?: string; tglLahir?: string; gender?: string;
  kota?: string; agama?: string; pekerjaan?: string; status?: string;
}

const W = 1280, H = 720;

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function clampText(ctx: any, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let cut = text;
  while (cut.length > 0 && ctx.measureText(cut + '…').width > maxW) cut = cut.slice(0, -1);
  return cut + '…';
}

function star(ctx: any, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.14, cy - r * 0.14, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.14, cy + r * 0.14, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.14, cy + r * 0.14, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.14, cy - r * 0.14, cx, cy - r);
  ctx.closePath();
  ctx.fill();
}

function spacedText(ctx: any, text: string, x: number, y: number, spacing: number): number {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - x - spacing;
}

function spacedCentered(ctx: any, text: string, centerX: number, y: number, spacing: number): void {
  let total = -spacing;
  for (const ch of text) total += ctx.measureText(ch).width + spacing;
  spacedText(ctx, text, centerX - total / 2, y, spacing);
}

async function getKtp(botId: number, guildId: string, userId: string): Promise<KtpData | undefined> {
  const [row] = await db.select().from(botConfigs)
    .where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, guildId)));
  const ktp = ((row?.data as Record<string, unknown> ?? {})?.ktp as Record<string, unknown> ?? {});
  return ktp[userId] as KtpData | undefined;
}

async function setKtp(botId: number, guildId: string, userId: string, patch: Partial<KtpData>): Promise<void> {
  const [row] = await db.select().from(botConfigs)
    .where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, guildId)));
  const existing = (row?.data as Record<string, unknown> ?? {}) as Record<string, unknown>;
  const ktp = (existing.ktp as Record<string, unknown> ?? {}) as Record<string, KtpData>;
  ktp[userId] = { ...(ktp[userId] ?? {}), ...patch };
  const data = { ...existing, ktp };
  if (row) {
    await db.update(botConfigs).set({ data, updatedAt: new Date() })
      .where(and(eq(botConfigs.botId, botId), eq(botConfigs.discordGuildId, guildId)));
  } else {
    await db.insert(botConfigs).values({ botId, discordGuildId: guildId, data });
  }
}

async function renderKtp(user: any, guildName: string, data: KtpData): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Latar biru
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1b3d8c');
  bg.addColorStop(0.55, '#2a5bc0');
  bg.addColorStop(1, '#1a3a85');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Panel geometris
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(430, 0); ctx.lineTo(0, 430); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W, 380); ctx.lineTo(W - 300, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(360, H); ctx.lineTo(0, H - 280); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(W, H); ctx.lineTo(W - 380, H); ctx.lineTo(W, H - 310); ctx.closePath(); ctx.fill();

  // Bintang latar
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of [[355, 66, 14], [40, 275, 9], [1240, 300, 8], [1252, 648, 8], [42, 630, 7], [880, 700, 8]]) star(ctx, x, y, r);

  // Kartu
  const CX = 60, CY = 40, CW = W - 120, CH = H - 80, CR = 22;
  ctx.fillStyle = '#f7f6f1';
  roundRect(ctx, CX, CY, CW, CH, CR);
  ctx.fill();

  // Header biru (mengikuti sudut kartu)
  ctx.save();
  roundRect(ctx, CX, CY, CW, CH, CR);
  ctx.clip();
  ctx.fillStyle = '#1e3f8f';
  ctx.fillRect(CX, CY, CW, 132);
  ctx.fillStyle = '#e9eef7';
  ctx.fillRect(CX, CY + CH - 58, CW, 58);
  ctx.restore();

  // Logo bintang
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(108, 106, 41, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  star(ctx, 108, 106, 26);

  // Judul
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText('KARTU TANDA PENDUDUK', 178, 102);
  ctx.fillStyle = '#9dc0f0';
  ctx.font = 'bold 20px sans-serif';
  spacedText(ctx, guildName.toUpperCase(), 180, 140, 5);

  // Baris field
  const rows: [string, string][] = [
    ['Nama', data.nama ?? user.username],
    ['ID Akun', user.id],
    ['Tempat/Tgl Lahir', `${data.tempat ?? '-'}, ${data.tglLahir ?? '-'}`],
    ['Jenis Kelamin', data.gender ?? '-'],
    ['Kota/Kab', data.kota ?? '-'],
    ['Agama', data.agama ?? '-'],
    ['Pekerjaan', data.pekerjaan ?? '-'],
    ['Status', data.status ?? '-'],
  ];
  const labelX = 92, colonX = 360, valueX = 380, lineEnd = 930;
  let y = 228;
  for (const [label, val] of rows) {
    ctx.font = 'bold 23px sans-serif';
    ctx.fillStyle = '#3d63ad';
    ctx.fillText(label, labelX, y);
    ctx.fillText(':', colonX, y);
    ctx.fillStyle = '#14306b';
    ctx.fillText(clampText(ctx, val, lineEnd - valueX - 10), valueX, y);
    ctx.strokeStyle = '#d6deec';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(labelX, y + 16); ctx.lineTo(lineEnd, y + 16); ctx.stroke();
    y += 50;
  }

  // Kolom foto
  const px = 966, py = 198, pw = 232, ph = 288;
  ctx.fillStyle = '#eef2f9';
  roundRect(ctx, px, py, pw, ph, 14); ctx.fill();
  ctx.strokeStyle = '#1e3f8f';
  ctx.lineWidth = 3;
  roundRect(ctx, px, py, pw, ph, 14); ctx.stroke();

  ctx.fillStyle = '#7d9bc9';
  ctx.font = 'bold 17px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FOTO PROFIL', px + pw / 2, py + 30);

  const cx = px + pw / 2, cy = py + 168;
  let avatarDrawn = false;
  try {
    const img = await loadImage(user.displayAvatarURL({ extension: 'png', size: 512 }));
    const r = 66;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    avatarDrawn = true;
  } catch (e) {
    logger.warn({ err: e }, 'avatar load gagal');
  }
  if (!avatarDrawn) {
    ctx.fillStyle = '#b9c9e2';
    ctx.beginPath(); ctx.arc(cx, cy - 28, 42, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy + 92, 74, 58, 0, Math.PI, 0); ctx.fill();
  }

  ctx.fillStyle = '#1e3f8f';
  ctx.font = 'bold 27px sans-serif';
  ctx.fillText(clampText(ctx, (data.nama ?? user.username).toUpperCase(), pw + 60), cx, py + ph + 38);
  ctx.fillStyle = '#5b7fc7';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(clampText(ctx, `Warga ${guildName}`, pw + 60), cx, py + ph + 66);
  ctx.textAlign = 'left';

  // Footer
  ctx.fillStyle = '#3d63ad';
  ctx.font = 'bold 19px sans-serif';
  spacedCentered(ctx, `KARTU KOMUNITAS RESMI • ${guildName.toUpperCase()}`, W / 2, CY + CH - 20, 4);

  return canvas.toBuffer('image/png');
}

const ktpSet: ModuleCommand = {
  name: 'ktpset', description: 'Set data KTP kamu (nama, tempat, tgllahir, gender, kota, agama, pekerjaan, status)',
  args: [
    { name: 'field', type: 'string' },
    { name: 'value', type: 'string', rest: true },
  ],
  buildSlash: () => new SlashCommandBuilder()
    .setName('ktpset').setDescription('Isi data KTP kamu')
    .addStringOption((o) => o.setName('field').setDescription('Field: nama, tempat, tgllahir, gender, kota, agama, pekerjaan, status').setRequired(true))
    .addStringOption((o) => o.setName('value').setDescription('Nilai field').setRequired(true)).toJSON(),
  async execute(ctx, args) {
    if (!ctx.guild || !ctx.user) return ctx.reply('❌ Hanya di server.');
    const field = String(args.field ?? '').toLowerCase();
    const map: Record<string, keyof KtpData> = {
      nama: 'nama', tempat: 'tempat', tgllahir: 'tglLahir', gender: 'gender',
      kota: 'kota', agama: 'agama', pekerjaan: 'pekerjaan', status: 'status',
    };
    const key = map[field];
    if (!key) return ctx.reply('❌ Field tidak dikenal. Pilih: nama, tempat, tgllahir, gender, kota, agama, pekerjaan, status.');
    const value = String(args.value ?? '').trim();
    if (!value) return ctx.reply('❌ Nilai tidak boleh kosong.');
    await setKtp(ctx.botId, ctx.guild.id, ctx.user.id, { [key]: value });
    return ctx.reply('✅ Data KTP diperbarui.');
  },
};

const ktpView: ModuleCommand = {
  name: 'ktp', description: 'Lihat KTP kamu atau user lain',
  args: [{ name: 'user', type: 'user' }],
  buildSlash: () => new SlashCommandBuilder()
    .setName('ktp').setDescription('Lihat KTP')
    .addUserOption((o) => o.setName('user').setDescription('User (kosong = dirimu)')).toJSON(),
  async execute(ctx, args) {
    if (!ctx.guild || !ctx.user) return ctx.reply('❌ Hanya di server.');
    const targetMember = args.user as GuildMember | null;
    const targetId = targetMember?.id ?? ctx.user.id;
    const targetUser = targetMember?.user ?? ctx.user;
    const data = await getKtp(ctx.botId, ctx.guild.id, targetId) ?? {};

    if (canvasMod) {
      try {
        const buffer = await renderKtp(targetUser, ctx.guild.name, data);
        return ctx.reply({ files: [new AttachmentBuilder(buffer, { name: 'ktp.png' })] });
      } catch (e) {
        await recordError(ctx.botId, e);
      }
    }

    const embed: APIEmbed = {
      title: '🪪 Kartu Tanda Penduduk',
      description: [
        `**Nama:** ${data.nama ?? targetUser.username}`,
        `**ID Akun:** ${targetId}`,
        `**Tempat/Tgl Lahir:** ${data.tempat ?? '-'}, ${data.tglLahir ?? '-'}`,
        `**Jenis Kelamin:** ${data.gender ?? '-'}`,
        `**Kota/Kab:** ${data.kota ?? '-'}`,
        `**Agama:** ${data.agama ?? '-'}`,
        `**Pekerjaan:** ${data.pekerjaan ?? '-'}`,
        `**Status:** ${data.status ?? '-'}`,
      ].join('\n'),
      color: 0x1e3a8a,
    };
    return ctx.reply({ embeds: [embed] });
  },
};

export const ktpModule: BotModule = {
  name: 'ktp',
  intents: [GatewayIntentBits.Guilds],
  commands: [ktpView, ktpSet],
};
