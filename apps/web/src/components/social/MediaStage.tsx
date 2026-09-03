import type { CSSProperties, ReactNode } from 'react';
import { mediaStageModeClass, type MediaStageMode } from '../../lib/mediaPresentation';

type Props = {
  mode: MediaStageMode;
  mediaUrl?: string | null;
  mediaKind?: 'image' | 'video';
  /** Si hay poster (p. ej. Publicaciones), ambient usa imagen — evita 2º <video>. */
  posterUrl?: string | null;
  className?: string;
  style?: CSSProperties;
  mainClassName?: string;
  mainStyle?: CSSProperties;
  children: ReactNode;
  overlay?: ReactNode;
};

/**
 * Escenario multimedia en dos capas: fondo ambient (blur) + media principal (contain).
 * Perfiles por modo — publication / boomClip / flashBoom / fullscreen / live.
 */
export function MediaStage({
  mode,
  mediaUrl,
  mediaKind = 'image',
  posterUrl = null,
  className = '',
  style,
  mainClassName = '',
  mainStyle,
  children,
  overlay,
}: Props) {
  const hasAmbient = Boolean(mediaUrl || posterUrl);
  const ambientIsImage = mediaKind === 'image' || Boolean(posterUrl);
  const ambientSrc = posterUrl || mediaUrl || '';

  return (
    <div
      className={`lb-media-stage ${mediaStageModeClass(mode)} ${className}`}
      style={style}
      data-media-stage={mode}
    >
      {hasAmbient ? (
        <div className="lb-media-stage__ambient pointer-events-none" aria-hidden>
          {ambientIsImage ? (
            <img src={ambientSrc} alt="" className="lb-media-stage__ambient-media" draggable={false} />
          ) : (
            <video
              src={mediaUrl!}
              className="lb-media-stage__ambient-media"
              muted
              playsInline
              preload="metadata"
              tabIndex={-1}
            />
          )}
        </div>
      ) : null}

      <div className={`lb-media-stage__main ${mainClassName}`} style={mainStyle}>
        {children}
      </div>

      {overlay ? <div className="lb-media-stage__overlay pointer-events-none">{overlay}</div> : null}
    </div>
  );
}
