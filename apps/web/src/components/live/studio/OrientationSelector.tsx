import { useEffect, useState } from 'react';
import { useUiStore } from '../../../store/uiStore';
import type { LiveStudioFormat } from './liveStudioTypes';

type Props = {
  value: LiveStudioFormat;
  onChange: (value: LiveStudioFormat) => void;
  compact?: boolean;
};

const COMING_SOON = 'Futuras actualizaciones. Espéralo muy pronto.';

const OPTIONS: { id: LiveStudioFormat; label: string; hint: string }[] = [
  { id: '9:16', label: 'Vertical 9:16', hint: 'Móvil · cámara' },
  { id: '16:9', label: 'Horizontal 16:9', hint: 'Gaming · PC' },
];

export function OrientationSelector({ value, onChange, compact }: Props) {
  const selected = value === '16:9' ? '16:9' : '9:16';
  const setToast = useUiStore((state) => state.setToast);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 16:9 aún no disponible: no dejar preferencias guardadas en ese formato.
  useEffect(() => {
    if (value === '16:9') onChange('9:16');
  }, [value, onChange]);

  function pick(id: LiveStudioFormat) {
    if (id === '16:9') {
      setNotice(COMING_SOON);
      setToast(COMING_SOON, 'info');
      window.setTimeout(() => setToast(null), 4200);
      return;
    }
    setNotice(null);
    onChange(id);
  }

  return (
    <div className="lb-live-studio-orient">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Formato</p>
      <div className={compact ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-2'}>
        {OPTIONS.map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => pick(opt.id)}
              aria-disabled={opt.id === '16:9' ? true : undefined}
              className={`lb-live-orient-opt min-h-10 w-full rounded-xl px-3 py-2 text-left transition duration-200 ${
                active ? 'is-active' : ''
              }${opt.id === '16:9' ? ' opacity-90' : ''}`}
            >
              <span className="block text-xs font-bold">{opt.label}</span>
              {!compact ? (
                <span className="lb-live-orient-opt__hint block text-[10px]">{opt.hint}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {notice ? (
        <p
          className="mt-2 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-center text-xs font-semibold leading-snug text-amber-100"
          role="status"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}
