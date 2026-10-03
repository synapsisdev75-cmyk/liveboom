import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import {
  emojiTokenCovering,
  emojiTokenEndingAt,
  emojiTokenStartingAt,
  graphemeEndingAt,
  graphemeStartingAt,
  insertEmojiTokenAt,
  snapCaretOutOfEmojiToken,
} from '../../lib/liveboomEmojis';
import { searchMentionUsers } from '../../lib/mentionUsers';
import type { PublicFsUser } from '../../lib/profileFirestore';
import { mentionQueryAt } from '../../lib/textEntities';
import { UserAvatar } from '../profile/UserAvatar';
import { EmojiText } from './EmojiText';
import { StyledText } from './StyledText';
import type { PostTextStyle, TextStyleRange } from '../../lib/postTextStyle';

type BaseProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  emojiSize?: number;
  className?: string;
  fieldClassName?: string;
  mirrorTextClassName?: string;
  placeholderClassName?: string;
  /** Padding interno del espejo y del campo */
  padClassName?: string;
  /**
   * Publicación: el cuadro crece hasta un máximo y luego hace scroll interno.
   * Default false = comportamiento anterior (comentarios, Boom Clip, Flash Boom).
   */
  growToMaxScroll?: boolean;
  /**
   * Autoaltura. `comment` = barra de comentarios.
   * `message` = composer de Mensajes (1 línea → tope visual → scroll interno).
   * Si no se pasa, `growToMaxScroll` sigue mapeando a `publication`.
   */
  growMode?: 'none' | 'publication' | 'comment' | 'message';
  /** Enter envía (Shift+Enter = salto de línea en multiline). */
  onEnterSubmit?: () => void;
  /** Fragmentos con estilo propio ("Aa" sobre una selección) dibujados en el espejo. */
  mirrorTextStyle?: PostTextStyle | null;
  mirrorTextStyleRanges?: TextStyleRange[] | null;
};

type InputProps = BaseProps &
  Omit<ComponentPropsWithoutRef<'input'>, 'value' | 'onChange' | 'className'> & {
    multiline?: false;
  };

type TextareaProps = BaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className'> & {
    multiline: true;
    rows?: number;
  };

export type EmojiInputHandle = {
  focus: () => void;
  /** Inserta un emoji (LiveBoom o Unicode) en el cursor, sin borrar el texto. */
  insertToken: (id: string) => void;
  /** Inserta texto libre (p. ej. sticker de texto) en el cursor. */
  insertText?: (text: string) => void;
  /** Selección actual del campo (se conserva aunque haya perdido el foco). */
  getSelection: () => { start: number; end: number };
};

// La selección nativa se dibuja con la geometría del campo oculto (shortcodes largos);
// la visible se pinta sobre el espejo (.lb-emoji-selection).
const inputInner =
  'lb-emoji-field relative z-[1] w-full min-w-0 border-0 bg-transparent text-sm text-transparent outline-none [-webkit-text-fill-color:transparent] selection:bg-transparent selection:text-transparent disabled:opacity-60';

type FieldBox = { left: number; top: number; width: number; height: number };

type MirrorPiece =
  | { kind: 'text'; node: Text; start: number; len: number }
  | { kind: 'img'; node: HTMLImageElement; start: number; len: number };

function rawLenOf(img: HTMLImageElement) {
  return Number(img.dataset.rawLen || (img.dataset.emojiId ? `:${img.dataset.emojiId}:`.length : 1));
}

/** Trozos visibles del espejo con su posición en el texto crudo (un emoji vale su shortcode). */
function mirrorPieces(mirrorRoot: HTMLElement): MirrorPiece[] {
  const span = mirrorRoot.firstElementChild;
  if (!span || span.tagName !== 'SPAN') return [];
  const out: MirrorPiece[] = [];
  let acc = 0;
  const walk = (parent: Node) => {
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent?.length ?? 0;
        out.push({ kind: 'text', node: node as Text, start: acc, len });
        acc += len;
      } else if (node instanceof HTMLImageElement) {
        const len = rawLenOf(node);
        out.push({ kind: 'img', node, start: acc, len });
        acc += len;
      } else if (node instanceof HTMLElement) {
        walk(node);
      }
    });
  };
  walk(span);
  return out;
}

/** Índice del texto crudo más cercano a un punto de pantalla, medido sobre lo que se ve (espejo). */
function caretIndexFromPoint(mirrorRoot: HTMLElement, x: number, y: number): number | null {
  const pieces = mirrorPieces(mirrorRoot);
  if (pieces.length === 0) return null;
  let best: number | null = null;
  let bestDy = Infinity;
  let bestDx = Infinity;
  const consider = (index: number, cx: number, rect: DOMRect) => {
    if (rect.height <= 0) return;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const dx = Math.abs(x - cx);
    if (dy < bestDy - 0.5 || (Math.abs(dy - bestDy) <= 0.5 && dx < bestDx)) {
      best = index;
      bestDy = dy;
      bestDx = dx;
    }
  };
  const range = document.createRange();
  for (const piece of pieces) {
    if (piece.kind === 'img') {
      const rect = piece.node.getBoundingClientRect();
      consider(piece.start, rect.left, rect);
      consider(piece.start + piece.len, rect.right, rect);
      continue;
    }
    const text = piece.node.data;
    for (let i = 0; i < piece.len; ) {
      const code = text.charCodeAt(i);
      const step = code >= 0xd800 && code <= 0xdbff && i + 1 < piece.len ? 2 : 1;
      range.setStart(piece.node, i);
      range.setEnd(piece.node, i + step);
      const rects = range.getClientRects();
      const rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
      consider(piece.start + i, rect.left, rect);
      if (text[i] !== '\n') consider(piece.start + i + step, rect.right, rect);
      i += step;
    }
  }
  return best;
}

/** Rectángulos visibles (sobre el espejo) del rango [start, end) del texto crudo. */
function mirrorSelectionBoxes(
  mirrorRoot: HTMLElement,
  start: number,
  end: number,
  host: HTMLElement,
): FieldBox[] {
  const hostRect = host.getBoundingClientRect();
  const out: FieldBox[] = [];
  const push = (rect: DOMRect) => {
    if (rect.width < 0.5 || rect.height <= 0) return;
    out.push({
      left: rect.left - hostRect.left,
      top: rect.top - hostRect.top,
      width: rect.width,
      height: rect.height,
    });
  };
  const range = document.createRange();
  for (const piece of mirrorPieces(mirrorRoot)) {
    const from = Math.max(start, piece.start);
    const to = Math.min(end, piece.start + piece.len);
    if (from >= to) continue;
    if (piece.kind === 'img') {
      push(piece.node.getBoundingClientRect());
      continue;
    }
    range.setStart(piece.node, from - piece.start);
    range.setEnd(piece.node, to - piece.start);
    Array.from(range.getClientRects()).forEach(push);
  }
  return out;
}

function publicationComposerMaxPx() {
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  const shortPhone = landscape && viewH < 560;
  if (shortPhone) return Math.min(viewH * 0.34, 10 * 16);
  return Math.min(viewH * 0.38, 18 * 16);
}

function publicationComposerMinPx(lineHeight: number) {
  // Una sola línea de escritura; el padding del textarea entra en scrollHeight.
  return lineHeight;
}

function commentComposerMaxPx() {
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  return Math.min(viewH * 0.2, 5.5 * 16);
}

function commentComposerMinPx() {
  return 2 * 16;
}

/** Chat: crece hasta 2 líneas; desde la 3.ª hace scroll invisible. */
function messageComposerMaxPx(lineHeight: number) {
  const pad = 4;
  return Math.round(Math.max(lineHeight, lineHeight * 2 + pad));
}

function visualCaretBox(
  mirrorRoot: HTMLElement,
  raw: string,
  caret: number,
  host: HTMLElement,
): { left: number; top: number; height: number } | null {
  const hostRect = host.getBoundingClientRect();
  const span = mirrorRoot.firstElementChild as HTMLElement | null;
  if (!raw || !span || span.tagName !== 'SPAN') return null;

  const toBox = (rect: DOMRect, atRight = false) => ({
    left: (atRight ? rect.right : rect.left) - hostRect.left + host.scrollLeft,
    top: rect.top - hostRect.top + host.scrollTop,
    height: Math.max(rect.height, 16),
  });

  const acc = { pos: 0 };

  function walk(nodes: NodeListOf<ChildNode>): { left: number; top: number; height: number } | null {
    for (const node of nodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        const len = text.length;
        if (caret <= acc.pos + len) {
          const offset = Math.max(0, Math.min(len, caret - acc.pos));
          const range = document.createRange();
          // Al final de un nodo, medir el borde derecho del último glifo (evita hueco en wrap).
          if (offset > 0 && offset === len) {
            range.setStart(node, offset - 1);
            range.setEnd(node, offset);
            const rect = range.getBoundingClientRect();
            if (rect.height > 0) return toBox(rect, true);
          }
          range.setStart(node, offset);
          range.collapse(true);
          const rects = range.getClientRects();
          const rect = rects[0] ?? range.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0 && offset === 0 && node.parentElement) {
            return toBox(node.parentElement.getBoundingClientRect());
          }
          return toBox(rect);
        }
        acc.pos += len;
      } else if (node instanceof HTMLImageElement) {
        const len = Number(
          node.dataset.rawLen || (node.dataset.emojiId ? `:${node.dataset.emojiId}:`.length : 1),
        );
        const imgRect = node.getBoundingClientRect();
        if (caret <= acc.pos) return toBox(imgRect);
        if (caret <= acc.pos + len) {
          return {
            left: imgRect.right - hostRect.left + host.scrollLeft,
            top: imgRect.top - hostRect.top + host.scrollTop,
            height: Math.max(imgRect.height, 16),
          };
        }
        acc.pos += len;
      } else if (node instanceof HTMLElement) {
        const found = walk(node.childNodes);
        if (found) return found;
      }
    }
    return null;
  }

  const found = walk(span.childNodes);
  if (found) return found;
  if (caret >= raw.length) {
    const rects = span.getClientRects();
    const last = rects[rects.length - 1] ?? span.getBoundingClientRect();
    return toBox(last, true);
  }
  return null;
}

/** Input/textarea con espejo: muestra iconos en lugar de :shortcode: mientras escribes. */
export const EmojiInput = forwardRef<EmojiInputHandle, InputProps | TextareaProps>(
  function EmojiInput(props, ref) {
    const {
      value,
      onChange,
      placeholder = '',
      disabled,
      maxLength,
      emojiSize = 20,
      className = '',
      fieldClassName = '',
      mirrorTextClassName = 'text-white',
      placeholderClassName = 'text-zinc-500',
      padClassName = 'px-3 py-2',
      growToMaxScroll = false,
      growMode,
      onEnterSubmit,
      multiline,
      mirrorTextStyle,
      mirrorTextStyleRanges,
      ...rest
    } = props;

    const resolvedGrow = growMode ?? (growToMaxScroll ? 'publication' : 'none');

    const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const mirrorRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const pendingCaret = useRef<number | null>(null);
    const savedCaret = useRef<{ start: number; end: number } | null>(null);
    const [focused, setFocused] = useState(false);
    const [caretBox, setCaretBox] = useState<{ left: number; top: number; height: number } | null>(
      null,
    );
    const [selectionBoxes, setSelectionBoxes] = useState<FieldBox[]>([]);
    const pointerDownAt = useRef<{ x: number; y: number; touch: boolean } | null>(null);
    const userScrollAt = useRef(0);
    const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null);
    const [mentionHits, setMentionHits] = useState<PublicFsUser[]>([]);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionBox, setMentionBox] = useState<{ top: number; left: number; width: number } | null>(
      null,
    );

    const lineHeightPx =
      resolvedGrow === 'message'
        ? Math.max(emojiSize + 2, 24)
        : resolvedGrow === 'comment'
          ? // Interlineado denso (ref. imagen): ~1.3–1.35 sobre text-sm, sin solapar.
            Math.max(Math.min(emojiSize, 18) + 3, 20)
          : Math.max(emojiSize + 8, 28);

    function insertionRange() {
      const field = fieldRef.current;
      const focusedField = Boolean(field && document.activeElement === field);
      const start = focusedField
        ? field!.selectionStart ?? value.length
        : (savedCaret.current?.start ?? value.length);
      const end = focusedField ? field!.selectionEnd ?? start : (savedCaret.current?.end ?? start);
      return { start: Math.min(start, end, value.length), end: Math.min(Math.max(start, end), value.length) };
    }

    function insertAt(next: string, caret: number) {
      if (maxLength != null && next.length > maxLength) return;
      pendingCaret.current = caret;
      savedCaret.current = { start: caret, end: caret };
      onChange(next);
    }

    useImperativeHandle(ref, () => ({
      focus: () => fieldRef.current?.focus(),
      insertToken: (id: string) => {
        const { start, end } = insertionRange();
        const { next, caret } = insertEmojiTokenAt(value, id, start, end);
        insertAt(next, caret);
      },
      insertText: (text: string) => {
        if (!text) return;
        const { start, end } = insertionRange();
        const before = value.slice(0, start);
        const after = value.slice(end);
        const lead = before && !/\s$/.test(before) ? ' ' : '';
        const trail = after && !/^\s/.test(after) ? ' ' : '';
        const piece = `${lead}${text}${trail}`;
        insertAt(`${before}${piece}${after}`, before.length + lead.length + text.length);
      },
      getSelection: () => {
        const field = fieldRef.current;
        const start = field?.selectionStart ?? savedCaret.current?.start ?? value.length;
        const end = field?.selectionEnd ?? savedCaret.current?.end ?? start;
        return { start: Math.min(start, end), end: Math.max(start, end) };
      },
    }));

    const clearSelectionBoxes = useCallback(() => {
      setSelectionBoxes((prev) => (prev.length === 0 ? prev : []));
    }, []);

    /** `follow`: desplazar el espejo para que el cursor quede a la vista. */
    const refreshCaret = useCallback(
      (follow = false) => {
        const field = fieldRef.current;
        const mirror = mirrorRef.current;
        const host = hostRef.current;
        if (!field || !mirror || !host || document.activeElement !== field) {
          setCaretBox(null);
          clearSelectionBoxes();
          return;
        }
        const start = field.selectionStart ?? 0;
        const end = field.selectionEnd ?? 0;
        if (start !== end) {
          setCaretBox(null);
          setSelectionBoxes(
            value ? mirrorSelectionBoxes(mirror, Math.min(start, end), Math.max(start, end), host) : [],
          );
          return;
        }
        clearSelectionBoxes();
        if (!value) {
          const hostRect = host.getBoundingClientRect();
          const ph = mirror.firstElementChild?.getBoundingClientRect();
          if (ph && ph.height > 0) {
            setCaretBox({ left: ph.left - hostRect.left, top: ph.top - hostRect.top, height: ph.height });
            return;
          }
          const cs = getComputedStyle(mirror);
          const padL = Number.parseFloat(cs.paddingLeft) || 0;
          const padT = Number.parseFloat(cs.paddingTop) || 0;
          const padB = Number.parseFloat(cs.paddingBottom) || 0;
          const inner = Math.max(0, mirror.clientHeight - padT - padB);
          setCaretBox({
            left: padL,
            top: multiline ? padT : padT + Math.max(0, (inner - lineHeightPx) / 2),
            height: lineHeightPx,
          });
          return;
        }
        let box = visualCaretBox(mirror, value, start, host);
        if (box && follow) {
          const cs = getComputedStyle(mirror);
          if (multiline) {
            if (mirror.scrollHeight - mirror.clientHeight > 1) {
              const topLimit = Number.parseFloat(cs.paddingTop) || 0;
              const bottomLimit = mirror.clientHeight - (Number.parseFloat(cs.paddingBottom) || 0);
              const delta =
                box.top < topLimit
                  ? box.top - topLimit
                  : box.top + box.height > bottomLimit
                    ? box.top + box.height - bottomLimit
                    : 0;
              if (delta) {
                mirror.scrollTop += delta;
                box = visualCaretBox(mirror, value, start, host);
              }
            }
          } else {
            const leftLimit = Number.parseFloat(cs.paddingLeft) || 0;
            const rightLimit = mirror.clientWidth - (Number.parseFloat(cs.paddingRight) || 0) - 2;
            const delta =
              box.left > rightLimit
                ? box.left - rightLimit
                : box.left < leftLimit && mirror.scrollLeft > 0
                  ? box.left - leftLimit
                  : 0;
            if (delta) {
              mirror.scrollLeft += delta;
              box = visualCaretBox(mirror, value, start, host);
            }
          }
        }
        setCaretBox(box);
      },
      [value, lineHeightPx, multiline, clearSelectionBoxes],
    );

    useLayoutEffect(() => {
      const field = fieldRef.current;
      if (pendingCaret.current != null && field) {
        const pos = pendingCaret.current;
        pendingCaret.current = null;
        field.setSelectionRange(pos, pos);
      }
      refreshCaret(true);
    }, [value, refreshCaret, focused]);

    useLayoutEffect(() => {
      if (resolvedGrow === 'none' || !multiline) return;
      const field = fieldRef.current;
      if (!field || !(field instanceof HTMLTextAreaElement)) return;

      const applySize = () => {
        const cap =
          resolvedGrow === 'message'
            ? messageComposerMaxPx(lineHeightPx)
            : resolvedGrow === 'comment'
              ? commentComposerMaxPx()
              : publicationComposerMaxPx();
        const minH =
          resolvedGrow === 'message'
            ? lineHeightPx
            : resolvedGrow === 'comment'
              ? commentComposerMinPx()
              : publicationComposerMinPx(lineHeightPx);
        field.style.height = 'auto';
        const mirror = mirrorRef.current;
        // La altura sale del espejo (lo que se ve): en el campo oculto cada emoji ocupa
        // su shortcode completo y forzaría líneas de más.
        // Si el texto visible cabe en una fila, la altura es la del campo en `auto` (una fila);
        // si no, la del contenido real del espejo.
        const contentH =
          value && mirror
            ? mirror.scrollHeight > mirror.clientHeight + 1
              ? mirror.scrollHeight
              : field.offsetHeight
            : field.scrollHeight;
        const next = Math.min(Math.max(contentH, minH), cap);
        field.style.height = `${next}px`;
        field.style.maxHeight = `${cap}px`;
        field.style.overflowY = contentH > cap + 1 ? 'auto' : 'hidden';
        field.style.overflowX = 'hidden';
        const atEnd = field.selectionStart >= value.length;
        if (atEnd) {
          field.scrollTop = field.scrollHeight;
          if (mirror) mirror.scrollTop = mirror.scrollHeight;
        }
        refreshCaret(true);
      };

      applySize();
      const onResize = () => applySize();
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
      window.visualViewport?.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
        window.visualViewport?.removeEventListener('resize', onResize);
      };
    }, [value, resolvedGrow, multiline, refreshCaret, lineHeightPx]);

    useEffect(() => {
      if (!focused) return;
      const field = fieldRef.current;
      const caret = field?.selectionStart ?? savedCaret.current?.start ?? value.length;
      const next = mentionQueryAt(value, caret);
      setMentionQuery(next);
      if (!next) {
        setMentionHits([]);
        setMentionIndex(0);
      }
    }, [value, focused]);

    useEffect(() => {
      if (!focused || !mentionQuery || mentionQuery.query.length < 1) {
        if (!mentionQuery?.query) setMentionHits([]);
        return;
      }
      let cancelled = false;
      const timer = window.setTimeout(() => {
        void searchMentionUsers(mentionQuery.query).then((list) => {
          if (cancelled) return;
          setMentionHits(list);
          setMentionIndex(0);
        });
      }, 120);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }, [focused, mentionQuery]);

    useLayoutEffect(() => {
      if (!focused || !mentionQuery || mentionHits.length === 0 || !hostRef.current) {
        setMentionBox(null);
        return;
      }
      const rect = hostRef.current.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 220), 320);
      const estimated = Math.min(mentionHits.length, 6) * 48 + 10;
      const below = rect.bottom + 6;
      const top =
        below + estimated > window.innerHeight - 12
          ? Math.max(12, rect.top - estimated - 6)
          : below;
      const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
      setMentionBox({ top, left, width });
    }, [focused, mentionQuery, mentionHits.length, value]);

    function applyMention(user: PublicFsUser) {
      if (!mentionQuery) return;
      const handle = user.username.replace(/^@/, '');
      const insertion = `@${handle} `;
      const replaceEnd = mentionQuery.start + 1 + mentionQuery.query.length;
      const next = `${value.slice(0, mentionQuery.start)}${insertion}${value.slice(replaceEnd)}`;
      const caret = mentionQuery.start + insertion.length;
      if (maxLength != null && next.length > maxLength) return;
      setMentionHits([]);
      setMentionQuery(null);
      commit(next, caret);
      window.setTimeout(() => fieldRef.current?.focus(), 0);
    }

    function commit(next: string, caret: number) {
      pendingCaret.current = caret;
      onChange(next);
    }

    function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
      if (mentionHits.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setMentionIndex((index) => (index + 1) % mentionHits.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setMentionIndex((index) => (index - 1 + mentionHits.length) % mentionHits.length);
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          const picked = mentionHits[mentionIndex];
          if (picked) {
            event.preventDefault();
            applyMention(picked);
            return;
          }
        }
        if (event.key === 'Tab') {
          const picked = mentionHits[mentionIndex];
          if (picked) {
            event.preventDefault();
            applyMention(picked);
            return;
          }
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setMentionHits([]);
          setMentionQuery(null);
          return;
        }
      }

      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing &&
        onEnterSubmit
      ) {
        event.preventDefault();
        onEnterSubmit();
        return;
      }

      const field = event.currentTarget;
      const start = field.selectionStart ?? 0;
      const end = field.selectionEnd ?? 0;

      if (event.key === 'ArrowLeft' && start === end && !event.altKey && !event.metaKey && !event.ctrlKey) {
        const token = emojiTokenEndingAt(value, start) ?? emojiTokenCovering(value, start);
        if (token) {
          event.preventDefault();
          const next = token.start;
          field.setSelectionRange(next, next);
          refreshCaret(true);
          return;
        }
        const grapheme = graphemeEndingAt(value, start);
        if (grapheme && grapheme.end - grapheme.start > 1) {
          event.preventDefault();
          field.setSelectionRange(grapheme.start, grapheme.start);
          refreshCaret(true);
        }
        return;
      }

      if (event.key === 'ArrowRight' && start === end && !event.altKey && !event.metaKey && !event.ctrlKey) {
        const token = emojiTokenStartingAt(value, start) ?? emojiTokenCovering(value, start);
        if (token) {
          event.preventDefault();
          const next = token.end;
          field.setSelectionRange(next, next);
          refreshCaret(true);
          return;
        }
        const grapheme = graphemeStartingAt(value, start);
        if (grapheme && grapheme.end - grapheme.start > 1) {
          event.preventDefault();
          field.setSelectionRange(grapheme.end, grapheme.end);
          refreshCaret(true);
        }
        return;
      }

      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      if (event.altKey || event.metaKey || event.ctrlKey) return;

      if (start !== end) {
        const coverStart = emojiTokenCovering(value, start);
        const coverEnd = emojiTokenCovering(value, end);
        const from = coverStart ? coverStart.start : start;
        const to = coverEnd ? coverEnd.end : end;
        if (from !== start || to !== end) {
          event.preventDefault();
          commit(value.slice(0, from) + value.slice(to), from);
        }
        return;
      }

      if (event.key === 'Backspace') {
        const token = emojiTokenEndingAt(value, start) ?? emojiTokenCovering(value, Math.max(0, start - 1));
        if (token && start > token.start) {
          event.preventDefault();
          commit(value.slice(0, token.start) + value.slice(token.end), token.start);
          return;
        }
        const grapheme = graphemeEndingAt(value, start);
        if (grapheme && grapheme.end - grapheme.start > 1) {
          event.preventDefault();
          commit(value.slice(0, grapheme.start) + value.slice(grapheme.end), grapheme.start);
        }
        return;
      }

      const token = emojiTokenStartingAt(value, start) ?? emojiTokenCovering(value, start);
      if (token && start < token.end) {
        event.preventDefault();
        commit(value.slice(0, token.start) + value.slice(token.end), token.start);
        return;
      }
      const grapheme = graphemeStartingAt(value, start);
      if (grapheme && grapheme.end - grapheme.start > 1) {
        event.preventDefault();
        commit(value.slice(0, grapheme.start) + value.slice(grapheme.end), grapheme.start);
      }
    }

    function snapSelection() {
      const field = fieldRef.current;
      if (!field) return;
      const start = field.selectionStart ?? 0;
      const end = field.selectionEnd ?? 0;
      savedCaret.current = { start, end };
      if (focused) setMentionQuery(mentionQueryAt(value, start));
      if (start !== end) {
        refreshCaret(true);
        return;
      }
      const snapped = snapCaretOutOfEmojiToken(value, start, true);
      if (snapped !== start) field.setSelectionRange(snapped, snapped);
      refreshCaret(true);
    }

    function onFieldPointerDown(event: ReactPointerEvent<HTMLInputElement | HTMLTextAreaElement>) {
      pointerDownAt.current = {
        x: event.clientX,
        y: event.clientY,
        touch: event.pointerType !== 'mouse',
      };
      if (event.pointerType !== 'mouse') userScrollAt.current = Date.now();
    }

    /**
     * El navegador ubica el cursor según el campo oculto, donde cada emoji mide lo que su
     * shortcode; aquí se recalcula sobre el espejo para que caiga justo donde se tocó.
     */
    function onFieldClick(event: ReactMouseEvent<HTMLInputElement | HTMLTextAreaElement>) {
      const field = fieldRef.current;
      const mirror = mirrorRef.current;
      const down = pointerDownAt.current;
      pointerDownAt.current = null;
      const fromPointer = event.clientX !== 0 || event.clientY !== 0;
      if (field && mirror && value && fromPointer) {
        const start = field.selectionStart ?? 0;
        const end = field.selectionEnd ?? 0;
        if (start === end) {
          const index = caretIndexFromPoint(mirror, event.clientX, event.clientY);
          if (index != null && index !== start) field.setSelectionRange(index, index);
        } else if (
          down &&
          !down.touch &&
          event.detail <= 1 &&
          Math.hypot(event.clientX - down.x, event.clientY - down.y) > 3
        ) {
          const from = caretIndexFromPoint(mirror, down.x, down.y);
          const to = caretIndexFromPoint(mirror, event.clientX, event.clientY);
          if (from != null && to != null && from !== to) {
            field.setSelectionRange(Math.min(from, to), Math.max(from, to), to < from ? 'backward' : 'forward');
          }
        }
      }
      snapSelection();
    }

    function onFieldScroll(event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) {
      const mirror = mirrorRef.current;
      // Solo el desplazamiento del usuario mueve el espejo; el automático del campo oculto
      // (que sigue a su propio cursor) se ignora porque sus líneas no coinciden.
      if (mirror && Date.now() - userScrollAt.current < 600) {
        const field = event.currentTarget;
        const fieldRange = field.scrollHeight - field.clientHeight;
        const mirrorRange = mirror.scrollHeight - mirror.clientHeight;
        mirror.scrollTop = fieldRange > 0 && mirrorRange > 0 ? (field.scrollTop / fieldRange) * mirrorRange : 0;
      }
      refreshCaret();
    }

    const markUserScroll = () => {
      userScrollAt.current = Date.now();
    };

    const fieldStyle = { lineHeight: `${lineHeightPx}px` };
    // Cursor visual alineado al espejo (texto visible); nativo queda transparente.
    const showCustomCaret = Boolean(focused && caretBox);
    const caretClass = showCustomCaret ? 'caret-transparent' : 'caret-white';

    const mirror = value ? (
      mirrorTextStyleRanges?.length ? (
        <StyledText
          text={value}
          textStyle={mirrorTextStyle}
          textStyleRanges={mirrorTextStyleRanges}
          size={emojiSize}
          fitInput
          className={mirrorTextClassName}
        />
      ) : (
        <EmojiText text={value} size={emojiSize} fitInput className={mirrorTextClassName} />
      )
    ) : (
      <span className={placeholderClassName}>{placeholder}</span>
    );

    const mentionMenu =
      typeof document !== 'undefined' &&
      focused &&
      mentionQuery &&
      mentionBox &&
      mentionHits.length > 0
        ? createPortal(
            <ul
              className="lb-mention-suggest"
              role="listbox"
              style={{
                top: mentionBox.top,
                left: mentionBox.left,
                width: mentionBox.width,
              }}
            >
              {mentionHits.map((user, index) => {
                const handle = user.username.replace(/^@/, '');
                return (
                  <li key={user.firebaseUid}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === mentionIndex}
                      className={`lb-mention-suggest__item${
                        index === mentionIndex ? ' is-active' : ''
                      }`}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => applyMention(user)}
                    >
                      <UserAvatar
                        src={user.avatarUrl}
                        uid={user.firebaseUid}
                        username={handle}
                        displayName={user.displayName}
                        size="xs"
                      />
                      <span className="lb-mention-suggest__meta">
                        <span className="lb-mention-suggest__name">
                          {user.displayName || handle}
                        </span>
                        <span className="lb-mention-suggest__handle">@{handle}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null;

    const mirrorShell = `pointer-events-none absolute inset-0 z-0 overflow-hidden text-sm ${padClassName}`;

    const caretEl =
      showCustomCaret && caretBox ? (
        <span
          className="lb-emoji-caret pointer-events-none absolute z-[2] w-px bg-white"
          style={{
            left: caretBox.left,
            // Centrado en la línea visible (texto o emoji), no pegado al borde superior.
            top: caretBox.top + (caretBox.height || lineHeightPx) / 2,
            transform: 'translateY(-50%)',
            height: Math.min(
              Math.max(Math.min(emojiSize, 18), 14),
              Math.min(caretBox.height || lineHeightPx, lineHeightPx),
            ),
          }}
          aria-hidden
        />
      ) : null;

    const selectionEls =
      focused && selectionBoxes.length > 0
        ? selectionBoxes.map((box, index) => (
            <span
              key={index}
              className="lb-emoji-selection pointer-events-none absolute z-0"
              style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
              aria-hidden
            />
          ))
        : null;

    if (multiline) {
      const { rows: rowsProp = 3, ...textareaRest } = rest as TextareaHTMLAttributes<HTMLTextAreaElement>;
      const rows = resolvedGrow === 'publication' ? 1 : rowsProp;
      return (
        <div className={`relative min-w-0 ${className}`}>
          <div ref={hostRef} className={`relative min-w-0 ${fieldClassName}`}>
            <div
              ref={mirrorRef}
              aria-hidden
              className={`${mirrorShell} whitespace-pre-wrap break-words ${
                resolvedGrow === 'message'
                  ? 'lb-chat-composer-mirror'
                  : resolvedGrow === 'comment'
                    ? 'lb-comment-composer-mirror overflow-y-auto'
                    : resolvedGrow !== 'none'
                      ? 'overflow-y-auto'
                      : 'overflow-hidden'
              }`}
              style={fieldStyle}
            >
              {mirror}
            </div>
            <textarea
              {...textareaRest}
              ref={(el) => {
                fieldRef.current = el;
              }}
              value={value}
              rows={rows}
              disabled={disabled}
              maxLength={maxLength}
              placeholder=""
              onScroll={onFieldScroll}
              onWheel={markUserScroll}
              onTouchMove={markUserScroll}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              onKeyUp={snapSelection}
              onPointerDown={onFieldPointerDown}
              onClick={onFieldClick}
              onSelect={snapSelection}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                const field = fieldRef.current;
                if (field) {
                  savedCaret.current = {
                    start: field.selectionStart ?? value.length,
                    end: field.selectionEnd ?? field.selectionStart ?? value.length,
                  };
                }
                setFocused(false);
                setCaretBox(null);
              }}
              // El subrayado ortográfico nativo se dibuja sobre el campo oculto, desfasado del texto visible.
              spellCheck={textareaRest.spellCheck ?? false}
              className={`${inputInner} ${caretClass} block resize-none whitespace-pre-wrap break-words ${padClassName} ${
                resolvedGrow === 'publication'
                  ? 'publication-composer-input overflow-y-auto'
                  : resolvedGrow === 'comment'
                    ? 'lb-comment-composer-field overflow-y-auto'
                    : resolvedGrow === 'message'
                      ? 'lb-chat-composer-input'
                      : ''
              }`}
              style={fieldStyle}
            />
            {selectionEls}
            {caretEl}
          </div>
          {mentionMenu}
        </div>
      );
    }

    return (
      <div className={`relative min-w-0 flex-1 ${className}`}>
        <div ref={hostRef} className={`relative min-w-0 ${fieldClassName}`}>
          <div
            ref={mirrorRef}
            aria-hidden
            className={`${mirrorShell} flex items-center whitespace-pre`}
            style={fieldStyle}
          >
            {mirror}
          </div>
          <input
            ref={(el) => {
              fieldRef.current = el;
            }}
            type="text"
            value={value}
            disabled={disabled}
            maxLength={maxLength}
            placeholder=""
            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            onKeyUp={snapSelection}
            onPointerDown={onFieldPointerDown}
            onClick={onFieldClick}
            onSelect={snapSelection}
            spellCheck={false}
            onFocus={() => setFocused(true)}
            onBlur={() => {
                const field = fieldRef.current;
                if (field) {
                  savedCaret.current = {
                    start: field.selectionStart ?? value.length,
                    end: field.selectionEnd ?? field.selectionStart ?? value.length,
                  };
                }
                setFocused(false);
                setCaretBox(null);
              }}
            className={`${inputInner} ${caretClass} min-h-10 ${padClassName}`}
            style={fieldStyle}
            {...(rest as ComponentPropsWithoutRef<'input'>)}
          />
          {selectionEls}
          {caretEl}
        </div>
        {mentionMenu}
      </div>
    );
  },
);
