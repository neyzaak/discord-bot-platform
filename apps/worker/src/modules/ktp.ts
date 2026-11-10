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

const EMPTY = '-';
const W = 940, H = 540;

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

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1e3a8a');
  grad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (const [x, y, r] of [[-60, -60, 120], [W + 60, H + 60, 160], [W - 40, -40, 90]]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Header
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 30, 30, W - 60, 110, 20);
  ctx.fill();
  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('KARTU TANDA PENDUDUK', 60, 84);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#60a5fa';
  ctx.fillText(guildName, 60, 110);

  // Konten
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 30, 160, W - 60, 260, 16);
  ctx.fill();

  // Foto profil
  ctx.fillStyle = '#e2e8f0';
  roundRect(ctx, W - 300, 190, 220, 200, 16);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FOTO PROFIL', W - 190, 214);
  ctx.textAlign = 'left';

  let avatarDrawn = false;
  try {
    const img = await loadImage(user.displayAvatarURL({ extension: 'png', size: 512 }));
    const cx = W - 190, cy = 310, r = 70;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    avatarDrawn = true;
  } catch (e) {
    logger.warn({ err: e }, 'avatar load gagal');
  }
  if (!avatarDrawn) {
    const cx = W - 190, cy = 310, r = 70;
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(clampText(ctx, data.nama ?? user.username, 180), W - 190, 412);
  ctx.fillStyle = '#64748b';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Warga ${guildName}`, W - 190, 436);
  ctx.textAlign = 'left';

  // Field kiri
  const fields: [string, string][] = [
    ['Nama', data.nama ?? user.username],
    ['ID Akun', user.id],
    ['Tempat/Tgl Lahir', `${data.tempat ?? '-'}, ${data.tglLahir ?? '-'}`],
    ['Jenis Kelamin', data.gender ?? '-'],
    ['Kota/Kab', data.kota ?? '-'],
    ['Agama', data.agama ?? '-'],
    ['Pekerjaan', data.pekerjaan ?? '-'],
    ['Status', data.status ?? '-'],
  ];
  let fy = 210;
  for (const [label, val] of fields) {
    ctx.fillStyle = '#475569';
    ctx.font = '22px sans-serif';
    ctx.fillText(label, 60, fy);
    ctx.fillStyle = '#1e293b';
    ctx.font = '24px sans-serif';
    ctx.fillText(`: ${clampText(ctx, val, 460)}`, 190, fy);
    fy += 40;
  }

  // Footer
  ctx.fillStyle = '#1e3a8a';
  roundRect(ctx, 30, 450, W - 60, 50, 12);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`KARTU KOMUNITAS RESMI • ${guildName}`, W / 2, 480);
  ctx.textAlign = 'left';

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
