'use client';

import { useI18n } from '../lib/i18n';

export function StatusBadge({ runtimeStatus, status }: { runtimeStatus: string; status: string }) {
  const { t } = useI18n();
  const label = status === 'paused' ? t('status.paused') : runtimeStatus === 'online' ? t('status.online') : t('status.offline');
  const color = status === 'paused' ? 'bg-amber-400' : runtimeStatus === 'online' ? 'bg-emerald-400' : 'bg-slate-500';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
