import { decryptToken, encryptToken, maskToken } from './crypto';
import { buildInviteUrl, renderTemplate, welcomeConfigSchema } from './schemas';

const token = 'MTIzNDU2Nzg5MDEyMzQ1Njc4OTA.Gabcdef.abcdefghijklmnopqrstuvwxyz0123456789';

if (decryptToken(encryptToken(token)) !== token) throw new Error('crypto round-trip gagal');
if (!maskToken(token).endsWith(token.slice(-4))) throw new Error('mask salah');
if (welcomeConfigSchema.parse({}).channelId !== '') throw new Error('default config salah');
if (!buildInviteUrl('123', ['moderation']).includes('permissions=')) throw new Error('invite url salah');
if (renderTemplate('Hi {user} @everyone', { user: '<@1>' }).includes('@everyone')) throw new Error('sanitasi mention gagal');
console.log('core self-check OK');
