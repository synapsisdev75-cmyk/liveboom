import { Bomb, Smile, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BOOM_EMOJIS, LIVEBOOM_EMOJIS } from '../../lib/liveboomEmojis';

type Tab = 'classic' | 'boom';

type Props = {
  onPick: (id: string) => void;
  /** Posición del panel: sobre el botón (chat) o debajo */
  placement?: 'above' | 'below';
  className?: string;
};

function EmojiGrid({
  emojis,
  onPick,
  cols,
}: {
  emojis: typeof LIVEBOOM_EMOJIS;
  onPick: (id: string) => void;
  cols: string;
}) {
  return (
    <div
      className={`grid max-h-[min(15rem,42dvh)] ${cols} auto-rows-min justify-items-center gap-1.5 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:thin]`}
    >
      {emojis.map((emoji) => (
        <button
          key={emoji.id}
          type="button"
          title={emoji.label}
          onClick={() => onPick(emoji.id)}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900/40 p-1 transition hover:bg-white/10 active:scale-95"
        >
          <img
            src={emoji.file}
            alt={emoji.label}
            draggable={false}
            loading="lazy"
            decoding="async"
            width={32}
            height={32}
            className="size-8 shrink-0 object-contain object-center"
          />
        </button>
      ))}
    </div>
  );
}

export function EmojiPickerButton({ onPick, placement = 'above', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('classic');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(id: string) {
    onPick(id);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
          open ? 'bg-white/10 text-amber-300' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
        }`}
        aria-label="Emoticones"
        aria-expanded={open}
      >
        <Smile size={20} />
      </button>

      {open ? (
        <div
          className={`absolute z-50 w-[min(17.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/98 p-2.5 shadow-2xl backdrop-blur-md ${
            placement === 'above' ? 'bottom-full right-0 mb-2' : 'top-full right-0 mt-2'
          }`}
        >
          <div className="mb-2 flex items-center justify-between px-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Emoticones</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-0.5 text-zinc-500 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-zinc-900/60 p-0.5">
            <button
              type="button"
              onClick={() => setTab('classic')}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition ${
                tab === 'classic' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Smile size={12} /> Caritas
            </button>
            <button
              type="button"
              onClick={() => setTab('boom')}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition ${
                tab === 'boom' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Bomb size={12} /> Boom
            </button>
          </div>

          {tab === 'classic' ? (
            <EmojiGrid emojis={LIVEBOOM_EMOJIS} onPick={pick} cols="grid-cols-5" />
          ) : (
            <EmojiGrid emojis={BOOM_EMOJIS} onPick={pick} cols="grid-cols-4" />
          )}
        </div>
      ) : null}
    </div>
  );
}
