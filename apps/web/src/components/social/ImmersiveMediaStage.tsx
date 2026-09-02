import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  computeImmersiveMediaBox,
  immersiveMediaBoxStyle,
  usesImmersiveAsideRail,
  type ImmersiveLayoutInsets,
} from '../../lib/immersiveMediaLayout';
import { classifyVideoOrientation } from '../../lib/videoAspect';

type Props = {
  mediaWidth: number;
  mediaHeight: number;
  mediaUrl: string;
  mediaKind: 'video' | 'image';
  insets?: Partial<ImmersiveLayoutInsets>;
  embedded?: boolean;
  /** Explorar / Flash Boom: rail fijo al lado en horizontal (sin scroll). */
  landscapeRailAside?: boolean;
  onSwipeStart?: (x: number, y: number) => void;
  onSwipeEnd?: (x: number, y: number) => void;
  onWheel?: (deltaY: number) => void;
  children: ReactNode;
  /** Controles superpuestos (seek zones, etc.) */
  mediaOverlay?: ReactNode;
  topChrome?: ReactNode;
  bottomChrome?: ReactNode;
  sideChrome?: ReactNode;
};

/**
 * Escenario inmersivo responsive: media protagonista + action rail cercano.
 * Una sola implementación para móvil, tablet y desktop.
 */
export function ImmersiveMediaStage({
  mediaWidth,
  mediaHeight,
  mediaUrl,
  mediaKind,
  insets,
  embedded = false,
  landscapeRailAside = false,
  onSwipeStart,
  onSwipeEnd,
  onWheel,
  children,
  mediaOverlay,
  topChrome,
  bottomChrome,
  sideChrome,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(() =>
    computeImmersiveMediaBox(
      mediaWidth || 9,
      mediaHeight || 16,
      typeof window !== 'undefined' ? window.innerWidth : 390,
      typeof window !== 'undefined' ? window.innerHeight : 844,
      insets,
      typeof window !== 'undefined' ? window.innerWidth >= 1024 : false,
      false,
    ),
  );

  const orientation =
    mediaWidth > 0 && mediaHeight > 0
      ? classifyVideoOrientation(mediaWidth, mediaHeight)
      : 'portrait';
  const useRailAside = usesImmersiveAsideRail(mediaWidth, mediaHeight, landscapeRailAside);

  useEffect(() => {
    const host = stageRef.current;
    if (!host) return;

    const update = () => {
      const rect = host.getBoundingClientRect();
      const desktop = rect.width >= 1024;
      setBox(
        computeImmersiveMediaBox(
          mediaWidth || 9,
          mediaHeight || 16,
          rect.width,
          rect.height,
          insets,
          desktop,
          useRailAside,
        ),
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [mediaWidth, mediaHeight, insets, useRailAside]);

  return (
    <div
      ref={stageRef}
      className={`lb-immersive-stage relative flex min-h-0 flex-1 flex-col overflow-hidden ${
        embedded ? 'h-full' : 'h-[100dvh] max-h-[100dvh]'
      }`}
    >
      {mediaUrl ? (
        <div className="lb-immersive-backdrop pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {mediaKind === 'video' ? (
            <video
              src={mediaUrl}
              className="lb-immersive-backdrop__media"
              muted
              playsInline
              preload="metadata"
              tabIndex={-1}
            />
          ) : (
            <img src={mediaUrl} alt="" className="lb-immersive-backdrop__media" draggable={false} />
          )}
        </div>
      ) : null}

      {topChrome}

      <div
        className="lb-immersive-stage__center relative z-[1] flex min-h-0 flex-1 items-center justify-center px-[max(0.25rem,env(safe-area-inset-left))]"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (!touch) return;
          onSwipeStart?.(touch.clientX, touch.clientY);
        }}
        onTouchEnd={(event) => {
          const touch = event.changedTouches[0];
          if (!touch) return;
          onSwipeEnd?.(touch.clientX, touch.clientY);
        }}
        onWheel={(event) => {
          if (!onWheel) return;
          event.preventDefault();
          onWheel(event.deltaY);
        }}
      >
        <div
          className={
            useRailAside
              ? 'lb-immersive-stage__row flex h-full w-full max-w-full items-center justify-center'
              : 'flex h-full w-full items-center justify-center'
          }
        >
          <div
            className={`lb-immersive-media-box lb-immersive-media-box--${orientation} relative shrink-0 ${
              useRailAside ? 'min-w-0 flex-1' : ''
            }`}
            style={
              useRailAside
                ? {
                    height: `${box.height}px`,
                    maxHeight: '100%',
                    width: '100%',
                    maxWidth: `${box.width}px`,
                  }
                : immersiveMediaBoxStyle(box)
            }
            data-orientation={orientation}
          >
            {children}
            {mediaOverlay}
            {!useRailAside ? sideChrome : null}
          </div>
          {useRailAside && sideChrome ? (
            <div className="lb-immersive-rail-aside shrink-0">{sideChrome}</div>
          ) : null}
        </div>
      </div>

      {bottomChrome}
    </div>
  );
}
