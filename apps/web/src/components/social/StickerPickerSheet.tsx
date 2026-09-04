import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { COMPOSER_STICKERS } from '../../lib/composerStickers';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (sticker: (typeof COMPOSER_STICKERS)[number]) => void;
};

export function StickerPickerSheet({ open, onClose, onPick }: Props) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(78dvh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-fuchsia-400/35 bg-zinc-950 pb-[max(0.75rem,var(--lb-safe-bottom))] sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-sm font-bold text-fuchsia-200">Sticker</p>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
            aria-label="Cerrar stickers"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
            {COMPOSER_STICKERS.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                onClick={() => onPick(sticker)}
                className="grid min-h-14 place-items-center rounded-xl border border-fuchsia-400/20 bg-black/35 p-1.5"
                title={sticker.label}
              >
                {sticker.kind === 'text' ? (
                  <span className="text-[10px] font-black italic leading-tight text-fuchsia-300">
                    {sticker.text}
                  </span>
                ) : (
                  <img src={sticker.src} alt={sticker.label} className="h-10 w-10 object-contain" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
