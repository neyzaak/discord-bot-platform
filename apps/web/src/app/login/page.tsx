'use client';

import { useI18n } from '../../lib/i18n';

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.37-.44.86-.6 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.61-1.25.07.07 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.02C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.07.07 0 0 0 .08-.03c.46-.63.87-1.3 1.22-2a.07.07 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.89.07.07 0 0 1-.01-.12c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.07.07 0 0 1-.01.12c-.6.35-1.22.64-1.87.88a.07.07 0 0 0-.04.1c.36.7.77 1.37 1.22 2a.07.07 0 0 0 .08.03 19.84 19.84 0 0 0 6.02-3.03.08.08 0 0 0 .03-.05c.5-5.09-.84-9.58-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
    </svg>
  );
}

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(99_102_241/0.18),transparent)]" />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-800/80 bg-slate-900/60 p-8 text-center backdrop-blur">
        <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/30">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
            <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
          </svg>
        </span>
        <h1 className="mb-2 text-2xl font-bold tracking-tight">{t('login.title')}</h1>
        <p className="mb-6 text-sm text-slate-400">{t('login.desc')}</p>
        <a
          href="/api/auth/login"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2.5 font-medium text-white transition hover:bg-[#4752c4]"
        >
          <DiscordIcon /> {t('login.button')}
        </a>
      </div>
    </main>
  );
}
