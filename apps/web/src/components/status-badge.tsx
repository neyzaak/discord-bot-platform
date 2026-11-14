'use client';

import { useI18n } from '../lib/i18n';

export function StatusBadge({ runtimeStatus, status }: { runtimeStatus: string; status: string }) {
  const { t } = useI18n();
  const online = status !== 'paused' && runtimeStatus === 'online';
  const label = status === 'paused' ? t('status.paused') : online ? t('status.online') : t('status.offline');
  const dot = status === 'paused' ? 'bg-amber-400' : online ? 'bg-emerald-400' : 'bg-slate-500';
  const text = status === 'paused' ? 'text-amber-300' : online ? 'text-emerald-300' : 'text-slate-400';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${text}`}>
      <span className="relative flex h-2 w-2">
        {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
}
