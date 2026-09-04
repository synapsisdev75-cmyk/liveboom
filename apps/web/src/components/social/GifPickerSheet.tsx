import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { searchComposerGifs, type ComposerGif } from '../../lib/composerGifs';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (gif: ComposerGif) => void;
};

export function GifPickerSheet({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ComposerGif[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    void searchComposerGifs(query)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(78dvh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-violet-400/30 bg-zinc-950 pb-[max(0.75rem,var(--lb-safe-bottom))] sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-sm font-bold text-violet-200">GIF</p>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
            aria-label="Cerrar GIF"
          >
            <X size={16} />
          </button>
        </div>
        <label className="mx-4 mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-violet-400/30 bg-black/40 px-3">
          <Search size={16} className="shrink-0 text-violet-300" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar GIF…"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </label>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
          {busy && items.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">Buscando…</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => onPick(gif)}
                  className="overflow-hidden rounded-xl border border-violet-400/20 bg-black/40"
                >
                  <img src={gif.preview || gif.url} alt={gif.title} className="aspect-square h-full w-full object-cover" />
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
