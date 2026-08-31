import { Fragment, type ReactNode } from 'react';
import { EMOJI_SHORTCODE_RE, POST_EMOJI_SIZE, resolveEmoji } from '../../lib/liveboomEmojis';

type Props = {
  text: string;
  className?: string;
  /** Tamaño inline del icono en px */
  size?: number;
};

/** Renderiza texto con shortcodes :emoji_id: como imágenes. */
export function EmojiText({ text, className = '', size = POST_EMOJI_SIZE }: Props) {
  if (!text) return null;

  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(EMOJI_SHORTCODE_RE.source, 'g');

  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    if (start > last) {
      parts.push(<Fragment key={`t-${last}`}>{text.slice(last, start)}</Fragment>);
    }
    const id = match[1];
    if (!id) continue;
    const emoji = resolveEmoji(id);
    if (emoji) {
      parts.push(
        <img
          key={`e-${start}`}
          src={emoji.file}
          alt={emoji.label}
          title={emoji.label}
          draggable={false}
          className="inline-block align-[-0.28em] object-contain"
          style={{ width: size, height: size }}
        />,
      );
    } else {
      parts.push(<Fragment key={`m-${start}`}>{match[0]}</Fragment>);
    }
    last = start + match[0].length;
  }

  if (last < text.length) {
    parts.push(<Fragment key={`t-end`}>{text.slice(last)}</Fragment>);
  }

  return <span className={`whitespace-pre-wrap break-words ${className}`}>{parts}</span>;
}
