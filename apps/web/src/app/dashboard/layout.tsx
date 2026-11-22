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

  // Konteks bot dari path: /dashboard/bots/:id/… (id harus angka — /bots/new bukan konteks bot)
  const seg = pathname?.split('/') ?? [];
  const botId = seg[2] === 'bots' && seg[3] && /^\d+$/.test(seg[3]) ? seg[3] : null;

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

  // Item nav aktif = href paling spesifik (terpanjang) yang cocok dengan path saat ini.
  const allNav = [...mainNav, ...botNav];
  const best = allNav
    .filter((n) => pathname === n.href || pathname?.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const active = (href: string) => best?.href === href;
  const pill = (on: boolean) =>
    `flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${on ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`;

  const avatar = me ? (
    me.avatar ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://cdn.discordapp.com/avatars/${me.discordId}/${me.avatar}.png?size=64`}
        alt=""
        className="h-7 w-7 rounded-full"
      />
    ) : (
      <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-300">
        {me.username[0]?.toUpperCase()}
      </span>
    )
  ) : (
    <span className="h-7 w-7 animate-pulse rounded-full bg-slate-800" />
  );

  return (
    <div className="min-h-screen">
      {/* Header ala top.gg: logo + nav horizontal + aksi user */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2 text-base font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-white"><Icon name="bot" className="h-4.5 w-4.5" /></span>
            <span className="hidden sm:inline">{t('app.title')}</span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label={t('bots.title')}>
            {mainNav.map((n) => (
              <Link key={n.href} href={n.href} className={pill(active(n.href))}>
                <Icon name={n.icon} className="h-3.5 w-3.5" /> {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
              aria-label="Ganti bahasa"
              className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1.5 text-xs font-medium uppercase text-slate-300 transition hover:bg-white/10"
            >
              <Icon name="globe" className="h-3.5 w-3.5" /> {lang}
            </button>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                router.replace('/login');
              }}
              aria-label={t('nav.logout')}
              className="hidden rounded-full bg-white/5 p-2 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300 md:block"
            >
              <Icon name="logout" className="h-3.5 w-3.5" />
            </button>
            <span className="ml-0.5 flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 py-1 pl-1 pr-2.5">
              {avatar}
              <span className="hidden max-w-32 truncate text-sm text-slate-300 sm:inline">{me?.username ?? ''}</span>
            </span>
            <button onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}
              className="rounded-lg border border-slate-700 p-1.5 text-slate-300 md:hidden">
              <Icon name={open ? 'x' : 'menu'} />
            </button>
          </div>
        </div>

        {/* Baris tab konteks bot — tampil hanya saat membuka bot */}
        {botNav.length > 0 && (
          <div className="border-t border-slate-800/60">
            <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6" role="tablist">
              {botNav.map((n) => (
                <Link key={n.href} href={n.href} role="tab" aria-current={active(n.href) ? 'page' : undefined}
                  className={pill(active(n.href))}>
                  <Icon name={n.icon} className="h-3.5 w-3.5" /> {n.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Panel menu mobile */}
        {open && (
          <div className="border-t border-slate-800 bg-slate-950 px-4 py-3 md:hidden">
            <nav className="space-y-1">
              {[...mainNav, ...botNav].map((n) => (
                <Link key={n.href} href={n.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active(n.href) ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                  <Icon name={n.icon} /> {n.label}
                </Link>
              ))}
            </nav>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                router.replace('/login');
              }}
              className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
            >
              <Icon name="logout" /> {t('nav.logout')}
            </button>
          </div>
        )}
      </header>

      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(99_102_241/0.12),transparent)]" />
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </div>
    </div>
  );
}
