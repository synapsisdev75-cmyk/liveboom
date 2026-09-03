import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  computeImmersiveMediaBox,
  immersiveMediaBoxStyle,
  usesImmersiveAsideRail,
  type ImmersiveLayoutInsets,
} from '../../lib/immersiveMediaLayout';
import { exploreLandscape } from '../../responsive/mobile-tablet';
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
  /**
   * `auto` = cover en móvil portrait (Explorar).
   * `contain` = siempre contain + blur (Publicaciones abiertas desde Inicio).
   */
  fillMode?: 'auto' | 'contain';
};

/**
 * Escenario inmersivo responsive: media protagonista + action rail cercano.
 * Móvil vertical: llena 9:16 con recorte (cover). Al girar: video/foto original (contain).
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
  fillMode = 'auto',
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [fillCover, setFillCover] = useState(false);
  const [deviceLandscape, setDeviceLandscape] = useState(false);
  const [box, setBox] = useState(() =>
    computeImmersiveMediaBox(
      mediaWidth || 9,
      mediaHeight || 16,
      typeof window !== 'undefined' ? window.innerWidth : 390,
      typeof window !== 'undefined' ? window.innerHeight : 844,
      insets,
      typeof window !== 'undefined' ? window.innerWidth >= 1024 : false,
      false,
      false,
      false,
    ),
  );

  const orientation =
    mediaWidth > 0 && mediaHeight > 0
      ? classifyVideoOrientation(mediaWidth, mediaHeight)
      : 'portrait';
  const useRailAside = usesImmersiveAsideRail(mediaWidth, mediaHeight, landscapeRailAside);
  const railAside = useRailAside && !fillCover && !deviceLandscape;

  useEffect(() => {
    const host = stageRef.current;
    if (!host) return;

    const portraitMq =
      typeof window !== 'undefined' ? window.matchMedia('(orientation: portrait)') : null;

    const update = () => {
      const rect = host.getBoundingClientRect();
      const desktop = rect.width >= 1024;
      const devicePortrait =
        portraitMq?.matches ?? rect.height >= rect.width;
      const nextDeviceLandscape = !desktop && !devicePortrait;
      // Explorar móvil portrait: cover. Publicaciones (contain): nunca crop.
      const nextFill = fillMode === 'contain' ? false : !desktop && devicePortrait;
      setFillCover(nextFill);
      setDeviceLandscape(nextDeviceLandscape);
      setBox(
        computeImmersiveMediaBox(
          mediaWidth || 9,
          mediaHeight || 16,
          rect.width,
          rect.height,
          nextFill
            ? {
                ...insets,
                top: Math.min(insets?.top ?? 8, 8),
                bottom: Math.min(insets?.bottom ?? 8, 8),
                left: 0,
                right: 0,
              }
            : nextDeviceLandscape
              ? {
                  ...insets,
                  top: exploreLandscape.stageInsetTopPx,
                  bottom: exploreLandscape.stageInsetBottomPx,
                  left: exploreLandscape.stageInsetLeftPx,
                  right: exploreLandscape.mediaRightReservePx + 4,
                }
              : insets,
          desktop,
          useRailAside && !nextFill && !nextDeviceLandscape,
          nextFill,
          nextDeviceLandscape,
        ),
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    portraitMq?.addEventListener('change', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      portraitMq?.removeEventListener('change', update);
    };
  }, [mediaWidth, mediaHeight, insets, useRailAside, fillMode]);

  return (
    <div
      ref={stageRef}
      className={`lb-immersive-stage relative flex min-h-0 flex-1 flex-col overflow-hidden ${
        embedded ? 'h-full' : 'h-[100dvh] max-h-[100dvh]'
      }`}
      data-fill={fillCover ? 'cover' : 'contain'}
      data-device-orientation={deviceLandscape ? 'landscape' : 'portrait'}
    >
      {mediaUrl && !fillCover ? (
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
        className={`lb-immersive-stage__center relative z-[1] flex min-h-0 flex-1 items-center justify-center ${
          fillCover ? 'px-0' : 'px-[max(0.25rem,env(safe-area-inset-left))]'
        }`}
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
            railAside
              ? 'lb-immersive-stage__row flex h-full w-full max-w-full flex-row items-center justify-center'
              : 'flex h-full w-full items-center justify-center'
          }
        >
          <div
            className={`lb-immersive-media-box lb-immersive-media-box--${orientation} relative shrink-0 ${
              fillCover ? 'h-full w-full max-h-full max-w-full' : ''
            }`}
            style={
              fillCover
                ? { width: '100%', height: '100%' }
                : railAside
                  ? {
                      height: `${box.height}px`,
                      maxHeight: '100%',
                      width: `${box.width}px`,
                      maxWidth: '100%',
                    }
                  : immersiveMediaBoxStyle(box)
            }
            data-orientation={orientation}
            data-fill={fillCover ? 'cover' : 'contain'}
          >
            {children}
            {mediaOverlay}
            {!railAside && !deviceLandscape && sideChrome ? (
              <div className="pointer-events-none absolute inset-0 z-40 [&_.pointer-events-auto]:pointer-events-auto">
                {sideChrome}
              </div>
            ) : null}
          </div>
          {railAside && sideChrome ? (
            <div className="lb-immersive-rail-aside order-last shrink-0">{sideChrome}</div>
          ) : null}
        </div>
      </div>

      {/* Teléfono girado: rail fuera del 9:16, al borde derecho de la pantalla. */}
      {deviceLandscape && !railAside && sideChrome ? (
        <div className="lb-immersive-edge-rail pointer-events-none absolute top-1/2 z-40 -translate-y-1/2 [&_.pointer-events-auto]:pointer-events-auto">
          {sideChrome}
        </div>
      ) : null}

      {bottomChrome}
    </div>
  );
}
