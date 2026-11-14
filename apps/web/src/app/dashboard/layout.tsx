'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

interface Me { discordId: string; username: string; avatar: string | null }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<{ user: Me }>('/auth/me').then((d) => setMe(d.user)).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(99_102_241/0.14),transparent)]" />
      <header className="sticky top-0 z-10 -mx-4 mb-8 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-4 py-3 backdrop-blur">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">{t('app.title')}</Link>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
            aria-label="Ganti bahasa"
            className="rounded-md border border-slate-700 px-2 py-1 text-xs font-medium uppercase text-slate-300 transition hover:border-slate-500"
          >
            {lang}
          </button>
          {me && (
            <span className="flex items-center gap-2">
              {me.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://cdn.discordapp.com/avatars/${me.discordId}/${me.avatar}.png?size=32`}
                  alt=""
                  className="h-7 w-7 rounded-full"
                />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-300">
                  {me.username[0]?.toUpperCase()}
                </span>
              )}
              <span className="hidden text-sm text-slate-300 sm:inline">{me.username}</span>
            </span>
          )}
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.replace('/login');
            }}
            className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:border-rose-500/60 hover:text-rose-300"
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
