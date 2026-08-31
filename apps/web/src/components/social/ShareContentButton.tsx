import { Share2 } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { shareContent, type ShareMediaType } from '../../lib/shareContent';

type Props = {
  url: string;
  title?: string;
  text?: string;
  mediaUrl?: string | null;
  mediaType?: ShareMediaType | null;
  className?: string;
  label?: string;
  iconOnly?: boolean;
  size?: 'sm' | 'md';
};

export function ShareContentButton({
  url,
  title,
  text,
  mediaUrl,
  mediaType,
  className = '',
  label = 'Compartir',
  iconOnly = false,
  size = 'sm',
}: Props) {
  const [note, setNote] = useState<string | null>(null);
  const iconSize = size === 'md' ? 18 : 15;

  async function onShare(event?: MouseEvent) {
    event?.stopPropagation();
    const result = await shareContent({ url, title, text, mediaUrl, mediaType });
    const message =
      result === 'shared'
        ? 'Compartido'
        : result === 'copied'
          ? 'Enlace copiado'
          : 'No se pudo compartir';
    setNote(message);
    window.setTimeout(() => setNote(null), 2200);
  }

  return (
    <span className={`relative inline-flex flex-col items-end gap-0.5 ${className}`}>
      <button
        type="button"
        onClick={(event) => void onShare(event)}
        className={`inline-flex items-center justify-center font-semibold text-zinc-400 transition hover:text-white ${
          iconOnly
            ? 'h-10 w-10 rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70'
            : size === 'md'
              ? 'min-h-10 gap-1.5 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5'
              : 'min-h-10 gap-1.5 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5'
        }`}
        aria-label={label}
        title={label}
      >
        <Share2 size={iconSize} />
        {iconOnly ? null : label}
      </button>
      {note ? <span className="text-[10px] font-semibold text-cyan-300">{note}</span> : null}
    </span>
  );
}
