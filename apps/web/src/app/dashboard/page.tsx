'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '../../lib/api';
import { StatusBadge } from '../../components/status-badge';
import { Icon } from '../../components/icons';
import { useI18n } from '../../lib/i18n';

interface BotListItem {
  id: number; name: string; prefix: string; status: string;
  runtimeStatus: 'online' | 'offline'; tokenLast4: string;
}

export default function BotsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [bots, setBots] = useState<BotListItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ bots: BotListItem[] }>('/bots')
      .then((d) => setBots(d.bots))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) return router.replace('/login');
        setError(e instanceof Error ? e.message : t('common.error'));
      });
  }, [router, t]);

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('bots.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{bots?.length ?? 0} bot</p>
        </div>
        <Link href="/dashboard/bots/new" className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400">
          <Icon name="plus" /> {t('bots.create')}
        </Link>
      </div>
      {error && <p className="mb-4 text-sm text-rose-400">{error}</p>}
      {!bots && !error && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/40" />
          ))}
        </div>
      )}
      {bots?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500/15 text-indigo-300">
            <Icon name="bot" className="h-6 w-6" />
          </span>
          <p className="text-slate-400">{t('bots.empty')}</p>
          <Link href="/dashboard/bots/new" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400">
            <Icon name="plus" /> {t('bots.create')}
          </Link>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {bots?.map((b) => (
          <Link
            key={b.id}
            href={`/dashboard/bots/${b.id}`}
            className="group flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-indigo-500/50 hover:bg-slate-900"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-lg font-bold text-white">
              {b.name[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{b.name}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {t('bots.tokenLabel')}: ••••{b.tokenLast4} • prefix <code className="text-slate-400">{b.prefix}</code>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge runtimeStatus={b.runtimeStatus} status={b.status} />
              <Icon name="arrowRight" className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
