'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '../../../../../lib/api';
import { Icon } from '../../../../../components/icons';
import { useI18n } from '../../../../../lib/i18n';

interface ErrRow { id: number; message: string; createdAt: string }
interface Stats { topCommands: Array<{ name: string; count: number }>; commands24h: number }
interface BotMeta { name: string; avatarUrl: string | null }

const cardCls = 'rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5';

export default function MonitoringPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const botId = Number(params.id);

  const [errors, setErrors] = useState<ErrRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [bot, setBot] = useState<BotMeta | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [e, s, b] = await Promise.all([
        api<{ errors: ErrRow[] }>(`/bots/${botId}/errors`),
        api<Stats>(`/bots/${botId}/stats`),
        api<{ bot: BotMeta }>(`/bots/${botId}`),
      ]);
      setErrors(e.errors);
      setStats(s);
      setBot(b.bot);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return router.replace('/login');
      setError(e instanceof Error ? e.message : t('common.error'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, router]);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const max = stats?.topCommands[0]?.count ?? 0;

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
          <h1 className="truncate text-xl font-bold tracking-tight">{t('monitoring.title')}</h1>
          <p className="truncate text-xs text-slate-500">{bot?.name ?? t('common.loading')}</p>
        </div>
        <Link href={`/dashboard/bots/${botId}`}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/10">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" /> {t('monitoring.back')}
        </Link>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cardCls}>
          <p className="text-xs text-slate-500">{t('monitoring.commands24h')}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{stats?.commands24h ?? 0}</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-slate-500">{t('monitoring.commands30d')}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
            {stats?.topCommands.reduce((sum, c) => sum + c.count, 0) ?? 0}
          </p>
        </div>
      </div>

      <section className={cardCls}>
        <h2 className="mb-4 font-semibold">{t('monitoring.topCommands')}</h2>
        {!stats || stats.topCommands.length === 0 ? (
          <p className="text-sm text-slate-500">{t('monitoring.noCommands')}</p>
        ) : (
          <div className="space-y-2">
            {stats.topCommands.map((c, i) => (
              <div key={c.name} className="flex items-center gap-3 text-sm">
                <code className="w-40 shrink-0 truncate text-slate-300">
                  <span className="mr-1.5 text-slate-600">{i + 1}</span>/{c.name}
                </code>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500"
                    style={{ width: `${max ? Math.max(4, Math.round((c.count / max) * 100)) : 0}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right tabular-nums text-slate-400">{c.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={cardCls}>
        <h2 className="mb-4 font-semibold">{t('monitoring.errors')}</h2>
        {!errors || errors.length === 0 ? (
          <p className="text-sm text-slate-500">{t('monitoring.noErrors')}</p>
        ) : (
          <div className="space-y-2">
            {errors.map((e) => (
              <div key={e.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="mb-1 text-[11px] text-slate-500">{new Date(e.createdAt).toLocaleString()}</p>
                <p className="break-all font-mono text-xs text-rose-300">{e.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
