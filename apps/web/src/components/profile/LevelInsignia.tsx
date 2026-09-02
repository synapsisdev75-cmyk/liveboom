import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { levelFromXp } from '../../lib/userLevels';

type Props = {
  levelXp: number;
  className?: string;
  previewSrc?: string;
  /** WebM animado (hover/toque). Si no hay, se usa el del nivel. */
  previewAnimWebm?: string | null;
  previewAnimMp4?: string | null;
  previewSize?: {
    mobile: { width: number; height: number };
    desktop: { width: number; height: number };
  };
};

/** Tinte de glow por slug (efectos CSS al hover/toque). */
const SLUG_GLOW: Record<string, string> = {
  mecha: '255, 180, 60',
  boom: '255, 120, 40',
  fuego: '255, 70, 50',
  impacto: '232, 121, 249',
  estrella: '250, 204, 21',
  corona: '251, 191, 36',
  diamante: '34, 211, 238',
  titan: '52, 211, 153',
  leyenda: '252, 211, 77',
  pro: '0, 240, 255',
};

export function LevelInsignia({
  levelXp,
  className = '',
  previewSrc,
  previewAnimWebm,
  previewAnimMp4,
  previewSize,
}: Props) {
  const info = levelFromXp(levelXp);
  const size = previewSize ?? info.insigniaSize;
  const src = previewSrc ?? info.image;
  const animWebm = previewAnimWebm !== undefined ? previewAnimWebm : info.badgeAnimWebm;
  const animMp4 = previewAnimMp4 !== undefined ? previewAnimMp4 : info.badgeAnimMp4;
  const hasVideo = Boolean(animWebm || animMp4);
  const glowRgb = SLUG_GLOW[info.slug] ?? '255, 120, 80';

  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasVideo) return;

    if (active) {
      const play = () => {
        try {
          video.currentTime = 0;
        } catch {
          /* ignore */
        }
        void video.play().catch(() => undefined);
      };
      if (video.readyState >= 2) play();
      else {
        const onReady = () => {
          play();
          video.removeEventListener('loadeddata', onReady);
        };
        video.addEventListener('loadeddata', onReady);
        if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) video.load();
      }
    } else {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [active, hasVideo, animWebm, animMp4]);

  const sizeStyle = {
    '--ins-w-mobile': `${size.mobile.width}px`,
    '--ins-h-mobile': `${size.mobile.height}px`,
    '--ins-w-desktop': `${size.desktop.width}px`,
    '--ins-h-desktop': `${size.desktop.height}px`,
    '--ins-glow': glowRgb,
  } as CSSProperties;

  function startAnim() {
    setActive(true);
  }

  function stopAnim() {
    setActive(false);
  }

  return (
    <div
      className={`lb-insignia relative mx-auto select-none touch-manipulation sm:ml-auto sm:mr-0 ${
        active ? 'lb-insignia--active' : ''
      } ${className}`}
      style={sizeStyle}
      onMouseEnter={startAnim}
      onMouseLeave={stopAnim}
      onFocus={startAnim}
      onBlur={stopAnim}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch' || e.pointerType === 'pen') startAnim();
      }}
      onPointerUp={stopAnim}
      onPointerCancel={stopAnim}
      onPointerLeave={stopAnim}
      role="img"
      aria-label={info.title}
      tabIndex={0}
    >
      <span className="lb-insignia__aura" aria-hidden />
      <span className="lb-insignia__shine" aria-hidden />
      <span className="lb-insignia__spark lb-insignia__spark--a" aria-hidden />
      <span className="lb-insignia__spark lb-insignia__spark--b" aria-hidden />
      <span className="lb-insignia__spark lb-insignia__spark--c" aria-hidden />

      <img
        src={src}
        alt=""
        className="lb-insignia__img relative z-[1] h-full w-full object-contain object-bottom"
        draggable={false}
      />

      {hasVideo ? (
        <video
          ref={videoRef}
          className={`pointer-events-none absolute inset-0 z-[2] h-full w-full object-contain object-bottom transition-opacity duration-200 [mix-blend-mode:screen] ${
            active ? 'opacity-100' : 'opacity-0'
          }`}
          muted
          playsInline
          loop
          preload="metadata"
          aria-hidden
        >
          {animWebm ? <source src={animWebm} type="video/webm" /> : null}
          {animMp4 ? <source src={animMp4} type="video/mp4" /> : null}
        </video>
      ) : null}
    </div>
  );
}
