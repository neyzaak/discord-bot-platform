'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Icon, type IconName } from '../../components/icons';

interface Me { discordId: string; username: string; avatar: string | null }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<{ user: Me }>('/auth/me').then((d) => setMe(d.user)).catch(() => {});
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);

  // Konteks bot dari path: /dashboard/bots/:id/…
  const seg = pathname?.split('/') ?? [];
  const botId = seg[2] === 'bots' && seg[3] ? seg[3] : null;

  const mainNav: Array<{ href: string; icon: IconName; label: string }> = [
    { href: '/dashboard', icon: 'dashboard', label: t('bots.title') },
    { href: '/dashboard/bots/new', icon: 'plus', label: t('bots.create') },
  ];
  const botNav = botId
    ? [
        { href: `/dashboard/bots/${botId}`, icon: 'bot' as IconName, label: t('nav.overview') },
        { href: `/dashboard/bots/${botId}/integrations`, icon: 'plug' as IconName, label: t('integrations.title') },
        { href: `/dashboard/bots/${botId}/monitoring`, icon: 'activity' as IconName, label: t('monitoring.title') },
      ]
    : [];

  const active = (href: string) => pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
  const linkCls = (on: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${on ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}`;

  const sidebar = (
    <>
      <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1 text-base font-bold tracking-tight">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-white"><Icon name="bot" className="h-4.5 w-4.5" /></span>
        {t('app.title')}
      </Link>

      <nav className="mt-6 space-y-1">
        {mainNav.map((n) => (
          <Link key={n.href} href={n.href} className={linkCls(active(n.href))}>
            <Icon name={n.icon} /> {n.label}
          </Link>
        ))}
      </nav>

      {botNav.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">{t('detail.settingsTitle')}</p>
          <nav className="space-y-1">
            {botNav.map((n) => (
              <Link key={n.href} href={n.href} className={linkCls(active(n.href))}>
                <Icon name={n.icon} /> {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <div className="mt-auto space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
            aria-label="Ganti bahasa"
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1 text-xs font-medium uppercase text-slate-300 transition hover:bg-white/10"
          >
            <Icon name="globe" className="h-3.5 w-3.5" /> {lang}
          </button>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.replace('/login');
            }}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-300 transition hover:bg-rose-500/15 hover:text-rose-300"
          >
            <Icon name="logout" className="h-3.5 w-3.5" /> {t('nav.logout')}
          </button>
        </div>
        {me && (
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
            {me.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://cdn.discordapp.com/avatars/${me.discordId}/${me.avatar}.png?size=64`}
                alt=""
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-300">
                {me.username[0]?.toUpperCase()}
              </span>
            )}
            <span className="min-w-0 truncate text-sm text-slate-300">{me.username}</span>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {/* Bar atas mobile */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500 text-white"><Icon name="bot" className="h-4 w-4" /></span>
          {t('app.title')}
        </Link>
        <button onClick={() => setOpen(!open)} aria-label="Menu" className="rounded-md border border-slate-700 p-1.5 text-slate-300">
          <Icon name={open ? 'x' : 'menu'} />
        </button>
      </div>

      {open && <div aria-hidden className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-slate-950 p-4 transition-transform lg:static lg:z-auto lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebar}
      </aside>

      <div className="relative min-w-0">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(99_102_241/0.12),transparent)]" />
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </div>
    </div>
  );
}
