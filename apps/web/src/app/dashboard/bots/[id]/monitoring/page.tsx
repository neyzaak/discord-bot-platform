'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '../../../../../lib/api';
import { useI18n } from '../../../../../lib/i18n';

interface ErrRow { id: number; message: string; createdAt: string }
interface Stats { topCommands: Array<{ name: string; count: number }>; commands24h: number }

export default function MonitoringPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const botId = Number(params.id);

  const [errors, setErrors] = useState<ErrRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [e, s] = await Promise.all([
        api<{ errors: ErrRow[] }>(`/bots/${botId}/errors`),
        api<Stats>(`/bots/${botId}/stats`),
      ]);
      setErrors(e.errors);
      setStats(s);
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

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('monitoring.title')}</h1>
        <Link href={`/dashboard/bots/${botId}`} className="text-sm text-slate-400 hover:text-white">
          ← {t('monitoring.back')}
        </Link>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t('monitoring.topCommands')}</h2>
          <span className="rounded-full bg-indigo-950 px-3 py-1 text-xs text-indigo-300">
            {t('monitoring.commands24h')}: {stats?.commands24h ?? 0}
          </span>
        </div>
        {!stats || stats.topCommands.length === 0 ? (
          <p className="text-sm text-slate-500">{t('monitoring.noCommands')}</p>
        ) : (
          <div className="space-y-1.5">
            {stats.topCommands.map((c) => (
              <div key={c.name} className="flex items-center gap-3 text-sm">
                <code className="w-40 shrink-0 truncate text-indigo-300">/{c.name}</code>
                <div className="h-2 flex-1 rounded bg-slate-800">
                  <div className="h-2 rounded bg-indigo-500"
                    style={{ width: `${Math.round((c.count / stats.topCommands[0].count) * 100)}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right text-slate-400">{c.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-3 font-semibold">{t('monitoring.errors')}</h2>
        {!errors || errors.length === 0 ? (
          <p className="text-sm text-slate-500">{t('monitoring.noErrors')}</p>
        ) : (
          <div className="space-y-2">
            {errors.map((e) => (
              <div key={e.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <p className="text-xs text-slate-500">{new Date(e.createdAt).toLocaleString()}</p>
                <p className="break-all font-mono text-xs text-rose-300">{e.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
