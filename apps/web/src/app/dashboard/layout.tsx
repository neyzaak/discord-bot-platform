'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '../../lib/i18n';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/dashboard" className="text-lg font-bold">{t('app.title')}</Link>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
            className="rounded-md border border-slate-700 px-2 py-1 text-xs uppercase text-slate-300 hover:border-slate-500"
          >
            {lang}
          </button>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.replace('/login');
            }}
            className="text-sm text-slate-400 hover:text-white"
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
