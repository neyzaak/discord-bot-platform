'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n';

interface CreatedBot { id: number; name: string; tokenMasked: string; inviteUrl: string }

export default function NewBotPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('!');
  const [template, setTemplate] = useState<'welcome' | 'moderation' | 'starter'>('starter');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedBot | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api<{ bot: CreatedBot }>('/bots', {
        method: 'POST',
        body: JSON.stringify({ name, prefix, template, token }),
      });
      setCreated(d.bot);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace('/login');
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <main className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-emerald-800 bg-slate-900 p-6">
          <h1 className="mb-2 text-xl font-bold text-emerald-400">{t('bots.createdTitle')}</h1>
          <p className="mb-4 text-sm text-slate-400">{t('bots.createdDesc')}</p>
          <p className="mb-4 text-sm">
            {t('bots.tokenLabel')}: <code className="rounded bg-slate-800 px-2 py-0.5">{created.tokenMasked}</code>
          </p>
          <a href={created.inviteUrl} target="_blank" rel="noreferrer"
            className="mb-3 block w-full truncate rounded-lg bg-indigo-500 px-4 py-2.5 text-center text-sm font-medium hover:bg-indigo-400">
            {t('detail.inviteTitle')}
          </a>
          <Link href={`/dashboard/bots/${created.id}`} className="block text-center text-sm text-slate-400 hover:text-white">
            {created.name} →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold">{t('bots.create')}</h1>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div>
          <label className="mb-1 block text-sm text-slate-300">{t('bots.nameLabel')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">{t('bots.prefixLabel')}</label>
          <input value={prefix} onChange={(e) => setPrefix(e.target.value)} required maxLength={8}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">{t('bots.templateLabel')}</label>
          <select value={template} onChange={(e) => setTemplate(e.target.value as typeof template)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400">
            <option value="welcome">{t('bots.template.welcome')}</option>
            <option value="moderation">{t('bots.template.moderation')}</option>
            <option value="starter">{t('bots.template.starter')}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">{t('bots.tokenLabel')}</label>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} required autoComplete="off"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-400" />
          <p className="mt-1 text-xs text-slate-500">{t('bots.tokenHelp')}</p>
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium hover:bg-indigo-400 disabled:opacity-50">
          {busy ? t('common.saving') : t('bots.submit')}
        </button>
      </form>
    </main>
  );
}
