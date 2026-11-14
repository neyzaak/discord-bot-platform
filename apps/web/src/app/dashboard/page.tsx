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
  avatarUrl: string | null; guildCount: number;
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
            className="group flex items-center gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 transition hover:-translate-y-0.5 hover:border-indigo-500/50 hover:bg-slate-900"
          >
            {b.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
            ) : (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-lg font-bold text-white">
                {b.name[0]?.toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold">{b.name}</p>
                <StatusBadge runtimeStatus={b.runtimeStatus} status={b.status} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-medium text-slate-300">{b.guildCount} server</span>
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-slate-400">prefix {b.prefix}</span>
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-slate-500">••••{b.tokenLast4}</span>
              </div>
            </div>
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-slate-400 transition group-hover:bg-indigo-500/20 group-hover:text-indigo-300">
              <Icon name="arrowRight" />
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
