import { Globe, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { LOCALE_META, useT } from '../../i18n';
import { useLocaleStore } from '../../store/localeStore';
import { LanguageSelector } from './LanguageSelector';

export function LanguageControl() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const [open, setOpen] = useState(false);
  const clusterRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const breakpoint = useBreakpoint();
  const sheet = breakpoint === 'phone';

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointer(event: MouseEvent | PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (clusterRef.current?.contains(target)) return;
      const panel = document.getElementById(panelId);
      if (panel?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open, panelId]);

  const label = t('language.openPicker');
  const meta = LOCALE_META[locale];

  return (
    <div ref={clusterRef} className="relative shrink-0">
      <button
        type="button"
        className="lb-theme-toggle"
        aria-label={label}
        title={`${label} · ${meta.nativeName}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe size={15} strokeWidth={2.1} />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <LanguagePopover
              id={panelId}
              sheet={sheet}
              anchor={clusterRef.current?.getBoundingClientRect() ?? null}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function LanguagePopover({
  id,
  sheet,
  anchor,
  onClose,
}: {
  id: string;
  sheet: boolean;
  anchor: DOMRect | null;
  onClose: () => void;
}) {
  const t = useT();
  const style =
    !sheet && anchor
      ? {
          top: Math.min(anchor.bottom + 10, window.innerHeight - 24),
          left: Math.max(8, Math.min(anchor.left - 80, window.innerWidth - 340)),
        }
      : undefined;

  return (
    <div className={sheet ? 'lb-appearance-sheet-root' : 'lb-appearance-pop-root'} role="presentation">
      {sheet ? (
        <button
          type="button"
          className="lb-appearance-sheet-backdrop"
          aria-label={t('language.close')}
          onClick={onClose}
        />
      ) : null}
      <div
        id={id}
        role="dialog"
        aria-label={t('language.title')}
        className={sheet ? 'lb-appearance-sheet' : 'lb-appearance-popover'}
        style={style}
      >
        <div className="lb-appearance-popover__head">
          <p>{t('language.title')}</p>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="lb-appearance-close">
            <X size={14} />
          </button>
        </div>
        <LanguageSelector compact onPicked={onClose} />
      </div>
    </div>
  );
}
