import { Fragment, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { listFlagSpans } from '../../lib/circleFlags';
import { EMOJI_SHORTCODE_RE, POST_EMOJI_SIZE, resolveEmoji } from '../../lib/liveboomEmojis';
import { peekMentionUser, resolveMentionUsers } from '../../lib/mentionUsers';
import { profileHref } from '../../lib/profileFirestore';
import { listHashtagSpans, listMentionSpans } from '../../lib/textEntities';

type Props = {
  text: string;
  className?: string;
  size?: number;
  fitInput?: boolean;
  /** false = solo color (espejo del compositor). Default: clicable salvo fitInput. */
  interactive?: boolean;
};

type Span =
  | { kind: 'boom'; start: number; end: number; id: string }
  | { kind: 'flag'; start: number; end: number; src: string; label: string; code: string }
  | { kind: 'hashtag'; start: number; end: number; value: string }
  | { kind: 'mention'; start: number; end: number; value: string };

function collectSpans(text: string): Span[] {
  const boom: Span[] = [];
  const re = new RegExp(EMOJI_SHORTCODE_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const id = match[1];
    if (!id || !resolveEmoji(id)) continue;
    boom.push({ kind: 'boom', start: match.index, end: match.index + match[0].length, id });
  }
  const flags: Span[] = listFlagSpans(text).map((item) => ({
    kind: 'flag',
    start: item.start,
    end: item.end,
    src: item.flag.file,
    label: item.flag.label,
    code: item.flag.code,
  }));
  const tags: Span[] = listHashtagSpans(text).map((item) => ({
    kind: 'hashtag',
    start: item.start,
    end: item.end,
    value: item.value,
  }));
  const mentions: Span[] = listMentionSpans(text).map((item) => ({
    kind: 'mention',
    start: item.start,
    end: item.end,
    value: item.value,
  }));
  return [...boom, ...flags, ...tags, ...mentions]
    .sort((a, b) => a.start - b.start)
    .filter((span, index, all) =>
      all.slice(0, index).every((prev) => span.start >= prev.end || span.end <= prev.start),
    );
}

function stopCard(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * Renderer central de texto LiveBoom: emojis, banderas, #hashtags y @menciones.
 * EmojiText reutiliza este componente para no duplicar lógica por pantalla.
 */
export function TextWithEntities({
  text,
  className = '',
  size = POST_EMOJI_SIZE,
  fitInput = false,
  interactive,
}: Props) {
  const clickable = interactive ?? !fitInput;
  const handles = useMemo(
    () =>
      collectSpans(text)
        .filter((span): span is Extract<Span, { kind: 'mention' }> => span.kind === 'mention')
        .map((span) => span.value),
    [text],
  );
  const [ready, setReady] = useState(0);

  useEffect(() => {
    if (handles.length === 0) return;
    let cancelled = false;
    void resolveMentionUsers(handles).then(() => {
      if (!cancelled) setReady((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [handles]);

  const parts = useMemo(() => {
    if (!text) return null;
    void ready;
    const nodes: ReactNode[] = [];
    const spans = collectSpans(text);
    let last = 0;

    for (const span of spans) {
      if (span.start > last) {
        nodes.push(<Fragment key={`t-${last}`}>{text.slice(last, span.start)}</Fragment>);
      }
      if (span.kind === 'boom') {
        const emoji = resolveEmoji(span.id);
        if (emoji) {
          const displaySize = emoji.pack === 'emoticones' ? Math.round(size * 1.35) : size;
          nodes.push(
            <img
              key={`e-${span.start}`}
              src={emoji.file}
              alt={emoji.label}
              title={emoji.label}
              data-emoji-id={span.id}
              data-raw-len={String(span.end - span.start)}
              draggable={false}
              className={`inline-block object-contain ${
                fitInput ? 'align-middle' : 'align-[-0.28em]'
              }`}
              style={{ width: displaySize, height: displaySize }}
            />,
          );
        }
      } else if (span.kind === 'flag') {
        nodes.push(
          <img
            key={`f-${span.start}`}
            src={span.src}
            alt={span.label}
            title={span.label}
            data-flag-code={span.code}
            data-raw-len={String(span.end - span.start)}
            draggable={false}
            className={`lb-flag-icon inline-block ${fitInput ? 'align-middle' : 'align-[-0.2em]'}`}
            style={{ width: size, height: size }}
          />,
        );
      } else if (span.kind === 'hashtag') {
        const label = text.slice(span.start, span.end);
        const classNameEntity = 'lb-entity lb-entity-hashtag';
        nodes.push(
          clickable ? (
            <Link
              key={`h-${span.start}`}
              to={`/tendencias?tag=${encodeURIComponent(span.value)}`}
              className={classNameEntity}
              onClick={stopCard}
            >
              {label}
            </Link>
          ) : (
            <span key={`h-${span.start}`} className={classNameEntity}>
              {label}
            </span>
          ),
        );
      } else {
        const label = text.slice(span.start, span.end);
        const user = peekMentionUser(span.value);
        if (user) {
          const classNameEntity = 'lb-entity lb-entity-mention';
          nodes.push(
            clickable ? (
              <Link
                key={`m-${span.start}`}
                to={profileHref(user.username, user.firebaseUid)}
                className={classNameEntity}
                onClick={stopCard}
              >
                {label}
              </Link>
            ) : (
              <span key={`m-${span.start}`} className={classNameEntity}>
                {label}
              </span>
            ),
          );
        } else if (user === undefined) {
          nodes.push(
            <span key={`m-${span.start}`} className="lb-entity lb-entity-mention lb-entity--pending">
              {label}
            </span>,
          );
        } else {
          nodes.push(<Fragment key={`m-${span.start}`}>{label}</Fragment>);
        }
      }
      last = span.end;
    }

    if (last < text.length) {
      nodes.push(<Fragment key={`t-end`}>{text.slice(last)}</Fragment>);
    }
    return nodes;
  }, [text, ready, clickable, size, fitInput]);

  if (!parts) return null;

  return <span className={`lb-emoji-text whitespace-pre-wrap break-words ${className}`}>{parts}</span>;
}

/** Alias estable: el feed, comentarios y captions ya importan EmojiText. */
export function EmojiText(props: Props) {
  return <TextWithEntities {...props} />;
}
