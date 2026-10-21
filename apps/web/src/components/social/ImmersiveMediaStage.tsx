import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { TRANSPARENT_VIDEO_POSTER } from '../../lib/videoPoster';
import {
  computeImmersiveMediaBox,
  immersiveMediaBoxStyle,
  usesImmersiveAsideRail,
  type ImmersiveLayoutInsets,
} from '../../lib/immersiveMediaLayout';
import { exploreLandscape } from '../../responsive/mobile-tablet';
import { isTouchPortraitViewport } from '../../responsive/viewport';
import { classifyVideoOrientation } from '../../lib/videoAspect';
import { GESTURE_AXIS_LOCK_PX, HORIZONTAL_SEEK_THRESHOLD_PX } from '../../lib/storyAuthorNav';

export type ImmersivePointerGesture = {
  dx: number;
  dy: number;
  axis: 'horizontal' | 'vertical' | null;
  isTap: boolean;
  startedOnControl: boolean;
};

/** Carta del video anterior o siguiente. Solo Explorar la usa. */
export type DeckPeekMedia = {
  url: string;
  kind: 'video' | 'image';
  poster?: string | null;
};

type Props = {
  mediaWidth: number;
  mediaHeight: number;
  mediaUrl: string;
  mediaKind: 'video' | 'image';
  /**
   * APK/AAB (Android WebView): el backdrop <video> nunca se reproduce y sin
   * atributo poster el WebView pinta su "default video poster" (play gigante).
   * Solo se aplica en plataforma nativa; en web el backdrop queda igual.
   */
  posterUrl?: string | null;
  insets?: Partial<ImmersiveLayoutInsets>;
  /** Rail de acciones al lado del media en PC (Explorar, Publicaciones, Clips). */
  landscapeRailAside?: boolean;
  embedded?: boolean;
  /** El contenido sigue el dedo en Boom Clip, Flash Boom y Explorar. */
  fingerFollow?: { vertical?: boolean; horizontal?: boolean };
  /**
   * Solo Explorar: al arrastrar en vertical, el video anterior y el siguiente
   * entran pegados como cartas. Sin esta prop el gesto queda igual.
   */
  cardDeck?: { prev?: DeckPeekMedia | null; next?: DeckPeekMedia | null } | null;
  onSwipeStart?: (x: number, y: number) => void;
  onSwipeEnd?: (x: number, y: number) => void;
  /** Pointer unificado (touch/mouse/lápiz) con eje bloqueado. */
  onPointerGesture?: (info: ImmersivePointerGesture) => void;
  /** Arrastre en vivo (tras bloquear eje), antes de soltar. Opcional: deslizar encadenado. */
  onPointerDrag?: (info: { dx: number; dy: number; axis: 'horizontal' | 'vertical' }) => void;
  /** Flash Boom: true al tocar el medio, false al soltar. No se dispara en botones. */
  onHoldChange?: (holding: boolean) => void;
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

const IMMERSIVE_INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, label, [role="button"], [role="link"], .lb-media-mute-fab, .lb-action-rail, .lb-gift-action, .lb-gift-history, .lb-views-indicator';

function isInteractiveHit(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(IMMERSIVE_INTERACTIVE_SELECTOR));
}

/** Rail / mute / comentarios: no son gesto. Zonas `data-lb-gesture-pass` sí (swipe), pero el click nativo debe llegar al botón. */
function DeckPeekCard({ item, place }: { item: DeckPeekMedia; place: 'prev' | 'next' }) {
  const poster = item.poster && !item.poster.startsWith('data:') ? item.poster : undefined;
  const [frameReady, setFrameReady] = useState(false);
  return (
    <div
      className={`lb-explore-deck__peek pointer-events-none absolute inset-x-0 h-full overflow-hidden bg-black ${
        place === 'next' ? 'top-full' : 'bottom-full'
      }`}
      aria-hidden
    >
      {item.kind === 'image' ? (
        <img src={item.url} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <>
          {poster ? (
            <img
              src={poster}
              alt=""
              draggable={false}
              className={`absolute inset-0 h-full w-full object-cover ${frameReady ? 'opacity-0' : ''}`}
            />
          ) : null}
          <video
            src={item.url}
            poster={poster}
            muted
            playsInline
            preload="auto"
            controls={false}
            className={`h-full w-full object-cover ${poster && !frameReady ? 'opacity-0' : ''}`}
            tabIndex={-1}
            onLoadedData={() => setFrameReady(true)}
          />
        </>
      )}
    </div>
  );
}

function isImmersiveControlTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-lb-gesture-pass]')) return false;
  return isInteractiveHit(target);
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
  posterUrl = null,
  insets,
  embedded = false,
  landscapeRailAside = true,
  onSwipeStart,
  onSwipeEnd,
  onPointerGesture,
  onPointerDrag,
  onHoldChange,
  onWheel,
  fingerFollow,
  cardDeck = null,
  children,
  mediaOverlay,
  topChrome,
  bottomChrome,
  sideChrome,
  fillMode = 'auto',
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const deckBusyRef = useRef(false);
  const deckSettlingRef = useRef(false);
  const mediaBoxRef = useRef<HTMLDivElement>(null);
  const [fillCover, setFillCover] = useState(false);
  const [deviceLandscape, setDeviceLandscape] = useState(false);
  const [isDesktopStage, setIsDesktopStage] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 && !isTouchPortraitViewport() : false,
  );
  const [box, setBox] = useState(() =>
    computeImmersiveMediaBox(
      mediaWidth || 9,
      mediaHeight || 16,
      typeof window !== 'undefined' ? window.innerWidth : 390,
      typeof window !== 'undefined' ? window.innerHeight : 844,
      insets,
      typeof window !== 'undefined' ? window.innerWidth >= 1024 && !isTouchPortraitViewport() : false,
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
  /** Solo vertical llena la pantalla. Al girar, el archivo se encaja (contain). */
  const mediaCover = fillCover && !deviceLandscape;
  /** 16:9 en el celular vertical: el rail sale del video y se apoya en la franja negra. */
  const railInLetterbox =
    orientation === 'landscape' && !deviceLandscape && !railAside && !mediaCover && Boolean(sideChrome);
  const [letterboxBand, setLetterboxBand] = useState<{ top: number; height: number } | null>(null);
  const parkRailOutside = railInLetterbox && (letterboxBand?.height ?? 0) >= 64;

  useEffect(() => {
    const host = stageRef.current;
    if (!host) return;

    const portraitMq =
      typeof window !== 'undefined' ? window.matchMedia('(orientation: portrait)') : null;

    const update = () => {
      const rect = host.getBoundingClientRect();
      const desktop = rect.width >= 1024 && !isTouchPortraitViewport();
      const devicePortrait =
        portraitMq?.matches ?? rect.height >= rect.width;
      const nextDeviceLandscape = !desktop && !devicePortrait;
      // Vertical: Explorar/clips llenan la pantalla. Al girar, todo se encaja en 16:9.
      const containMode = fillMode === 'contain';
      const nextFill = !containMode && !desktop && devicePortrait;
      setFillCover(nextFill);
      setDeviceLandscape(nextDeviceLandscape);
      setIsDesktopStage(desktop);
      setBox(
        computeImmersiveMediaBox(
          mediaWidth || 9,
          mediaHeight || 16,
          Math.max(rect.width, 1),
          Math.max(rect.height, 1),
          nextFill
            ? {
                ...insets,
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
              }
              : nextDeviceLandscape
              ? {
                  ...insets,
                  top: exploreLandscape.stageInsetTopPx,
                  bottom: exploreLandscape.stageInsetBottomPx,
                  left: exploreLandscape.stageInsetLeftPx,
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

  useLayoutEffect(() => {
    if (!railInLetterbox) {
      setLetterboxBand(null);
      return;
    }
    const stage = stageRef.current;
    const media = mediaBoxRef.current;
    if (!stage || !media) return;
    const stageRect = stage.getBoundingClientRect();
    const mediaRect = media.getBoundingClientRect();
    const top = Math.max(0, mediaRect.bottom - stageRect.top + 8);
    const height = Math.max(0, stageRect.bottom - mediaRect.bottom - 10);
    setLetterboxBand((prev) =>
      prev && Math.abs(prev.top - top) < 1 && Math.abs(prev.height - height) < 1 ? prev : { top, height },
    );
  }, [railInLetterbox, box.width, box.height, deviceLandscape, mediaCover]);

  // Distancia del borde superior del escenario al cuadro del media (16:9 centrado).
  // Solo la usan los estilos que quieren anclar controles arriba del escenario.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const media = mediaBoxRef.current;
    if (!stage || !media) return;
    const mediaRect = media.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const gaps = {
      '--lb-media-box-gap-top': `${Math.max(0, Math.round(mediaRect.top - stageRect.top))}px`,
      '--lb-media-box-gap-left': `${Math.max(0, Math.round(mediaRect.left - stageRect.left))}px`,
    };
    for (const [name, value] of Object.entries(gaps)) {
      if (media.style.getPropertyValue(name) !== value) media.style.setProperty(name, value);
    }
  });

  useLayoutEffect(() => {
    if (!deckSettlingRef.current) return;
    const node = deckRef.current;
    if (node) {
      node.style.transition = 'none';
      node.style.transform = '';
    }
    deckSettlingRef.current = false;
    deckBusyRef.current = false;
  }, [mediaUrl]);

  const pointerRef = useRef<{
    id: number;
    x: number;
    y: number;
    axis: 'horizontal' | 'vertical' | null;
    onControl: boolean;
    interactive: boolean;
  } | null>(null);
  const holdTimerRef = useRef(0);
  const holdingRef = useRef(false);

  function setHolding(next: boolean) {
    if (holdingRef.current === next) return;
    holdingRef.current = next;
    onHoldChange?.(next);
  }

  function clearHoldTimer() {
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = 0;
  }

  function edgeBackActive() {
    return document.documentElement.dataset.lbEdgeBack === '1';
  }

  function motionEl() {
    return cardDeck ? deckRef.current : stageRef.current;
  }

  function paintFollow(axis: 'horizontal' | 'vertical' | null, dx: number, dy: number) {
    const el = motionEl();
    if (!el || !fingerFollow || !axis) return;
    if (axis === 'vertical' && fingerFollow.vertical) {
      let y = dy;
      if (cardDeck) {
        const limit = el.getBoundingClientRect().height || window.innerHeight;
        if (y < 0 && !cardDeck.next) y *= 0.32;
        if (y > 0 && !cardDeck.prev) y *= 0.32;
        const cap = (y < 0 && cardDeck.next) || (y > 0 && cardDeck.prev) ? limit : limit * 0.28;
        y = Math.max(-cap, Math.min(cap, y));
      }
      el.style.transition = 'none';
      el.style.transform = `translate3d(0, ${y}px, 0)`;
      return;
    }
    if (axis === 'horizontal' && fingerFollow.horizontal) {
      const node = cardDeck ? stageRef.current : el;
      if (!node) return;
      node.style.transition = 'none';
      node.style.transform = `translate3d(${dx}px, 0, 0)`;
    }
  }

  function releaseFollow() {
    const el = motionEl();
    if (!el || !el.style.transform) return;
    el.style.transition = cardDeck
      ? 'transform 0.28s cubic-bezier(0.22, 0.8, 0.2, 1)'
      : 'transform 0.2s ease-out';
    el.style.transform = '';
    window.setTimeout(() => {
      if (motionEl() === el) el.style.transition = '';
    }, cardDeck ? 300 : 220);
  }

  function slideDeck(dir: 1 | -1, done: () => void) {
    const el = deckRef.current;
    if (!el) {
      done();
      return;
    }
    deckBusyRef.current = true;
    deckSettlingRef.current = true;
    el.style.transition = 'transform 0.26s cubic-bezier(0.22, 0.8, 0.2, 1)';
    el.style.transform = `translate3d(0, ${dir * -100}%, 0)`;
    window.setTimeout(() => {
      done();
      window.setTimeout(() => {
        if (!deckSettlingRef.current) {
          deckBusyRef.current = false;
          return;
        }
        const node = deckRef.current;
        if (node) {
          node.style.transition = 'none';
          node.style.transform = '';
        }
        deckSettlingRef.current = false;
        deckBusyRef.current = false;
      }, 48);
    }, 250);
  }

  function endPointerGesture(event: PointerEvent<HTMLDivElement>) {
    const gesture = pointerRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const stolen = edgeBackActive();
    pointerRef.current = null;
    clearHoldTimer();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    if (stolen || gesture.onControl) {
      releaseFollow();
      setHolding(false);
      return;
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
    const endX = event.clientX;
    const endY = event.clientY;
    const isTap = !gesture.axis && absX < HORIZONTAL_SEEK_THRESHOLD_PX && absY < HORIZONTAL_SEEK_THRESHOLD_PX;
    const info: ImmersivePointerGesture = {
      dx,
      dy,
      axis,
      isTap,
      startedOnControl: gesture.onControl,
    };
    const deckDir =
      cardDeck && axis === 'vertical' && absY >= 36 && absY > absX
        ? dy < 0 && cardDeck.next
          ? 1
          : dy > 0 && cardDeck.prev
            ? -1
            : 0
        : 0;
    const finish = () => {
      onPointerGesture?.(info);
      if (!gesture.onControl) onSwipeEnd?.(endX, endY);
      setHolding(false);
    };
    if (deckDir !== 0) {
      slideDeck(deckDir as 1 | -1, finish);
      return;
    }
    releaseFollow();
    finish();
  }

  const stageTree = (
    <div
      ref={stageRef}
      className={`lb-immersive-stage relative flex min-h-0 flex-1 flex-col overflow-hidden ${
        embedded ? 'h-full min-h-full' : 'h-[100dvh] max-h-[100dvh]'
      }`}
      style={{ touchAction: 'none' }}
      data-fill={mediaCover ? 'cover' : 'contain'}
      data-device-orientation={deviceLandscape ? 'landscape' : 'portrait'}
      data-rail={parkRailOutside ? 'letterbox' : deviceLandscape ? 'inside' : undefined}
      onPointerDown={(event) => {
        if (deckBusyRef.current) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const onControl = isImmersiveControlTarget(event.target);
        const interactive = isInteractiveHit(event.target);
        pointerRef.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          axis: null,
          onControl,
          interactive,
        };
        if (!interactive) {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* ignore */
          }
        }
        if (!onControl) onSwipeStart?.(event.clientX, event.clientY);
        clearHoldTimer();
        if (!onControl && onHoldChange) {
          const pointerId = event.pointerId;
          holdTimerRef.current = window.setTimeout(() => {
            const current = pointerRef.current;
            if (!current || current.id !== pointerId || current.axis || current.onControl) return;
            if (edgeBackActive()) return;
            setHolding(true);
          }, 160);
        }
      }}
      onPointerMove={(event) => {
        const gesture = pointerRef.current;
        if (!gesture || gesture.id !== event.pointerId || edgeBackActive()) return;
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (!gesture.axis) {
          if (absX < GESTURE_AXIS_LOCK_PX && absY < GESTURE_AXIS_LOCK_PX) return;
          gesture.axis = absX > absY ? 'horizontal' : 'vertical';
          clearHoldTimer();
          setHolding(false);
          if (gesture.interactive && !gesture.onControl) {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              /* ignore */
            }
          }
        }
        paintFollow(gesture.axis, dx, dy);
        if (!gesture.onControl) onPointerDrag?.({ dx, dy, axis: gesture.axis });
        if (gesture.axis === 'horizontal' || gesture.axis === 'vertical') event.preventDefault();
      }}
      onPointerUp={endPointerGesture}
      onPointerCancel={endPointerGesture}
      onWheel={(event) => {
        if (!onWheel) return;
        event.preventDefault();
        if (!cardDeck) {
          onWheel(event.deltaY);
          return;
        }
        if (deckBusyRef.current || Math.abs(event.deltaY) < 24) return;
        const dir = event.deltaY > 0 ? 1 : -1;
        if (dir > 0 ? !cardDeck.next : !cardDeck.prev) return;
        slideDeck(dir, () => onWheel(event.deltaY));
      }}
    >
      {mediaUrl && !mediaCover ? (
        <div className="lb-immersive-backdrop pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {mediaKind === 'video' ? (
            posterUrl && !posterUrl.startsWith('data:') ? (
              <img
                src={posterUrl}
                alt=""
                className="lb-immersive-backdrop__media"
                draggable={false}
              />
            ) : (
              <video
                src={mediaUrl}
                poster={
                  Capacitor.isNativePlatform()
                    ? posterUrl || TRANSPARENT_VIDEO_POSTER
                    : undefined
                }
                className="lb-immersive-backdrop__media"
                muted
                playsInline
                preload="metadata"
                tabIndex={-1}
              />
            )
          ) : (
            <img src={mediaUrl} alt="" className="lb-immersive-backdrop__media" draggable={false} />
          )}
        </div>
      ) : null}

      {topChrome}

      <div
        className={`lb-immersive-stage__center relative z-[1] flex min-h-0 flex-1 items-center justify-center ${
          mediaCover ? 'px-0' : 'px-[max(0.25rem,env(safe-area-inset-left))]'
        }`}
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
            ref={mediaBoxRef}
            className={`lb-immersive-media-box lb-immersive-media-box--${orientation} relative shrink-0 ${
              mediaCover ? 'h-full w-full max-h-full max-w-full' : ''
            }`}
            style={
              mediaCover
                ? { position: 'absolute', inset: 0, width: '100%', height: '100%' }
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
            data-fill={mediaCover ? 'cover' : 'contain'}
          >
            {children}
            {mediaOverlay}
            {!railAside && !parkRailOutside && !(railInLetterbox && letterboxBand === null) && sideChrome ? (
              <div className="pointer-events-none absolute inset-0 z-40 [&_.pointer-events-auto]:pointer-events-auto">
                {sideChrome}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {parkRailOutside && letterboxBand ? (
        <div
          className="lb-immersive-letterbox-rail pointer-events-none absolute z-40 [&_.pointer-events-auto]:pointer-events-auto"
          style={{ top: letterboxBand.top, height: letterboxBand.height }}
        >
          {sideChrome}
        </div>
      ) : null}

      {bottomChrome}
    </div>
  );

  if (!cardDeck) return stageTree;

  return (
    <div ref={deckRef} className="lb-explore-deck relative h-full min-h-0 w-full flex-1">
      {cardDeck.prev ? <DeckPeekCard item={cardDeck.prev} place="prev" /> : null}
      {stageTree}
      {cardDeck.next ? <DeckPeekCard item={cardDeck.next} place="next" /> : null}
    </div>
  );
}
