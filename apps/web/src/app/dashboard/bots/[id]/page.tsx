'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '../../../../lib/api';
import { StatusBadge } from '../../../../components/status-badge';
import { GuildConfigPanel, type GuildConfigData, type Opt } from '../../../../components/guild-config';
import { useI18n } from '../../../../lib/i18n';

interface Guild { id: number; discordGuildId: string; name: string }
interface BotDetail {
  id: number; name: string; prefix: string; status: 'running' | 'paused';
  runtimeStatus: 'online' | 'offline'; tokenMasked: string; applicationId: string;
  modules: string[]; inviteUrl: string; guilds: Guild[];
}

const MODULE_KEYS = ['welcome', 'moderation', 'tickets', 'logging', 'utilities', 'customcmd', 'leveling', 'economy', 'webhooks', 'quiz'] as const;
const cardCls = 'rounded-2xl border border-slate-800 bg-slate-900 p-5';

export default function BotDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const botId = Number(params.id);

  const [bot, setBot] = useState<BotDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  const [guildId, setGuildId] = useState('');
  const [channels, setChannels] = useState<Opt[]>([]);
  const [roles, setRoles] = useState<Opt[]>([]);
  const [cfg, setCfg] = useState<GuildConfigData | null>(null);

  const notify = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(''), 2500); };
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) return router.replace('/login');
    setError(e instanceof Error ? e.message : t('common.error'));
  };

  const load = useCallback(async () => {
    try {
      const d = await api<{ bot: BotDetail }>(`/bots/${botId}`);
      setBot(d.bot);
    } catch (e) { fail(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, router]);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 15_000);
    return () => clearInterval(iv);
  }, [load]);

  const loadGuildData = useCallback(async (gid: string) => {
    setChannels([]); setRoles([]); setCfg(null);
    if (!gid) return;
    try {
      const [c, ch, rl] = await Promise.all([
        api<{ config: GuildConfigData }>(`/bots/${botId}/guilds/${gid}/config`),
        api<{ channels: Opt[] }>(`/bots/${botId}/guilds/${gid}/channels`),
        api<{ roles: Opt[] }>(`/bots/${botId}/guilds/${gid}/roles`),
      ]);
      setCfg(c.config);
      setChannels(ch.channels);
      setRoles(rl.roles);
    } catch (e) { fail(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, router]);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true); setError('');
    try {
      await api(`/bots/${botId}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(t('detail.deleteConfirm'))) return;
    try {
      await api(`/bots/${botId}`, { method: 'DELETE' });
      router.replace('/dashboard');
    } catch (e) { fail(e); }
  };

  const saveConfig = async () => {
    if (!guildId || !cfg) return;
    setBusy(true); setError('');
    try {
      await api(`/bots/${botId}/guilds/${guildId}/config`, { method: 'PUT', body: JSON.stringify(cfg) });
      notify(t('common.saved'));
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  if (error && !bot) return <main><p className="text-sm text-rose-400">{error}</p></main>;
  if (!bot) return <main><p className="text-slate-400">{t('common.loading')}</p></main>;

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{bot.name}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {t('bots.tokenLabel')}: <code>{bot.tokenMasked}</code> • prefix <code>{bot.prefix}</code> •{' '}
            <StatusBadge runtimeStatus={bot.runtimeStatus} status={bot.status} />
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/bots/${botId}/integrations`}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500">
            {t('integrations.title')} →
          </Link>
          <Link href={`/dashboard/bots/${botId}/monitoring`}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500">
            {t('monitoring.title')} →
          </Link>
          <button onClick={() => patch({ status: bot.status === 'paused' ? 'running' : 'paused' })} disabled={busy}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm transition hover:border-slate-500 disabled:opacity-50">
            {bot.status === 'paused' ? t('detail.resume') : t('detail.pause')}
          </button>
          <button onClick={remove} className="rounded-lg border border-rose-900 px-3 py-1.5 text-sm text-rose-400 hover:border-rose-500">
            {t('common.delete')}
          </button>
        </div>
      </div>

      {flash && <p className="text-sm text-emerald-400">{flash}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      <section className={cardCls}>
        <h2 className="mb-2 font-semibold">{t('detail.inviteTitle')}</h2>
        <div className="flex gap-2">
          <input readOnly value={bot.inviteUrl} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs" />
          <button onClick={() => { void navigator.clipboard.writeText(bot.inviteUrl); notify(t('common.copied')); }}
            className="shrink-0 rounded-lg bg-indigo-500 px-3 py-2 text-sm hover:bg-indigo-400">{t('common.copy')}</button>
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">{t('detail.modulesTitle')}</h2>
        <div className="flex flex-wrap gap-2">
          {MODULE_KEYS.map((m) => (
            <label key={m} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm transition hover:border-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={bot.modules.includes(m)}
                onChange={(e) => patch({ modules: e.target.checked ? [...bot.modules, m] : bot.modules.filter((x) => x !== m) })} />
              {t(`mod.${m}`)}
            </label>
          ))}
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">{t('detail.guildsTitle')}</h2>
        {bot.guilds.length === 0 ? (
          <p className="text-sm text-slate-400">{t('detail.guildsEmpty')}</p>
        ) : (
          <>
            <div className="mb-4 max-w-md">
              <p className="mb-1 block text-sm text-slate-300">{t('detail.selectGuild')}</p>
              <select value={guildId} onChange={(e) => { setGuildId(e.target.value); void loadGuildData(e.target.value); }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none transition focus:border-indigo-400">
                <option value="">{t('common.select')}</option>
                {bot.guilds.map((g) => <option key={g.id} value={g.discordGuildId}>{g.name}</option>)}
              </select>
            </div>
            {guildId && cfg && (
              <>
                <GuildConfigPanel cfg={cfg} channels={channels} roles={roles} onChange={setCfg} />
                <button onClick={saveConfig} disabled={busy}
                  className="mt-5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400 disabled:opacity-50">
                  {busy ? t('common.saving') : t('common.save')}
                </button>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
