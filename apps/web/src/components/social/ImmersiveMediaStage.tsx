import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  computeImmersiveMediaBox,
  immersiveMediaBoxStyle,
  usesImmersiveAsideRail,
  type ImmersiveLayoutInsets,
} from '../../lib/immersiveMediaLayout';
import { exploreLandscape } from '../../responsive/mobile-tablet';
import { classifyVideoOrientation } from '../../lib/videoAspect';
import { GESTURE_AXIS_LOCK_PX, HORIZONTAL_SEEK_THRESHOLD_PX } from '../../lib/storyAuthorNav';

export type ImmersivePointerGesture = {
  dx: number;
  dy: number;
  axis: 'horizontal' | 'vertical' | null;
  isTap: boolean;
  startedOnControl: boolean;
};

type Props = {
  mediaWidth: number;
  mediaHeight: number;
  mediaUrl: string;
  mediaKind: 'video' | 'image';
  insets?: Partial<ImmersiveLayoutInsets>;
  embedded?: boolean;
  /** Rail de acciones al lado del media en PC (Explorar, Publicaciones, Clips). */
  landscapeRailAside?: boolean;
  onSwipeStart?: (x: number, y: number) => void;
  onSwipeEnd?: (x: number, y: number) => void;
  /** Pointer unificado (touch/mouse/lápiz) con eje bloqueado. */
  onPointerGesture?: (info: ImmersivePointerGesture) => void;
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

function isImmersiveControlTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-lb-gesture-pass]')) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, label, [role="button"], [role="link"], .lb-media-mute-fab, .lb-action-rail, .lb-gift-action',
    ),
  );
}

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
  landscapeRailAside = true,
  onSwipeStart,
  onSwipeEnd,
  onPointerGesture,
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
  const [isDesktopStage, setIsDesktopStage] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false,
  );
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
  const railAside = useRailAside && !fillCover && !deviceLandscape && isDesktopStage;

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
      setIsDesktopStage(desktop);
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
                  left: exploreLandscape.mediaRightReservePx + 4,
                  right: exploreLandscape.stageInsetLeftPx,
                }
              : insets,
          desktop,
          useRailAside && !nextFill && !nextDeviceLandscape && desktop,
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

  const pointerRef = useRef<{
    id: number;
    x: number;
    y: number;
    axis: 'horizontal' | 'vertical' | null;
    onControl: boolean;
  } | null>(null);

  function endPointerGesture(event: PointerEvent<HTMLDivElement>) {
    const gesture = pointerRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    pointerRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const axis =
      gesture.axis ??
      (absX < GESTURE_AXIS_LOCK_PX && absY < GESTURE_AXIS_LOCK_PX
        ? null
        : absX > absY
          ? 'horizontal'
          : 'vertical');
    const isTap = !gesture.axis && absX < HORIZONTAL_SEEK_THRESHOLD_PX && absY < HORIZONTAL_SEEK_THRESHOLD_PX;
    onPointerGesture?.({
      dx,
      dy,
      axis,
      isTap,
      startedOnControl: gesture.onControl,
    });
    if (!gesture.onControl) onSwipeEnd?.(event.clientX, event.clientY);
  }

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
        style={{ touchAction: 'none' }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          const onControl = isImmersiveControlTarget(event.target);
          pointerRef.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            axis: null,
            onControl,
          };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* ignore */
          }
          if (!onControl) onSwipeStart?.(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          const gesture = pointerRef.current;
          if (!gesture || gesture.id !== event.pointerId) return;
          const dx = event.clientX - gesture.x;
          const dy = event.clientY - gesture.y;
          const absX = Math.abs(dx);
          const absY = Math.abs(dy);
          if (!gesture.axis) {
            if (absX < GESTURE_AXIS_LOCK_PX && absY < GESTURE_AXIS_LOCK_PX) return;
            gesture.axis = absX > absY ? 'horizontal' : 'vertical';
          }
          if (gesture.axis === 'horizontal') event.preventDefault();
        }}
        onPointerUp={endPointerGesture}
        onPointerCancel={endPointerGesture}
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
          {railAside && sideChrome ? (
            <div className="lb-immersive-rail-aside shrink-0">{sideChrome}</div>
          ) : null}
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
        </div>
      </div>

      {/* Teléfono girado: rail al lado izquierdo del media. */}
      {deviceLandscape && !railAside && sideChrome ? (
        <div className="lb-immersive-edge-rail pointer-events-none absolute top-1/2 z-40 -translate-y-1/2 [&_.pointer-events-auto]:pointer-events-auto">
          {sideChrome}
        </div>
      ) : null}

      {bottomChrome}
    </div>
  );
}
