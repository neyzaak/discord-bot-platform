'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '../../../../../lib/api';
import { Icon } from '../../../../../components/icons';
import { useI18n } from '../../../../../lib/i18n';

interface Guild { id: number; discordGuildId: string; name: string }
interface Hook { id: number; name: string; source: string; discordGuildId: string; channelId: string; tokenMasked: string }
interface Opt { id: string; name: string; type?: number }
interface BotMeta { name: string; avatarUrl: string | null; guilds: Guild[] }

const inputCls = 'w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm outline-none transition focus:border-indigo-400';
const labelCls = 'mb-1 block text-xs font-medium text-slate-400';
const cardCls = 'rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5';
const btnGhost = 'flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10';

export default function IntegrationsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const botId = Number(params.id);

  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [bot, setBot] = useState<BotMeta | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  // form
  const [name, setName] = useState('');
  const [guildId, setGuildId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [source, setSource] = useState<'github' | 'generic'>('github');
  const [channels, setChannels] = useState<Opt[]>([]);
  const [createdUrl, setCreatedUrl] = useState('');

  const notify = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(''), 4000); };
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) return router.replace('/login');
    setError(e instanceof Error ? e.message : t('common.error'));
  };

  const load = useCallback(async () => {
    try {
      const [b, w] = await Promise.all([
        api<{ bot: BotMeta }>(`/bots/${botId}`),
        api<{ webhooks: Hook[] }>(`/bots/${botId}/webhooks`),
      ]);
      setBot(b.bot);
      setHooks(w.webhooks);
    } catch (e) { fail(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, router]);

  useEffect(() => { void load(); }, [load]);

  const pickGuild = async (gid: string) => {
    setGuildId(gid); setChannelId(''); setChannels([]);
    if (!gid) return;
    try {
      const d = await api<{ channels: Opt[] }>(`/bots/${botId}/guilds/${gid}/channels`);
      setChannels(d.channels.filter((c) => c.type !== 4));
    } catch (e) { fail(e); }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setCreatedUrl('');
    try {
      const d = await api<{ webhook: { url: string } }>(`/bots/${botId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ name, discordGuildId: guildId, channelId, source }),
      });
      setCreatedUrl(d.webhook.url);
      setName(''); setChannelId('');
      await load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const regenerate = async (wid: number) => {
    try {
      const d = await api<{ url: string }>(`/bots/${botId}/webhooks/${wid}/regenerate`, { method: 'POST' });
      setCreatedUrl(d.url);
      notify(t('integrations.created'));
    } catch (e) { fail(e); }
  };

  const remove = async (wid: number) => {
    if (!confirm(t('detail.deleteConfirm'))) return;
    try {
      await api(`/bots/${botId}/webhooks/${wid}`, { method: 'DELETE' });
      await load();
    } catch (e) { fail(e); }
  };

  const guildName = (gid: string) => bot?.guilds.find((g) => g.discordGuildId === gid)?.name ?? gid;
  const guilds = bot?.guilds ?? [];

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {bot?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bot.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 font-bold text-white">
            {bot?.name[0]?.toUpperCase() ?? '•'}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{t('integrations.title')}</h1>
          <p className="truncate text-xs text-slate-500">{bot?.name ?? t('common.loading')}</p>
        </div>
        <Link href={`/dashboard/bots/${botId}`}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/10">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" /> {t('monitoring.back')}
        </Link>
      </div>
      {flash && <p className="text-sm text-emerald-400">{flash}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      <section className={cardCls}>
        <h2 className="mb-4 font-semibold">{t('integrations.create')}</h2>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{t('integrations.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={64} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('integrations.source')}</label>
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className={inputCls}>
              <option value="github">{t('integrations.source.github')}</option>
              <option value="generic">{t('integrations.source.generic')}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('integrations.guild')}</label>
            <select value={guildId} onChange={(e) => void pickGuild(e.target.value)} required className={inputCls}>
              <option value="">{t('common.select')}</option>
              {guilds.map((g) => <option key={g.id} value={g.discordGuildId}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('integrations.channel')}</label>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)} required disabled={!guildId} className={inputCls}>
              <option value="">{t('common.select')}</option>
              {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={busy || !guildId || !channelId}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50 sm:col-span-2">
            {busy ? t('common.saving') : t('integrations.create')}
          </button>
        </form>
        {createdUrl && (
          <div className="mt-4 rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-3">
            <p className="mb-1 text-xs text-emerald-400">{t('integrations.created')}</p>
            <code className="block break-all font-mono text-xs text-slate-300">{createdUrl}</code>
            <button onClick={() => { void navigator.clipboard.writeText(createdUrl); notify(t('common.copied')); }}
              className={`mt-2 ${btnGhost}`}>{t('common.copy')}</button>
          </div>
        )}
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-slate-600">
          {t('integrations.hint')}
        </p>
      </section>

      <section className={cardCls}>
        <h2 className="mb-4 font-semibold">{t('integrations.title')}</h2>
        {!hooks && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
        {hooks?.length === 0 && <p className="text-sm text-slate-500">{t('integrations.empty')}</p>}
        <div className="space-y-2">
          {hooks?.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {w.name}{' '}
                  <span className="ml-1 rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-400">{w.source}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{guildName(w.discordGuildId)} • <code>{w.tokenMasked}</code></p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => regenerate(w.id)} className={btnGhost}>{t('integrations.regenerate')}</button>
                <button onClick={() => remove(w.id)}
                  className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-500/20">{t('common.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
