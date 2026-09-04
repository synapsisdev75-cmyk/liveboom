import { Fragment, type ReactNode } from 'react';
import { listFlagSpans } from '../../lib/circleFlags';
import { EMOJI_SHORTCODE_RE, POST_EMOJI_SIZE, resolveEmoji } from '../../lib/liveboomEmojis';

type Props = {
  text: string;
  className?: string;
  /** Tamaño inline del icono en px */
  size?: number;
  /** En el compositor: alinea el icono con la línea de texto. */
  fitInput?: boolean;
};

type Span =
  | { kind: 'boom'; start: number; end: number; id: string }
  | { kind: 'flag'; start: number; end: number; src: string; label: string; code: string };

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
  return [...boom, ...flags]
    .sort((a, b) => a.start - b.start)
    .filter((span, index, all) =>
      all.slice(0, index).every((prev) => span.start >= prev.end || span.end <= prev.start),
    );
}

/** Renderiza texto con shortcodes :emoji_id: y banderas unicode como imágenes. */
export function EmojiText({
  text,
  className = '',
  size = POST_EMOJI_SIZE,
  fitInput = false,
}: Props) {
  if (!text) return null;

  const parts: ReactNode[] = [];
  const spans = collectSpans(text);
  let last = 0;

  for (const span of spans) {
    if (span.start > last) {
      parts.push(<Fragment key={`t-${last}`}>{text.slice(last, span.start)}</Fragment>);
    }
    if (span.kind === 'boom') {
      const emoji = resolveEmoji(span.id);
      if (emoji) {
        parts.push(
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
            style={{ width: size, height: size }}
          />,
        );
      }
    } else {
      parts.push(
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
    }
    last = span.end;
  }

  if (last < text.length) {
    parts.push(<Fragment key={`t-end`}>{text.slice(last)}</Fragment>);
  }

  return <span className={`lb-emoji-text whitespace-pre-wrap break-words ${className}`}>{parts}</span>;
}
