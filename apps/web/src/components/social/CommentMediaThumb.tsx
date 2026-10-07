import { Pause, Play, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { PostCommentMediaType } from '../../lib/socialFirestore';
import { claimExclusivePlayback, registerFeedVideo, releaseExclusivePlayback } from '../../lib/videoPlayback';

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
  /** Video: tocar reproduce/pausa ahí mismo con sonido, sin abrir el visor. */
  inlinePlay?: boolean;
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
  inlinePlay = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [durationLabel, setDurationLabel] = useState('');
  const [playing, setPlaying] = useState(false);
  const isVideo = kind === 'video';
  const isGif = kind === 'gif';
  const isSticker = kind === 'sticker';
  const playsInline = isVideo && inlinePlay && !removable;
  const canOpen = (Boolean(onOpen) || playsInline) && !removable;
  const playerId = `comment-thumb-${useId()}`;
  const displaySrc = isGif || isSticker ? url : previewUrl || url;
  const label = isVideo
    ? 'Video del comentario'
    : isGif
      ? 'GIF del comentario'
      : isSticker
        ? 'Sticker del comentario'
        : 'Foto del comentario';

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

  useEffect(() => {
    if (!playsInline) return;
    const unregister = registerFeedVideo({
      id: playerId,
      pause: () => videoRef.current?.pause(),
      mute: () => {
        if (videoRef.current) videoRef.current.muted = true;
      },
    });
    return () => {
      videoRef.current?.pause();
      releaseExclusivePlayback(playerId);
      unregister();
    };
  }, [playsInline, playerId]);

  function toggleInline() {
    const el = videoRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    if (el.ended) el.currentTime = 0;
    el.muted = false;
    claimExclusivePlayback(playerId);
    void el.play().catch(() => {
      el.muted = true;
      void el.play().catch(() => undefined);
    });
  }

  return (
    <span
      className={`${SIZE_CLASS[size]} ${isVideo ? 'lb-comment-thumb--video' : ''} ${
        isGif
          ? 'lb-comment-thumb--gif'
          : isSticker
            ? 'lb-comment-thumb--sticker'
            : kind === 'image'
              ? 'lb-comment-thumb--image'
              : ''
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
          onPlay={playsInline ? () => setPlaying(true) : undefined}
          onPause={
            playsInline
              ? () => {
                  setPlaying(false);
                  releaseExclusivePlayback(playerId);
                }
              : undefined
          }
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
          <span className={`lb-comment-thumb__play ${playing ? 'is-playing' : ''}`} aria-hidden>
            {playing ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={size === 'preview' ? 10 : 18} fill="currentColor" />
            )}
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
          className={`lb-comment-thumb__open ${playsInline ? 'lb-comment-thumb__open--inline' : ''}`}
          aria-label={playsInline ? (playing ? 'Pausar video' : 'Reproducir video') : `Abrir ${label}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (playsInline) toggleInline();
            else onOpen?.();
          }}
        />
      ) : null}
    </span>
  );
}
