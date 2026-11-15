'use client';

import { useEffect, useRef, useState } from 'react';

/** Dropdown custom tema gelap — pengganti <select> native (popup-nya ikut di-styling). */
export function Dropdown({ value, onChange, options, noneLabel, disabled }: {
  value: string; onChange: (v: string) => void; options: Array<{ id: string; name: string }>;
  noneLabel?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const all = noneLabel !== undefined ? [{ id: '', name: noneLabel }, ...options] : options;
  const current = all.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm outline-none transition focus:border-indigo-400 disabled:opacity-50">
        <span className={current ? '' : 'text-slate-500'}>{current?.name ?? noneLabel ?? '— pilih —'}</span>
        <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-950 py-1 shadow-xl shadow-black/40">
          {all.map((o) => (
            <li key={o.id || '_'} role="option" aria-selected={o.id === value}>
              <button type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                className={`block w-full px-3 py-1.5 text-left text-sm transition ${o.id === value ? 'bg-indigo-500/25 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
