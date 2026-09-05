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
   * Autoaltura. `comment` = crecimiento moderado para la barra de comentarios.
   * Si no se pasa, `growToMaxScroll` sigue mapeando a `publication`.
   */
  growMode?: 'none' | 'publication' | 'comment';
  /** Enter envía (Shift+Enter = salto de línea en multiline). */
  onEnterSubmit?: () => void;
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
};

const inputInner =
  'relative z-[1] w-full min-w-0 border-0 bg-transparent text-sm text-transparent outline-none [-webkit-text-fill-color:transparent] selection:bg-cyan-500/25 disabled:opacity-60';

function publicationComposerMaxPx() {
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  const shortPhone = landscape && viewH < 560;
  if (shortPhone) return Math.min(viewH * 0.34, 10 * 16);
  return Math.min(viewH * 0.38, 18 * 16);
}

function publicationComposerMinPx() {
  return Math.min(5 * 16, (window.visualViewport?.height ?? window.innerHeight) * 0.18);
}

function commentComposerMaxPx() {
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  return Math.min(viewH * 0.2, 5.5 * 16);
}

function commentComposerMinPx() {
  return 2.5 * 16;
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

  const toBox = (rect: DOMRect) => ({
    left: rect.left - hostRect.left + host.scrollLeft,
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

  return walk(span.childNodes);
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
    const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null);
    const [mentionHits, setMentionHits] = useState<PublicFsUser[]>([]);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionBox, setMentionBox] = useState<{ top: number; left: number; width: number } | null>(
      null,
    );

    const lineHeightPx = Math.max(emojiSize + 8, 28);

    useImperativeHandle(ref, () => ({
      focus: () => fieldRef.current?.focus(),
      insertToken: (id: string) => {
        const field = fieldRef.current;
        const start =
          field && document.activeElement === field
            ? field.selectionStart ?? value.length
            : (savedCaret.current?.start ?? value.length);
        const end =
          field && document.activeElement === field
            ? field.selectionEnd ?? start
            : (savedCaret.current?.end ?? start);
        const { next, caret } = insertEmojiTokenAt(value, id, start, end);
        if (maxLength != null && next.length > maxLength) return;
        pendingCaret.current = caret;
        savedCaret.current = { start: caret, end: caret };
        onChange(next);
      },
    }));

    const refreshCaret = useCallback(() => {
      const field = fieldRef.current;
      const mirror = mirrorRef.current;
      const host = hostRef.current;
      if (!field || !mirror || !host || document.activeElement !== field) {
        setCaretBox(null);
        return;
      }
      const start = field.selectionStart ?? 0;
      const end = field.selectionEnd ?? 0;
      if (start !== end || !value) {
        setCaretBox(null);
        return;
      }
      const box = visualCaretBox(mirror, value, start, host);
      setCaretBox(box);
    }, [value]);

    useLayoutEffect(() => {
      const field = fieldRef.current;
      if (pendingCaret.current != null && field) {
        const pos = pendingCaret.current;
        pendingCaret.current = null;
        field.setSelectionRange(pos, pos);
      }
      refreshCaret();
    }, [value, refreshCaret, focused]);

    useLayoutEffect(() => {
      if (resolvedGrow === 'none' || !multiline) return;
      const field = fieldRef.current;
      if (!field || !(field instanceof HTMLTextAreaElement)) return;

      const applySize = () => {
        const cap = resolvedGrow === 'comment' ? commentComposerMaxPx() : publicationComposerMaxPx();
        const minH = resolvedGrow === 'comment' ? commentComposerMinPx() : publicationComposerMinPx();
        field.style.height = 'auto';
        const next = Math.min(Math.max(field.scrollHeight, minH), cap);
        field.style.height = `${next}px`;
        field.style.maxHeight = `${cap}px`;
        field.style.overflowY = field.scrollHeight > cap + 1 ? 'auto' : 'hidden';
        const atEnd = field.selectionStart >= value.length;
        if (atEnd) field.scrollTop = field.scrollHeight;
        const mirror = mirrorRef.current;
        if (mirror) mirror.scrollTop = field.scrollTop;
        refreshCaret();
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
    }, [value, resolvedGrow, multiline, refreshCaret]);

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
          refreshCaret();
          return;
        }
        const grapheme = graphemeEndingAt(value, start);
        if (grapheme && grapheme.end - grapheme.start > 1) {
          event.preventDefault();
          field.setSelectionRange(grapheme.start, grapheme.start);
          refreshCaret();
        }
        return;
      }

      if (event.key === 'ArrowRight' && start === end && !event.altKey && !event.metaKey && !event.ctrlKey) {
        const token = emojiTokenStartingAt(value, start) ?? emojiTokenCovering(value, start);
        if (token) {
          event.preventDefault();
          const next = token.end;
          field.setSelectionRange(next, next);
          refreshCaret();
          return;
        }
        const grapheme = graphemeStartingAt(value, start);
        if (grapheme && grapheme.end - grapheme.start > 1) {
          event.preventDefault();
          field.setSelectionRange(grapheme.end, grapheme.end);
          refreshCaret();
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
        refreshCaret();
        return;
      }
      const snapped = snapCaretOutOfEmojiToken(value, start, true);
      if (snapped !== start) field.setSelectionRange(snapped, snapped);
      refreshCaret();
    }

    const fieldStyle = { lineHeight: `${lineHeightPx}px` };
    const showCustomCaret = Boolean(focused && value && caretBox);
    const caretClass = showCustomCaret ? 'caret-transparent' : 'caret-white';

    const mirror = value ? (
      <EmojiText text={value} size={emojiSize} fitInput className={mirrorTextClassName} />
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
          className="pointer-events-none absolute z-[2] w-px bg-white"
          style={{
            left: caretBox.left,
            top: caretBox.top,
            height: Math.max(caretBox.height, emojiSize),
          }}
          aria-hidden
        />
      ) : null;

    if (multiline) {
      const { rows = 3, ...textareaRest } = rest as TextareaHTMLAttributes<HTMLTextAreaElement>;
      return (
        <div className={`relative min-w-0 ${className}`}>
          <div ref={hostRef} className={`relative min-w-0 ${fieldClassName}`}>
            <div
              ref={mirrorRef}
              aria-hidden
              className={`${mirrorShell} whitespace-pre-wrap break-words ${
                resolvedGrow !== 'none' ? 'overflow-y-auto' : 'overflow-hidden'
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
              onScroll={
                resolvedGrow !== 'none'
                  ? (event) => {
                      const mirrorEl = mirrorRef.current;
                      if (mirrorEl) mirrorEl.scrollTop = event.currentTarget.scrollTop;
                      refreshCaret();
                    }
                  : undefined
              }
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              onClick={snapSelection}
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
              className={`${inputInner} ${caretClass} resize-none ${padClassName} ${
                resolvedGrow === 'publication'
                  ? 'publication-composer-field min-h-[4.5rem] overflow-y-auto'
                  : resolvedGrow === 'comment'
                    ? 'lb-comment-composer-field overflow-y-auto'
                    : ''
              }`}
              style={fieldStyle}
            />
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
            onClick={snapSelection}
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
            className={`${inputInner} ${caretClass} min-h-10 ${padClassName}`}
            style={fieldStyle}
            {...(rest as ComponentPropsWithoutRef<'input'>)}
          />
          {caretEl}
        </div>
        {mentionMenu}
      </div>
    );
  },
);
