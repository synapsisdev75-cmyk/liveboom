import { Bomb, Search, Smile } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOOM_EMOJIS, LIVEBOOM_EMOJIS, type LiveboomEmoji } from '../../lib/liveboomEmojis';
import {
  filterUnicodeEmojis,
  UNICODE_EMOJI_CATEGORIES,
  type UnicodeEmoji,
} from '../../lib/unicodeEmojis';
import { flagIconSrc, resolveFlagIcon } from '../../lib/circleFlags';

type PickerPlace = 'above' | 'below' | 'left' | 'right';

const PICKER_GAP = 10;
const PICKER_PAD = 8;
const PICKER_Z = 125;
const PICKER_CHROME_PX = 128;

function cssPx(value: string) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function readViewportBox() {
  const vv = window.visualViewport;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  const offsetLeft = vv?.offsetLeft ?? 0;
  const offsetTop = vv?.offsetTop ?? 0;
  const root = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const safeL = root ? cssPx(root.getPropertyValue('--lb-safe-left')) : 0;
  const safeR = root ? cssPx(root.getPropertyValue('--lb-safe-right')) : 0;
  const safeT = root ? cssPx(root.getPropertyValue('--lb-safe-top')) : 0;
  const safeB = root ? cssPx(root.getPropertyValue('--lb-safe-bottom')) : 0;
  return {
    left: offsetLeft + Math.max(PICKER_PAD, safeL),
    top: offsetTop + Math.max(PICKER_PAD, safeT),
    right: offsetLeft + width - Math.max(PICKER_PAD, safeR),
    bottom: offsetTop + height - Math.max(PICKER_PAD, safeB),
  };
}

function fitPickerToViewport(
  trigger: DOMRect,
  panelW: number,
  panelH: number,
  prefer: 'above' | 'below',
) {
  const view = readViewportBox();
  const availW = Math.max(168, view.right - view.left);
  const w = Math.min(panelW || 328, availW);
  const h = Math.max(panelH || 260, 160);
  const spaceAbove = trigger.top - view.top - PICKER_GAP;
  const spaceBelow = view.bottom - trigger.bottom - PICKER_GAP;
  const spaceLeft = trigger.left - view.left - PICKER_GAP;
  const spaceRight = view.right - trigger.right - PICKER_GAP;

  let place: PickerPlace;
  if (prefer === 'above') {
    if (spaceAbove >= h) place = 'above';
    else if (spaceBelow >= h) place = 'below';
    else if (spaceRight >= w && spaceRight >= spaceLeft) place = 'right';
    else if (spaceLeft >= w) place = 'left';
    else place = spaceBelow >= spaceAbove ? 'below' : 'above';
  } else if (spaceBelow >= h) place = 'below';
  else if (spaceAbove >= h) place = 'above';
  else if (spaceRight >= w && spaceRight >= spaceLeft) place = 'right';
  else if (spaceLeft >= w) place = 'left';
  else place = spaceBelow >= spaceAbove ? 'below' : 'above';

  const verticalSpace = place === 'above' ? spaceAbove : place === 'below' ? spaceBelow : view.bottom - view.top;
  const maxHeight = Math.min(h, Math.max(160, verticalSpace));
  let left = 0;
  let top = 0;

  if (place === 'above' || place === 'below') {
    left = trigger.left;
    if (left + w > view.right) left = view.right - w;
    if (left < view.left) left = view.left;
    top = place === 'above' ? trigger.top - PICKER_GAP - maxHeight : trigger.bottom + PICKER_GAP;
    if (top < view.top) top = view.top;
    if (top + maxHeight > view.bottom) top = Math.max(view.top, view.bottom - maxHeight);
  } else {
    top = trigger.top + trigger.height / 2 - maxHeight / 2;
    top = Math.min(Math.max(top, view.top), view.bottom - maxHeight);
    left = place === 'right' ? trigger.right + PICKER_GAP : trigger.left - PICKER_GAP - w;
    if (left + w > view.right) left = view.right - w;
    if (left < view.left) left = view.left;
  }

  const caret =
    place === 'above' || place === 'below'
      ? trigger.left + trigger.width / 2 - left
      : trigger.top + trigger.height / 2 - top;

  return {
    left: Math.round(left),
    top: Math.round(top),
    place,
    caret: Math.round(caret),
    maxHeight: Math.round(maxHeight),
    width: Math.round(w),
  };
}

type Tab = 'classic' | 'boom' | string;

type Props = {
  onPick: (id: string) => void;
  /** Preferencia inicial; el panel se voltea si no cabe en el viewport. */
  placement?: 'above' | 'below';
  className?: string;
  /** Packs unicode. Default true: mismo catálogo en todos los módulos. */
  showUnicode?: boolean;
};

function filterLiveboom(list: readonly LiveboomEmoji[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (emoji) => emoji.label.toLowerCase().includes(q) || emoji.id.toLowerCase().includes(q),
  );
}

function LiveboomGrid({
  emojis,
  onPick,
  cols,
}: {
  emojis: readonly LiveboomEmoji[];
  onPick: (id: string) => void;
  cols: string;
}) {
  if (emojis.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-[11px] text-zinc-500">No hay coincidencias.</p>
    );
  }
  return (
    <div
      className={`grid ${cols} auto-rows-min justify-items-center gap-0.5 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:thin]`}
      style={{ maxHeight: 'min(13.5rem, 38dvh, var(--lb-emoji-grid-max, 38dvh))' }}
    >
      {emojis.map((emoji) => (
        <button
          key={emoji.id}
          type="button"
          title={emoji.label}
          onClick={() => onPick(emoji.id)}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10 active:scale-95"
        >
          <img
            src={emoji.file}
            alt={emoji.label}
            draggable={false}
            loading="lazy"
            decoding="async"
            width={28}
            height={28}
            className="size-7 shrink-0 object-contain object-center"
          />
        </button>
      ))}
    </div>
  );
}

function UnicodeGrid({
  emojis,
  onPick,
}: {
  emojis: readonly UnicodeEmoji[];
  onPick: (char: string) => void;
}) {
  if (emojis.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-[11px] text-zinc-500">No hay coincidencias.</p>
    );
  }
  return (
    <div
      className="grid grid-cols-8 auto-rows-min justify-items-center gap-0.5 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:thin]"
      style={{ maxHeight: 'min(13.5rem, 38dvh, var(--lb-emoji-grid-max, 38dvh))' }}
    >
      {emojis.map((emoji) => {
        const flag = resolveFlagIcon(emoji.char);
        return (
          <button
            key={`${emoji.char}-${emoji.label}`}
            type="button"
            title={emoji.label}
            onClick={() => onPick(emoji.char)}
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10 active:scale-95 ${
              flag ? '' : 'lb-unicode-emoji text-[1.35rem] leading-none'
            }`}
          >
            {flag ? (
              <img
                src={flag.file}
                alt={emoji.label}
                draggable={false}
                loading="lazy"
                decoding="async"
                className="lb-flag-icon lb-flag-icon--picker"
              />
            ) : (
              emoji.char
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Selector de emoticones LiveBoom + unicode en publicaciones.
 * Panel tipo Facebook: anclado al botón, búsqueda arriba, categorías abajo.
 */
export function EmojiPickerButton({
  onPick,
  placement = 'above',
  className = '',
  showUnicode = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('classic');
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{
    left: number;
    top: number;
    place: PickerPlace;
    caret: number;
    maxHeight: number;
    width: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const trigger = buttonRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const prevMax = panel.style.maxHeight;
    panel.style.maxHeight = 'none';
    const naturalW = panel.offsetWidth;
    const naturalH = panel.offsetHeight;
    panel.style.maxHeight = prevMax;
    const next = fitPickerToViewport(
      trigger.getBoundingClientRect(),
      naturalW,
      naturalH,
      placement,
    );
    setCoords((prev) => {
      if (
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.place === next.place &&
        prev.maxHeight === next.maxHeight &&
        prev.width === next.width &&
        prev.caret === next.caret
      ) {
        return prev;
      }
      return next;
    });
  }, [placement]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: Event) {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!showUnicode && tab !== 'classic' && tab !== 'boom') setTab('classic');
  }, [showUnicode, tab]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
    const panel = panelRef.current;
    const ro = panel && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updatePosition()) : null;
    if (panel && ro) ro.observe(panel);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [open, tab, query, updatePosition]);

  const unicodeCategory = UNICODE_EMOJI_CATEGORIES.find((item) => item.id === tab);
  const liveboomShown = useMemo(() => {
    if (tab === 'classic') return filterLiveboom(LIVEBOOM_EMOJIS, query);
    if (tab === 'boom') return filterLiveboom(BOOM_EMOJIS, query);
    return [];
  }, [tab, query]);
  const unicodeShown = useMemo(() => {
    if (!unicodeCategory) return [];
    if (query.trim()) {
      return UNICODE_EMOJI_CATEGORIES.flatMap((category) =>
        filterUnicodeEmojis(category.emojis, query),
      );
    }
    return filterUnicodeEmojis(unicodeCategory.emojis, query);
  }, [unicodeCategory, query]);

  function pick(id: string) {
    onPick(id);
    if (!showUnicode) setOpen(false);
  }

  const heading =
    query.trim() && unicodeCategory
      ? 'Resultados'
      : unicodeCategory
        ? unicodeCategory.label
        : tab === 'classic'
          ? 'Caritas LiveBoom'
          : 'Boom';

  const place = coords?.place ?? (placement === 'below' ? 'below' : 'above');
  const caretPx = coords?.caret ?? 20;
  const gridMax = Math.max(72, (coords?.maxHeight ?? 280) - PICKER_CHROME_PX);

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            className="w-[min(20.5rem,calc(100vw-1.25rem))] overflow-visible rounded-2xl border border-white/12 bg-zinc-900 p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
            style={{
              position: 'fixed',
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              zIndex: PICKER_Z,
              width: coords?.width,
              maxHeight: coords?.maxHeight,
              visibility: coords ? 'visible' : 'hidden',
              pointerEvents: coords ? 'auto' : 'none',
              ['--lb-emoji-grid-max' as string]: `${gridMax}px`,
            }}
            role="dialog"
            aria-label="Selector de emojis"
            onMouseDown={(event) => event.preventDefault()}
          >
            <label className="relative mb-2 block">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
                placeholder="Buscar emoji"
                autoComplete="off"
                className="h-9 w-full rounded-lg border-0 bg-zinc-800/90 py-2 pl-8 pr-2.5 text-xs text-white outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-cyan-400/40"
              />
            </label>

            <p className="mb-1.5 px-0.5 text-[11px] font-semibold text-zinc-400">{heading}</p>

            {tab === 'classic' || tab === 'boom' ? (
              <LiveboomGrid
                emojis={liveboomShown}
                onPick={pick}
                cols={tab === 'classic' ? 'grid-cols-8' : 'grid-cols-6'}
              />
            ) : (
              <UnicodeGrid emojis={unicodeShown} onPick={pick} />
            )}

            <div
              className="mt-2 flex items-center gap-0.5 overflow-x-auto overflow-y-hidden border-t border-white/10 pt-1.5 [scrollbar-width:thin]"
              role="tablist"
              aria-label="Categorías"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'classic'}
                onClick={() => setTab('classic')}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${
                  tab === 'classic' ? 'text-cyan-300 ring-1 ring-cyan-400/50' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                aria-label="Caritas LiveBoom"
                title="Caritas LiveBoom"
              >
                <Smile size={18} />
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'boom'}
                onClick={() => setTab('boom')}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${
                  tab === 'boom' ? 'text-fuchsia-300 ring-1 ring-fuchsia-400/50' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                aria-label="Boom"
                title="Boom"
              >
                <Bomb size={18} />
              </button>
              {showUnicode
                ? UNICODE_EMOJI_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === category.id}
                      onClick={() => setTab(category.id)}
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base leading-none transition ${
                        tab === category.id
                          ? 'bg-white/10 ring-1 ring-cyan-400/50'
                          : 'opacity-70 hover:opacity-100'
                      } ${category.id === 'flags' ? '' : 'lb-unicode-emoji'}`}
                      aria-label={category.label}
                      title={category.label}
                    >
                      {category.id === 'flags' ? (
                        <img
                          src={flagIconSrc('mx')}
                          alt=""
                          draggable={false}
                          className="lb-flag-icon lb-flag-icon--tab"
                        />
                      ) : (
                        category.icon
                      )}
                    </button>
                  ))
                : null}
            </div>

            <span
              className={`pointer-events-none absolute h-0 w-0 ${
                place === 'above'
                  ? 'top-full border-x-[7px] border-x-transparent border-t-[8px] border-t-zinc-900'
                  : place === 'below'
                    ? 'bottom-full border-x-[7px] border-x-transparent border-b-[8px] border-b-zinc-900'
                    : place === 'left'
                      ? 'left-full border-y-[7px] border-y-transparent border-l-[8px] border-l-zinc-900'
                      : 'right-full border-y-[7px] border-y-transparent border-r-[8px] border-r-zinc-900'
              }`}
              style={
                place === 'above' || place === 'below'
                  ? { left: Math.min(Math.max(caretPx - 7, 12), (coords?.width ?? 280) - 26) }
                  : { top: Math.min(Math.max(caretPx - 7, 12), (coords?.maxHeight ?? 260) - 26) }
              }
              aria-hidden
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseDown={(event) => event.preventDefault()}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
          open ? 'bg-white/10 text-amber-300' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
        }`}
        aria-label="Emoticones"
        aria-expanded={open}
      >
        <Smile size={20} />
      </button>
      {panel}
    </div>
  );
}
