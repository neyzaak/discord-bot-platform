'use client';

import { useI18n } from '../../lib/i18n';

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="mb-2 text-2xl font-bold">{t('login.title')}</h1>
        <p className="mb-6 text-sm text-slate-400">{t('login.desc')}</p>
        <a
          href="/api/auth/login"
          className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-500 px-4 py-2.5 font-medium text-white hover:bg-indigo-400"
        >
          {t('login.button')}
        </a>
      </div>
    </main>
  );
}
