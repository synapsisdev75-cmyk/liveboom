import { Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PostCommentMediaType } from '../../lib/socialFirestore';

export type CommentMediaKind = PostCommentMediaType;

type Size = 'composer' | 'thread' | 'preview';

type Props = {
  url: string;
  previewUrl?: string | null;
  kind: CommentMediaKind;
  size?: Size;
  removable?: boolean;
  onRemove?: () => void;
  onOpen?: () => void;
};

const SIZE_CLASS: Record<Size, string> = {
  composer: 'lb-comment-thumb lb-comment-thumb--composer',
  thread: 'lb-comment-thumb lb-comment-thumb--thread',
  preview: 'lb-comment-thumb lb-comment-thumb--preview',
};

export function commentPlainText(text: string | null | undefined) {
  return String(text || '')
    .replace(/\u200b/g, '')
    .trim();
}

function formatClipClock(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function CommentMediaThumb({
  url,
  previewUrl,
  kind,
  size = 'thread',
  removable = false,
  onRemove,
  onOpen,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [durationLabel, setDurationLabel] = useState('');
  const isVideo = kind === 'video';
  const isGif = kind === 'gif';
  const canOpen = Boolean(onOpen) && !removable;
  const displaySrc = isGif ? url : previewUrl || url;
  const label = isVideo ? 'Video del comentario' : isGif ? 'GIF del comentario' : 'Foto del comentario';

  useEffect(() => {
    if (!isVideo) return;
    const el = videoRef.current;
    if (!el) return;
    const sync = () => {
      const next = formatClipClock(el.duration);
      if (next) setDurationLabel(next);
    };
    el.addEventListener('loadedmetadata', sync);
    const showFrame = () => {
      if (el.currentTime === 0 && el.readyState >= 1) {
        try {
          el.currentTime = 0.05;
        } catch {
          /* ignore */
        }
      }
    };
    el.addEventListener('loadeddata', showFrame);
    sync();
    return () => {
      el.removeEventListener('loadedmetadata', sync);
      el.removeEventListener('loadeddata', showFrame);
    };
  }, [isVideo, url]);

  return (
    <span
      className={`${SIZE_CLASS[size]} ${isVideo ? 'lb-comment-thumb--video' : ''} ${
        isGif ? 'lb-comment-thumb--gif' : kind === 'image' ? 'lb-comment-thumb--image' : ''
      }`}
    >
      {isVideo ? (
        <video
          ref={videoRef}
          src={url}
          poster={previewUrl || undefined}
          muted
          playsInline
          preload="metadata"
          className="lb-comment-thumb__media"
        />
      ) : (
        <img
          src={displaySrc}
          alt=""
          className="lb-comment-thumb__media"
          draggable={false}
          loading={size === 'preview' ? 'lazy' : 'eager'}
          decoding="async"
        />
      )}
      {isVideo ? (
        <>
          <span className="lb-comment-thumb__play" aria-hidden>
            <Play size={size === 'preview' ? 10 : 18} fill="currentColor" />
          </span>
          {durationLabel && size !== 'preview' ? (
            <span className="lb-comment-thumb__time" aria-hidden>
              {durationLabel}
            </span>
          ) : null}
        </>
      ) : isGif && size !== 'preview' ? (
        <span className="lb-comment-thumb__gif" aria-hidden>
          GIF
        </span>
      ) : null}
      {removable && onRemove ? (
        <button
          type="button"
          className="lb-comment-thumb__remove"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          aria-label="Quitar adjunto"
        >
          <X size={12} />
        </button>
      ) : canOpen ? (
        <button
          type="button"
          className="lb-comment-thumb__open"
          aria-label={`Abrir ${label}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpen?.();
          }}
        />
      ) : null}
    </span>
  );
}
