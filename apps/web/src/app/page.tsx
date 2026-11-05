'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

export default function Home() {
  const router = useRouter();
  const { t } = useI18n();
  useEffect(() => {
    api('/auth/me').then(() => router.replace('/dashboard')).catch(() => router.replace('/login'));
  }, [router]);
  return <main className="flex min-h-screen items-center justify-center text-slate-400">{t('common.loading')}</main>;
}
