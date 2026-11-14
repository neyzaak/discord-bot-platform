'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n';

interface CreatedBot { id: number; name: string; tokenMasked: string; inviteUrl: string }

const inputCls = 'w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm outline-none transition focus:border-indigo-400';
const labelCls = 'mb-1 block text-xs font-medium text-slate-400';
const cardCls = 'rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5';

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
        <div className={`${cardCls} border-emerald-800/60`}>
          <h1 className="mb-2 text-xl font-bold text-emerald-400">{t('bots.createdTitle')}</h1>
          <p className="mb-4 text-sm text-slate-400">{t('bots.createdDesc')}</p>
          <p className="mb-4 text-sm">
            {t('bots.tokenLabel')}: <code className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs">{created.tokenMasked}</code>
          </p>
          <a href={created.inviteUrl} target="_blank" rel="noreferrer"
            className="mb-3 block w-full truncate rounded-lg bg-indigo-500 px-4 py-2.5 text-center text-sm font-medium text-white transition hover:bg-indigo-400">
            {t('detail.inviteTitle')}
          </a>
          <Link href={`/dashboard/bots/${created.id}`} className="block text-center text-sm text-slate-400 hover:text-white">
            {created.name} →
          </Link>
        </div>
      </main>
    );
  }

  const templates = ['welcome', 'moderation', 'starter'] as const;

  return (
    <main className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-bold tracking-tight">{t('bots.create')}</h1>
      <p className="mb-5 text-sm text-slate-500">{t('login.desc')}</p>
      <form onSubmit={submit} className={`space-y-4 ${cardCls}`}>
        <div>
          <label className={labelCls}>{t('bots.nameLabel')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} className={inputCls} />
        </div>
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <div>
            <label className={labelCls}>{t('bots.prefixLabel')}</label>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} required maxLength={8} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>{t('bots.tokenLabel')}</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} required autoComplete="off"
              className={`${inputCls} font-mono`} />
            <p className="mt-1 text-xs text-slate-500">{t('bots.tokenHelp')}</p>
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('bots.templateLabel')}</label>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('bots.templateLabel')}>
            {templates.map((tpl) => (
              <button key={tpl} type="button" role="radio" aria-checked={template === tpl} onClick={() => setTemplate(tpl)}
                className={`rounded-xl border px-2 py-2.5 text-center text-xs font-medium transition ${
                  template === tpl ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-300' : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700'}`}>
                {t(`bots.template.${tpl}`)}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50">
          {busy ? t('common.saving') : t('bots.submit')}
        </button>
      </form>
    </main>
  );
}
