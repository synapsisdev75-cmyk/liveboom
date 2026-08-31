import { Maximize2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildPostShareUrl } from '../../lib/shareContent';
import { ShareContentButton } from './ShareContentButton';

type Props = {
  src: string;
  caption?: string | null;
  /** Abrir expandido al montar. */
  startExpanded?: boolean;
  onCloseExpand?: () => void;
  onExpandChange?: (expanded: boolean) => void;
  /** Solo overlay (sin miniatura inline), p. ej. Explorar. */
  overlayOnly?: boolean;
  /** aspect-square en perfil; aspect-video en feed. */
  aspect?: 'square' | 'video';
  postId?: string;
  authorUsername?: string;
  authorUid?: string;
};

/** Lightbox: al tocar solo se expande la imagen, sin comentarios ni reacciones. */
export function PostPhotoViewer({
  src,
  caption,
  startExpanded = false,
  onCloseExpand,
  onExpandChange,
  overlayOnly = false,
  aspect = 'square',
  postId,
  authorUsername,
  authorUid,
}: Props) {
  const [expanded, setExpanded] = useState(startExpanded || overlayOnly);
  const shareUrl =
    authorUsername && postId ? buildPostShareUrl(authorUsername, postId, authorUid) : null;
  const shareTitle = authorUsername ? `@${authorUsername} en LiveBoom` : 'LiveBoom';
  const shareText =
    caption?.trim() ||
    (authorUsername ? `Mira esta foto de @${authorUsername} en LiveBoom` : 'Mira esta foto en LiveBoom');

  useEffect(() => {
    if (startExpanded || overlayOnly) setExpanded(true);
  }, [startExpanded, overlayOnly]);

  useEffect(() => {
    onExpandChange?.(expanded);
  }, [expanded, onExpandChange]);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  function openExpand() {
    setExpanded(true);
  }

  function closeExpand() {
    if (overlayOnly) {
      onCloseExpand?.();
      return;
    }
    setExpanded(false);
    onCloseExpand?.();
  }

  const aspectClass = aspect === 'video' ? 'aspect-video' : 'aspect-square';

  const expandedOverlay =
    expanded && typeof document !== 'undefined' ? (
      <div
        className="fixed inset-0 z-[70] flex flex-col touch-none overflow-hidden overscroll-none bg-black"
        onClick={closeExpand}
        role="dialog"
        aria-modal
        aria-label="Imagen ampliada"
      >
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          onClick={(event) => event.stopPropagation()}
        />

        <div className="relative z-10 flex items-start justify-between gap-3 p-3 pt-[max(0.75rem,var(--lb-safe-top))]">
          <button
            type="button"
            onClick={closeExpand}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
          {shareUrl ? (
            <ShareContentButton
              url={shareUrl}
              title={shareTitle}
              text={shareText}
              mediaUrl={src}
              mediaType="photo"
              iconOnly
            />
          ) : null}
        </div>

        {caption ? (
          <p className="relative z-10 mt-auto px-4 pb-[max(1rem,var(--lb-safe-bottom))] text-center text-sm text-white/90">
            {caption}
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      {!overlayOnly ? (
        <button
          type="button"
          onClick={openExpand}
          className={`relative block w-full overflow-hidden bg-black ${aspectClass}`}
          aria-label="Expandir imagen"
        >
          <img src={src} alt="" className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
          <span className="absolute bottom-2 right-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-black/55 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm">
            <Maximize2 size={14} /> Expandir
          </span>
          {shareUrl ? (
            <span className="absolute bottom-2 left-2">
              <ShareContentButton
                url={shareUrl}
                title={shareTitle}
                text={shareText}
                mediaUrl={src}
                mediaType="photo"
                iconOnly
              />
            </span>
          ) : null}
        </button>
      ) : null}

      {expandedOverlay ? createPortal(expandedOverlay, document.body) : null}
    </>
  );
}
