import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, X } from 'lucide-react';
import {
  COMPOSER_STICKERS,
  COMPOSER_STICKER_PACKS,
  type ComposerSticker,
  type ComposerStickerPack,
} from '../../lib/composerStickers';
import {
  CUSTOM_STICKER_MAX,
  cachedCustomStickers,
  deleteCustomSticker,
  listCustomStickers,
  saveCustomSticker,
  type CustomSticker,
} from '../../lib/customStickers';
import { useAuthStore } from '../../store/authStore';
import { StickerCreator } from './StickerCreator';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (sticker: ComposerSticker) => void;
};

export function StickerPickerSheet({ open, onClose, onPick }: Props) {
  const [pack, setPack] = useState<ComposerStickerPack>(COMPOSER_STICKER_PACKS[0]?.id ?? 'clasicos');
  const items = useMemo(() => COMPOSER_STICKERS.filter((sticker) => sticker.pack === pack), [pack]);
  const artPack = pack !== 'clasicos';
  const uid = useAuthStore((state) => state.profile?.firebaseUid ?? state.firebaseUser?.uid ?? null);
  const [mine, setMine] = useState<CustomSticker[]>(() => (uid ? cachedCustomStickers(uid) ?? [] : []));
  const [mineLoading, setMineLoading] = useState(false);
  const [mineError, setMineError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!open || pack !== 'mios' || !uid) return;
    let alive = true;
    const cached = cachedCustomStickers(uid);
    if (cached) setMine(cached);
    setMineLoading(!cached);
    setMineError(null);
    listCustomStickers(uid)
      .then((list) => {
        if (alive) setMine(list);
      })
      .catch(() => {
        if (alive && !cached) setMineError('No se pudieron cargar tus stickers.');
      })
      .finally(() => {
        if (alive) setMineLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, pack, uid]);

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setEditing(false);
    }
  }, [open]);

  async function saveSticker(blob: Blob) {
    if (!uid) throw new Error('Inicia sesión para guardar stickers.');
    const sticker = await saveCustomSticker(uid, blob);
    setMine((current) => [sticker, ...current.filter((item) => item.id !== sticker.id)]);
    setCreating(false);
  }

  async function removeSticker(sticker: CustomSticker) {
    if (!uid) return;
    setMine((current) => current.filter((item) => item.id !== sticker.id));
    try {
      await deleteCustomSticker(uid, sticker.storagePath);
    } catch {
      setMine((current) => [sticker, ...current]);
      setMineError('No se pudo borrar el sticker.');
    }
  }

  if (!open || typeof document === 'undefined') return null;

  const tabClass = (active: boolean) =>
    `min-h-11 shrink-0 rounded-full px-3.5 text-xs font-bold transition ${
      active
        ? 'bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-[0_0_14px_rgba(217,70,239,0.45)]'
        : 'bg-white/[0.06] text-zinc-300 hover:bg-white/10 hover:text-white'
    }`;

  return createPortal(
    <div
      className="lb-msg-overlay fixed inset-0 z-[120] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !creating) onClose();
      }}
    >
      <div className="flex max-h-[min(88dvh,46rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-fuchsia-400/35 bg-zinc-950 pb-[max(0.75rem,var(--lb-safe-bottom))] sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-sm font-bold text-fuchsia-200">{creating ? 'Crea tu sticker' : 'Sticker'}</p>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
            aria-label="Cerrar stickers"
          >
            <X size={16} />
          </button>
        </div>
        {!creating ? (
          <div
            className="flex shrink-0 gap-1.5 overflow-x-auto overscroll-x-contain border-b border-white/10 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Categorías de stickers"
          >
            <button
              type="button"
              role="tab"
              aria-selected={pack === 'mios'}
              onClick={() => setPack('mios')}
              className={`${tabClass(pack === 'mios')} inline-flex items-center gap-1`}
            >
              <Plus size={13} strokeWidth={2.6} />
              Mis stickers
            </button>
            {COMPOSER_STICKER_PACKS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === pack}
                onClick={() => {
                  setPack(tab.id);
                  setEditing(false);
                }}
                className={tabClass(tab.id === pack)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {creating ? (
            <StickerCreator onCancel={() => setCreating(false)} onSave={saveSticker} />
          ) : pack === 'mios' ? (
            !uid ? (
              <p className="px-2 py-8 text-center text-sm text-zinc-400">Inicia sesión para crear tus stickers.</p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-[11px] text-zinc-400">
                    {mine.length}/{CUSTOM_STICKER_MAX} · Sube fotos, quita el fondo y añade texto.
                  </p>
                  {mine.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setEditing((value) => !value)}
                      className="min-h-9 rounded-full px-3 text-[11px] font-bold text-fuchsia-300 hover:bg-white/5"
                    >
                      {editing ? 'Listo' : 'Editar'}
                    </button>
                  ) : null}
                </div>
                {mineError ? <p className="mb-2 px-1 text-xs text-rose-300">{mineError}</p> : null}
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setCreating(true);
                    }}
                    disabled={mine.length >= CUSTOM_STICKER_MAX}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-fuchsia-400/50 bg-fuchsia-500/[0.06] text-fuchsia-200 transition hover:bg-fuchsia-500/[0.12] disabled:opacity-40"
                  >
                    <Plus size={26} />
                    <span className="text-[11px] font-bold">Crear sticker</span>
                  </button>
                  {mineLoading ? (
                    <div className="grid aspect-square place-items-center text-zinc-500">
                      <Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : null}
                  {mine.map((sticker) => (
                    <div key={sticker.id} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (!editing) onPick(sticker);
                        }}
                        className="group relative block aspect-square w-full overflow-hidden rounded-2xl p-1 transition hover:scale-[1.04] hover:bg-white/[0.06] active:scale-95"
                        aria-label="Mi sticker"
                      >
                        <img
                          src={sticker.src}
                          alt="Mi sticker"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className="h-full w-full select-none object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
                        />
                      </button>
                      {editing ? (
                        <button
                          type="button"
                          onClick={() => void removeSticker(sticker)}
                          className="absolute right-0.5 top-0.5 grid h-8 w-8 place-items-center rounded-full bg-rose-500 text-white shadow"
                          aria-label="Borrar sticker"
                        >
                          <X size={14} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            )
          ) : (
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
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
