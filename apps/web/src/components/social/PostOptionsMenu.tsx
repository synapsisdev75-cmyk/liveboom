import { Flag, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n';
import { useBackLayer } from '../../lib/backLayer';
import { InAppFeedbackModal } from '../legal/InAppFeedbackModal';

type Props = {
  /** `rail` = botón circular sobre el video. `header` = tres puntos de la publicación. */
  variant?: 'header' | 'rail';
};

/**
 * Menú de la publicación (tres puntos). La denuncia que pide Google Play
 * vive aquí, sin salir de la app.
 */
export function PostOptionsMenu({ variant = 'header' }: Props) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useBackLayer(menuOpen, () => setMenuOpen(false));

  function openReport() {
    setMenuOpen(false);
    setReportOpen(true);
  }

  const trigger =
    variant === 'rail' ? (
      <button
        type="button"
        aria-label={t('actions.moreOptions')}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen(true);
        }}
        className={`lb-action-rail__btn grid place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm ${
          menuOpen ? 'bg-white text-zinc-950' : ''
        }`}
      >
        <MoreHorizontal className="lb-action-rail__icon" size={20} />
      </button>
    ) : (
      <button
        type="button"
        aria-label={t('actions.moreOptions')}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen(true);
        }}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-200 hover:bg-white/10"
      >
        <MoreHorizontal size={22} />
      </button>
    );

  return (
    <>
      {variant === 'rail' ? (
        <div className="relative flex flex-col items-center gap-[var(--lb-action-gap,0.2rem)]">
          {trigger}
          <span className="lb-action-rail__label min-h-[14px] font-bold text-white drop-shadow">
            {t('actions.more')}
          </span>
        </div>
      ) : (
        trigger
      )}

      {menuOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55"
              role="presentation"
              onClick={() => setMenuOpen(false)}
            >
              <div
                role="menu"
                aria-label={t('actions.moreOptions')}
                className="w-full max-w-lg rounded-t-3xl bg-zinc-950 px-3 pt-3 shadow-2xl ring-1 ring-white/10"
                style={{ paddingBottom: 'max(0.85rem, var(--lb-safe-bottom))' }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold text-white hover:bg-white/10"
                  onClick={openReport}
                >
                  <Flag size={18} className="text-amber-300" aria-hidden />
                  {t('actions.reportPost')}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      <InAppFeedbackModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  );
}
