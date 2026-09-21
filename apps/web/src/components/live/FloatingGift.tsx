import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { playGiftAlert } from '../../lib/alertSound';
import { giftMotionFor } from '../../lib/giftAnimations';
import { findLiveGift, GIFT_LEVEL_FX, clampGiftAnimScale, type GiftLevel, type LiveGift } from '../../lib/liveboomGifts';
import { isGlobalBoomAnimation, showBoomAnimation, boomAnimationEndedEvent } from '../../lib/boomAnimations';
import {
  giftLayoutDeviceFromViewport,
  giftLayoutMediaStyle,
  giftLayoutVariantFor,
  giftLiveFormatFromAspect,
  giftPlaybackLiveFormat,
  isGiftLayoutBleed,
  isGiftLayoutVariantId,
  resolveGiftLayoutCell,
  type GiftLayoutSlot,
  type GiftLayoutVariantId,
} from '../../lib/giftLayout';
import type { LiveAspectRatio } from '../../lib/liveAspectRatio';
import { GiftLayoutMedia } from '../gifts/GiftLayoutMedia';
import { giftPlaybackDurationMs, giftPlaybackSrc } from '../../lib/giftMedia';
import { TRANSPARENT_VIDEO_POSTER } from '../../lib/videoPoster';

/** Fallback cuando el catálogo no trae width/height: todas las animaciones de regalo son 9:16. */
const GIFT_ANIM_FALLBACK_W = 720;
const GIFT_ANIM_FALLBACK_H = 1280;

function resolveGiftMediaSize(
  width?: number,
  height?: number,
  preferPortrait916 = false,
): { width: number; height: number; fromFallback: boolean } {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w > 1 && h > 1) {
    // En LIVE/chat 9:16 el catálogo a veces guarda 1920×1080 por error; usamos 9:16 hasta el intrínseco.
    if (preferPortrait916 && w > h) {
      return { width: GIFT_ANIM_FALLBACK_W, height: GIFT_ANIM_FALLBACK_H, fromFallback: true };
    }
    return { width: w, height: h, fromFallback: false };
  }
  if (preferPortrait916) {
    return { width: GIFT_ANIM_FALLBACK_W, height: GIFT_ANIM_FALLBACK_H, fromFallback: true };
  }
  return { width: 0, height: 0, fromFallback: false };
}

export function GiftVisual({
  gift,
  size = 16,
  className = '',
  animated = false,
}: {
  gift: LiveGift | null | undefined;
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  if (animated && gift?.video) {
    return (
      <GiftAnimThumb
        src={gift.video}
        alt={gift.name}
        size={size}
        className={className}
      />
    );
  }
  if (gift?.image) {
    return (
      <img
        src={gift.image}
        alt={gift.name}
        width={size}
        height={size}
        className={`inline-block shrink-0 object-contain ${className}`}
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ fontSize: size, lineHeight: 1 }}
    >
      {gift?.emoji || '🎁'}
    </span>
  );
}

function GiftAnimThumb({
  src,
  alt,
  size,
  className,
}: {
  src: string;
  alt: string;
  size: number;
  className: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tryPlay = () => {
      el.muted = true;
      void el.play().catch(() => undefined);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) tryPlay();
        else el.pause();
      },
      { threshold: 0.01 },
    );
    io.observe(el);
    tryPlay();
    el.addEventListener('loadeddata', tryPlay);
    el.addEventListener('canplay', tryPlay);
    return () => {
      io.disconnect();
      el.removeEventListener('loadeddata', tryPlay);
      el.removeEventListener('canplay', tryPlay);
    };
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
      poster={TRANSPARENT_VIDEO_POSTER}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      className={`inline-block shrink-0 bg-transparent object-contain ${className}`}
      style={{ width: size, height: size, background: 'transparent' }}
      aria-label={alt}
    />
  );
}

export function GiftIcon({
  giftId,
  size = 16,
  animated = false,
}: {
  giftId?: string;
  size?: number;
  animated?: boolean;
}) {
  const gift = findLiveGift(giftId);
  return <GiftVisual gift={gift} size={size} animated={animated} />;
}

function GiftVideoBurst({
  src,
  senderName,
  combo,
  animScale = 0.72,
  fillViewport = false,
  fillParent = false,
  /** LIVE vertical: marco 9:16 contenido en el stage (estilo Messenger), no full desktop. */
  frame916 = false,
  slot,
  volume = 1,
  durationMs,
  mediaWidth,
  mediaHeight,
  onComplete,
}: {
  src: string;
  senderName?: string;
  combo?: number;
  animScale?: number;
  fillViewport?: boolean;
  /** Chat: llena el hilo, no toda la ventana. */
  fillParent?: boolean;
  frame916?: boolean;
  slot?: GiftLayoutSlot;
  volume?: number;
  durationMs?: number;
  mediaWidth?: number;
  mediaHeight?: number;
  onComplete?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const scale = clampGiftAnimScale(animScale);
  const catalogSize = resolveGiftMediaSize(mediaWidth, mediaHeight, frame916);
  const [playbackSize, setPlaybackSize] = useState(catalogSize);

  useEffect(() => {
    setPlaybackSize(resolveGiftMediaSize(mediaWidth, mediaHeight, frame916));
  }, [src, mediaWidth, mediaHeight, frame916]);

  const mw = playbackSize.width;
  const mh = playbackSize.height;
  const hasAspect = mw > 1 && mh > 1;
  const portrait = hasAspect ? mh >= mw : frame916;
  const aspectRatio = hasAspect ? `${mw} / ${mh}` : frame916 ? '9 / 16' : undefined;

  // En LIVE 9:16 evitamos cover/global: el video queda en el marco vertical del stage.
  const stageSlot =
    frame916 && slot && (slot.displayArea === 'global' || slot.fullscreenMode === 'global')
      ? {
          ...slot,
          displayArea: 'live' as const,
          fullscreenMode: 'none' as const,
          fit: slot.fit === 'cover' ? ('contain' as const) : slot.fit,
        }
      : slot;

  const bleed = stageSlot ? isGiftLayoutBleed(stageSlot) : fillViewport && !frame916;
  const layoutStyle = stageSlot
    ? giftLayoutMediaStyle(stageSlot, { width: mw || undefined, height: mh || undefined })
    : undefined;
  const containInBox = fillViewport || fillParent || frame916;
  const mediaStyle = layoutStyle
    ? { ...layoutStyle, background: 'transparent' as const }
    : containInBox
      ? {
          background: 'transparent' as const,
          aspectRatio,
          width: portrait || frame916 ? 'auto' : 'min(100%, 100%)',
          height: portrait || frame916 || !hasAspect ? '100%' : 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain' as const,
          objectPosition: 'center',
        }
      : hasAspect
        ? {
            width: portrait ? 'auto' : `${scale * 100}%`,
            height: portrait ? `${scale * 100}%` : 'auto',
            aspectRatio,
            background: 'transparent' as const,
            objectFit: 'contain' as const,
          }
        : { width: `${scale * 100}%`, height: `${scale * 100}%`, background: 'transparent' };
  const useFillClass = (fillViewport || frame916) && !stageSlot && !fillParent;
  const pinToViewport = Boolean(
    !frame916 &&
      (fillViewport ||
        (stageSlot && (stageSlot.displayArea === 'global' || stageSlot.fullscreenMode === 'global'))) &&
      !fillParent,
  );

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete?.();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let durationTimer = 0;
    const capMs = durationMs && durationMs > 400 ? durationMs : 32_000;
    const hardCapTimer = window.setTimeout(finish, capMs);

    const syncSize = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw > 1 && vh > 1) {
        setPlaybackSize({ width: vw, height: vh, fromFallback: false });
      }
    };

    const startPlayback = () => {
      if (doneRef.current) return;
      syncSize();
      video.volume = Math.min(1, Math.max(0, volume));
      video.muted = true;
      const playPromise = video.play();
      void Promise.resolve(playPromise)
        .then(() => {
          video.muted = false;
          video.volume = Math.min(1, Math.max(0, volume));
          return video.play();
        })
        .catch(() => {
          video.muted = false;
          video.volume = Math.min(1, Math.max(0, volume));
          return video.play();
        })
        .catch(() => {
          video.muted = true;
          return video.play();
        })
        .catch((error) => {
          console.warn('[gift-video] play failed', error);
          finish();
        });
      window.clearTimeout(durationTimer);
      const fromEl =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 + 800 : capMs;
      durationTimer = window.setTimeout(finish, Math.min(32_000, Math.max(fromEl, capMs)));
    };

    const onCanPlay = () => startPlayback();
    const onLoadedData = () => {
      if (!doneRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        startPlayback();
      }
    };
    const onLoadedMeta = () => syncSize();
    const onError = () => {
      console.warn('[gift-video] load failed', src);
      finish();
    };

    video.addEventListener('loadedmetadata', onLoadedMeta);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplaythrough', onCanPlay);
    video.addEventListener('error', onError);
    video.load();

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMeta);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplaythrough', onCanPlay);
      video.removeEventListener('error', onError);
      window.clearTimeout(hardCapTimer);
      window.clearTimeout(durationTimer);
      finish();
    };
  }, [src, volume, durationMs]);

  return (
    <motion.div
      className={`pointer-events-none flex flex-col items-center justify-center ${
        pinToViewport
          ? 'fixed inset-0 z-[114]'
          : 'absolute inset-0 z-[60]'
      } ${bleed ? 'lb-gift-layout-stage--bleed' : ''} ${frame916 ? 'lb-gift-burst-frame916' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={TRANSPARENT_VIDEO_POSTER}
        className={`lb-gift-burst-video bg-transparent ${
          useFillClass ? 'lb-gift-burst-video--fill object-contain' : 'lb-gift-layout-media'
        }`}
        style={mediaStyle}
        playsInline
        muted
        autoPlay
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        controls={false}
        onEnded={finish}
      />
      {senderName ? (
        <span className="absolute bottom-[12%] z-[61] text-[11px] font-semibold text-cyan-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
          {senderName}
          {combo && combo > 1 ? (
            <span className="ml-1 font-black text-amber-300">x{combo}</span>
          ) : null}
        </span>
      ) : combo && combo > 1 ? (
        <span className="absolute bottom-[12%] z-[61] text-sm font-black text-amber-300 drop-shadow">
          x{combo}
        </span>
      ) : null}
    </motion.div>
  );
}

function GiftStillBurst({
  src,
  emoji,
  senderName,
  combo,
  slot,
  globalArea,
  frame916 = false,
  durationMs,
  mediaWidth,
  mediaHeight,
  onComplete,
}: {
  src?: string;
  emoji?: string;
  senderName?: string;
  combo?: number;
  slot: GiftLayoutSlot;
  globalArea: boolean;
  frame916?: boolean;
  durationMs: number;
  mediaWidth?: number;
  mediaHeight?: number;
  onComplete?: () => void;
}) {
  const doneRef = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onComplete?.();
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onComplete]);

  const size = resolveGiftMediaSize(mediaWidth, mediaHeight, frame916);
  const stageSlot =
    frame916 && (slot.displayArea === 'global' || slot.fullscreenMode === 'global')
      ? {
          ...slot,
          displayArea: 'live' as const,
          fullscreenMode: 'none' as const,
          fit: slot.fit === 'cover' ? ('contain' as const) : slot.fit,
        }
      : slot;

  return (
    <motion.div
      className={`pointer-events-none ${
        globalArea && !frame916 ? 'fixed inset-0 z-[114]' : 'absolute inset-0 z-[60]'
      } ${isGiftLayoutBleed(stageSlot) ? 'lb-gift-layout-stage--bleed' : ''} ${
        frame916 ? 'lb-gift-burst-frame916' : ''
      }`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <GiftLayoutMedia
        src={src}
        emoji={emoji}
        slot={stageSlot}
        mediaWidth={size.width || undefined}
        mediaHeight={size.height || undefined}
      />
      {senderName ? (
        <span className="absolute bottom-[12%] z-[61] text-[11px] font-semibold text-cyan-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
          {senderName}
          {combo && combo > 1 ? (
            <span className="ml-1 font-black text-amber-300">x{combo}</span>
          ) : null}
        </span>
      ) : null}
    </motion.div>
  );
}

type FloatingGiftProps = {
  giftId?: string;
  senderName?: string;
  left?: number;
  onComplete?: () => void;
  /** Menos partículas/FX para espectadores bajo carga. */
  lite?: boolean;
  combo?: number;
  /** Mensajes / feed: si no hay layoutContext, llena el viewport como antes. */
  fillViewport?: boolean;
  /** Formato real del LIVE activo (9:16 o 16:9). */
  liveAspect?: LiveAspectRatio;
  /** Variante de colocación publicada (LIVE, chat, clip, etc.). */
  layoutContext?: GiftLayoutVariantId;
};

export function FloatingGift({ giftId, senderName, left = 50, onComplete, lite, combo, fillViewport = false, liveAspect, layoutContext }: FloatingGiftProps) {
  const gift = findLiveGift(giftId);
  const level = (gift?.level || 1) as GiftLevel;
  const fx = GIFT_LEVEL_FX[level];
  const motionSpec = giftMotionFor(giftId, level);
  const isBig = !lite && level >= 3;
  const particles = lite
    ? []
    : Array.from({ length: Math.min(motionSpec.particleCount, 12) }, (_, i) => i);
  const sizePx = Math.round(42 + Math.min(fx.screenPct, 55) * 0.9);
  const x = Math.min(78, Math.max(18, left));
  const globalAnim = isGlobalBoomAnimation(giftId);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (gift?.video || globalAnim) return;
    playGiftAlert(level, giftId);
  }, [level, giftId, gift?.video, globalAnim]);

  useEffect(() => {
    if (!globalAnim || !giftId) return;
    showBoomAnimation(giftId);
    const onEnd = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id === giftId) onCompleteRef.current?.();
    };
    window.addEventListener(boomAnimationEndedEvent(), onEnd);
    return () => window.removeEventListener(boomAnimationEndedEvent(), onEnd);
  }, [giftId, globalAnim]);

  if (globalAnim) return null;

  const videoSrc = giftPlaybackSrc(gift?.media, gift?.video);
  const device = giftLayoutDeviceFromViewport();
  const variant =
    layoutContext && isGiftLayoutVariantId(layoutContext)
      ? layoutContext
      : liveAspect
        ? giftLayoutVariantFor('live', { liveAspect })
        : undefined;
  const useLayout = Boolean(variant) || !fillViewport;

  if (useLayout && (gift?.video || gift?.image)) {
    const cell = resolveGiftLayoutCell({
      layout: gift.giftLayout,
      animScale: gift.animScale,
      device,
      liveFormat: liveAspect ? giftLiveFormatFromAspect(liveAspect) : giftPlaybackLiveFormat(device),
      variant,
    });
    const chatLike = variant === 'chat' || variant === 'llamadas_voz' || variant === 'llamadas_video';
    const frame916 = variant === 'live_9_16' || liveAspect === '9:16';
    const unconfiguredChatOrCall =
      chatLike && (cell.source === 'legacy' || cell.source === 'default');
    if (unconfiguredChatOrCall && videoSrc) {
      return (
        <AnimatePresence>
          <GiftVideoBurst
            src={videoSrc}
            senderName={senderName}
            combo={combo}
            animScale={clampGiftAnimScale(gift.animScale, level)}
            fillParent
            frame916
            volume={gift.media?.volume ?? 1}
            durationMs={giftPlaybackDurationMs(gift.media)}
            mediaWidth={gift.media?.width}
            mediaHeight={gift.media?.height}
            onComplete={onComplete}
          />
        </AnimatePresence>
      );
    }
    const slot = cell.slot;
    const globalArea = slot.displayArea === 'global' || slot.fullscreenMode === 'global';
    // LIVE 9:16: siempre dentro del stage vertical (no portal al desktop completo).
    const pinGlobal = globalArea && !chatLike && !frame916;
    const burst = videoSrc ? (
      <AnimatePresence>
        <GiftVideoBurst
          src={videoSrc}
          senderName={senderName}
          combo={combo}
          animScale={clampGiftAnimScale(gift.animScale, level)}
          fillViewport={pinGlobal}
          fillParent={chatLike && globalArea}
          frame916={frame916}
          slot={slot}
          volume={gift.media?.volume ?? 1}
          durationMs={giftPlaybackDurationMs(gift.media)}
          mediaWidth={gift.media?.width}
          mediaHeight={gift.media?.height}
          onComplete={onComplete}
        />
      </AnimatePresence>
    ) : (
      <AnimatePresence>
        <GiftStillBurst
          src={gift.image}
          emoji={gift.emoji}
          senderName={senderName}
          combo={combo}
          slot={slot}
          globalArea={pinGlobal}
          frame916={frame916}
          durationMs={Math.max(1200, fx.duration * 1000)}
          mediaWidth={gift.media?.width}
          mediaHeight={gift.media?.height}
          onComplete={onComplete}
        />
      </AnimatePresence>
    );
    if (pinGlobal && typeof document !== 'undefined') {
      return createPortal(burst, document.body);
    }
    return burst;
  }

  if (fillViewport && videoSrc && gift) {
    const frame916 = liveAspect === '9:16';
    return (
      <AnimatePresence>
        <GiftVideoBurst
          src={videoSrc}
          senderName={senderName}
          combo={combo}
          animScale={clampGiftAnimScale(gift.animScale, level)}
          fillViewport={!frame916}
          frame916={frame916}
          volume={gift.media?.volume ?? 1}
          durationMs={giftPlaybackDurationMs(gift.media)}
          mediaWidth={gift.media?.width}
          mediaHeight={gift.media?.height}
          onComplete={onComplete}
        />
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="pointer-events-none absolute z-40 flex flex-col items-center"
        style={{
          left: gift?.video ? undefined : isBig ? `${x}%` : '12%',
          top: isBig ? '22%' : '30%',
          width: gift?.video ? undefined : isBig ? '62%' : '38%',
          maxWidth: gift?.video ? undefined : 220,
          translate: gift?.video ? undefined : isBig ? '-50% 0' : '0 0',
        }}
        initial={motionSpec.initial}
        animate={motionSpec.animate}
        transition={{ duration: fx.duration, ease: 'easeOut' }}
        onAnimationComplete={() => onComplete?.()}
      >
        {isBig ? (
          <motion.div
            className="absolute inset-x-[-18%] top-[-24%] -z-10 h-[140%] rounded-full bg-[radial-gradient(circle,rgba(0,240,255,0.28),rgba(255,0,85,0.18),transparent_70%)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.55, 0] }}
            transition={{ duration: fx.duration }}
          />
        ) : null}
        {particles.map((i) => (
          <motion.span
            key={i}
            className="absolute text-sm"
            style={{ left: `${12 + ((i * 11) % 76)}%`, top: `${(i * 9) % 40}%` }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0.95, 0],
              y: [0, -36 - i * 5],
              x: [0, i % 2 === 0 ? 18 : -18],
              scale: [0.6, 1.1, 0.7],
            }}
            transition={{ duration: fx.duration * 0.9, delay: 0.08 * i }}
          >
            {motionSpec.particles[i % motionSpec.particles.length]}
          </motion.span>
        ))}
        {motionSpec.trail ? (
          <motion.span
            className="absolute text-base"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: [0, 0.8, 0], x: [-30, 10, 40], y: [0, -20, -40] }}
            transition={{ duration: fx.duration * 0.7 }}
          >
            {motionSpec.trail}
          </motion.span>
        ) : null}
        <span className="relative drop-shadow-[0_0_18px_rgba(0,240,255,0.65)]">
          <GiftVisual gift={gift} size={sizePx} />
          {combo && combo > 1 ? (
            <span className="absolute -right-2 -top-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[11px] font-black text-zinc-950 shadow-lg">
              x{combo}
            </span>
          ) : null}
        </span>
        {senderName ? (
          <span className="mt-1 text-[11px] font-semibold text-cyan-200 drop-shadow">{senderName}</span>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
