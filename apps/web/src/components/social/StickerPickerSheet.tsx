import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  COMPOSER_STICKERS,
  COMPOSER_STICKER_PACKS,
  type ComposerSticker,
  type ComposerStickerPack,
} from '../../lib/composerStickers';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (sticker: ComposerSticker) => void;
};

export function StickerPickerSheet({ open, onClose, onPick }: Props) {
  const [pack, setPack] = useState<ComposerStickerPack>(COMPOSER_STICKER_PACKS[0]?.id ?? 'clasicos');
  const items = useMemo(() => COMPOSER_STICKERS.filter((sticker) => sticker.pack === pack), [pack]);
  const artPack = pack !== 'clasicos';

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="lb-msg-overlay fixed inset-0 z-[120] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(84dvh,42rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-fuchsia-400/35 bg-zinc-950 pb-[max(0.75rem,var(--lb-safe-bottom))] sm:rounded-3xl">
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
        <div
          className="flex shrink-0 gap-1.5 overflow-x-auto overscroll-x-contain border-b border-white/10 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Categorías de stickers"
        >
          {COMPOSER_STICKER_PACKS.map((tab) => {
            const active = tab.id === pack;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPack(tab.id)}
                className={`min-h-11 shrink-0 rounded-full px-3.5 text-xs font-bold transition ${
                  active
                    ? 'bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-[0_0_14px_rgba(217,70,239,0.45)]'
                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <div
            key={pack}
            className={
              artPack
                ? 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3'
                : 'grid grid-cols-5 gap-2 sm:grid-cols-6'
            }
          >
            {items.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                onClick={() => onPick(sticker)}
                className={
                  artPack
                    ? 'group relative aspect-square overflow-hidden rounded-2xl p-1 transition hover:scale-[1.04] hover:bg-white/[0.06] active:scale-95'
                    : 'grid min-h-14 place-items-center rounded-xl border border-fuchsia-400/20 bg-black/35 p-1.5'
                }
                title={sticker.label}
                aria-label={sticker.label}
              >
                {sticker.kind === 'text' ? (
                  <span className="text-[10px] font-black italic leading-tight text-fuchsia-300">
                    {sticker.text}
                  </span>
                ) : (
                  <img
                    src={sticker.src}
                    alt={sticker.label}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className={
                      artPack
                        ? 'h-full w-full select-none object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]'
                        : 'h-12 w-12 object-contain sm:h-14 sm:w-14'
                    }
                  />
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
