'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '../../../../lib/api';
import { StatusBadge } from '../../../../components/status-badge';
import { GuildConfigPanel, type GuildConfigData, type Opt } from '../../../../components/guild-config';
import { Icon, type IconName } from '../../../../components/icons';
import { Toggle } from '../../../../components/toggle';
import { useI18n } from '../../../../lib/i18n';

interface Guild { id: number; discordGuildId: string; name: string }
interface BotDetail {
  id: number; name: string; prefix: string; status: 'running' | 'paused';
  runtimeStatus: 'online' | 'offline'; tokenMasked: string; applicationId: string;
  modules: string[]; inviteUrl: string; guilds: Guild[]; managers?: string[];
}

const MODULES: Array<{ key: string; icon: IconName }> = [
  { key: 'welcome', icon: 'mail' },
  { key: 'moderation', icon: 'shield' },
  { key: 'tickets', icon: 'ticket' },
  { key: 'logging', icon: 'scroll' },
  { key: 'utilities', icon: 'wrench' },
  { key: 'customcmd', icon: 'terminal' },
  { key: 'leveling', icon: 'trending' },
  { key: 'economy', icon: 'coins' },
  { key: 'webhooks', icon: 'webhook' },
  { key: 'quiz', icon: 'quiz' },
];
const cardCls = 'rounded-2xl border border-slate-800 bg-slate-900/60 p-5';
const btnGhost = 'flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm transition hover:border-slate-500 disabled:opacity-50';

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
  const [staffInput, setStaffInput] = useState('');

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

  const addStaff = async () => {
    const discordId = staffInput.trim();
    if (!discordId) return;
    setBusy(true); setError('');
    try {
      const d = await api<{ managers: string[] }>(`/bots/${botId}/managers`, { method: 'POST', body: JSON.stringify({ discordId }) });
      setBot((b) => (b ? { ...b, managers: d.managers } : b));
      setStaffInput('');
      notify(t('common.saved'));
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const removeStaff = async (discordId: string) => {
    setBusy(true); setError('');
    try {
      const d = await api<{ managers: string[] }>(`/bots/${botId}/managers/${discordId}`, { method: 'DELETE' });
      setBot((b) => (b ? { ...b, managers: d.managers } : b));
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  if (error && !bot) return <main><p className="text-sm text-rose-400">{error}</p></main>;
  if (!bot) {
    return (
      <main className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/40" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-800/60 bg-slate-900/40" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      {/* Hero bot */}
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/40 p-5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xl font-bold text-white">
          {bot.name[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{bot.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{t('bots.tokenLabel')}: <code>{bot.tokenMasked}</code></span>
            <span aria-hidden>•</span>
            <span>prefix <code className="text-slate-400">{bot.prefix}</code></span>
            <span aria-hidden>•</span>
            <StatusBadge runtimeStatus={bot.runtimeStatus} status={bot.status} />
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => patch({ status: bot.status === 'paused' ? 'running' : 'paused' })} disabled={busy}
            className={btnGhost}>
            <Icon name={bot.status === 'paused' ? 'play' : 'pause'} className="h-3.5 w-3.5" />
            {bot.status === 'paused' ? t('detail.resume') : t('detail.pause')}
          </button>
          <button onClick={remove}
            className="flex items-center gap-2 rounded-lg border border-rose-900 px-3 py-1.5 text-sm text-rose-400 transition hover:border-rose-500">
            <Icon name="trash" className="h-3.5 w-3.5" /> {t('common.delete')}
          </button>
        </div>
      </section>

      {flash && <p className="text-sm text-emerald-400">{flash}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {/* Undangan */}
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">{t('detail.inviteTitle')}</h2>
        <div className="flex gap-2">
          <input readOnly value={bot.inviteUrl} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300 outline-none" />
          <button onClick={() => { void navigator.clipboard.writeText(bot.inviteUrl); notify(t('common.copied')); }}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-400">
            <Icon name="copy" className="h-3.5 w-3.5" /> {t('common.copy')}
          </button>
        </div>
      </section>

      {/* Staf — hanya terlihat pemilik (API kirim managers hanya ke owner) */}
      {bot.managers && (
        <section className={cardCls}>
          <h2 className="mb-1 font-semibold">{t('detail.staffTitle')}</h2>
          <p className="mb-3 text-xs text-slate-500">{t('detail.staffHint')}</p>
          {bot.managers.length === 0 && <p className="mb-3 text-sm text-slate-400">{t('detail.staffEmpty')}</p>}
          {bot.managers.length > 0 && (
            <ul className="mb-3 space-y-2">
              {bot.managers.map((m) => (
                <li key={m} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                  <code className="font-mono text-xs text-slate-300">{m}</code>
                  <button onClick={() => removeStaff(m)} disabled={busy} aria-label={t('common.delete')}
                    className="text-slate-500 transition hover:text-rose-400 disabled:opacity-50">
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input value={staffInput} onChange={(e) => setStaffInput(e.target.value)} maxLength={20} placeholder="123456789012345678"
              className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm outline-none transition focus:border-indigo-400" />
            <button onClick={addStaff} disabled={busy || staffInput.trim() === ''}
              className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50">
              {t('detail.staffAdd')}
            </button>
          </div>
        </section>
      )}

      {/* Modul — kartu toggle ala MEE6/Carl-bot */}
      <section>
        <h2 className="mb-3 font-semibold">{t('detail.modulesTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.map(({ key, icon }) => {
            const on = bot.modules.includes(key);
            return (
              <div key={key}
                className={`flex items-center gap-3 rounded-xl border p-3.5 transition ${on ? 'border-indigo-500/40 bg-indigo-500/[0.06]' : 'border-slate-800 bg-slate-900/60'}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${on ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-500'}`}>
                  <Icon name={icon} />
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{t(`mod.${key}`)}</p>
                <Toggle checked={on} label={t(`mod.${key}`)}
                  onChange={(v) => patch({ modules: v ? [...bot.modules, key] : bot.modules.filter((x) => x !== key) })} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Server & config */}
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">{t('detail.guildsTitle')}</h2>
        {bot.guilds.length === 0 ? (
          <p className="text-sm text-slate-400">{t('detail.guildsEmpty')}</p>
        ) : (
          <>
            <div className="mb-4 max-w-md">
              <label className="mb-1 block text-sm text-slate-300" htmlFor="guild-select">{t('detail.selectGuild')}</label>
              <select id="guild-select" value={guildId} onChange={(e) => { setGuildId(e.target.value); void loadGuildData(e.target.value); }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none transition focus:border-indigo-400">
                <option value="">{t('common.select')}</option>
                {bot.guilds.map((g) => <option key={g.id} value={g.discordGuildId}>{g.name}</option>)}
              </select>
            </div>
            {guildId && cfg && (
              <>
                <GuildConfigPanel cfg={cfg} channels={channels} roles={roles} onChange={setCfg} />
                <button onClick={saveConfig} disabled={busy}
                  className="mt-5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50">
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
