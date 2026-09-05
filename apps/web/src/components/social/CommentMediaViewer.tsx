import { Maximize2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import type { PostCommentMediaType } from '../../lib/socialFirestore';

export type CommentMediaViewerItem = {
  url: string;
  kind: PostCommentMediaType;
  previewUrl?: string | null;
};

type Props = {
  item: CommentMediaViewerItem | null;
  onClose: () => void;
};

export function CommentMediaViewer({ item, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useBodyScrollLock(Boolean(item));

  useEffect(() => {
    if (!item) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [item, onClose]);

  useEffect(() => {
    if (!item || item.kind !== 'video') return;
    const el = videoRef.current;
    if (!el) return;
    void el.play().catch(() => undefined);
    return () => {
      el.pause();
    };
  }, [item]);

  if (!item || typeof document === 'undefined') return null;

  const label =
    item.kind === 'video' ? 'Video del comentario' : item.kind === 'gif' ? 'GIF del comentario' : 'Foto del comentario';

  function enterFullscreen() {
    const el = videoRef.current;
    if (!el) return;
    const webkit = el as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (el.requestFullscreen) void el.requestFullscreen();
    else webkit.webkitEnterFullscreen?.();
  }

  return createPortal(
    <div
      className="lb-comment-media-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="lb-comment-media-viewer__close"
        onClick={onClose}
        aria-label="Cerrar"
      >
        <X size={20} />
      </button>
      <div
        className="lb-comment-media-viewer__stage"
        onClick={(event) => event.stopPropagation()}
      >
        {item.kind === 'video' ? (
          <>
            <video
              ref={videoRef}
              src={item.url}
              poster={item.previewUrl || undefined}
              className="lb-comment-media-viewer__media"
              controls
              playsInline
              autoPlay
              preload="auto"
            />
            <button
              type="button"
              className="lb-comment-media-viewer__full"
              onClick={enterFullscreen}
              aria-label="Pantalla completa"
            >
              <Maximize2 size={16} />
            </button>
          </>
        ) : (
          <img
            src={item.url}
            alt=""
            className="lb-comment-media-viewer__media"
            draggable={false}
          />
        )}
        {item.kind === 'gif' ? (
          <span className="lb-comment-media-viewer__gif" aria-hidden>
            GIF
          </span>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
