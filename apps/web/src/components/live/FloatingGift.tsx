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
  giftPlaybackLiveFormat,
  isGiftLayoutBleed,
  resolveGiftLayoutSlot,
  type GiftLayoutSlot,
} from '../../lib/giftLayout';
import type { LiveAspectRatio } from '../../lib/liveAspectRatio';
import { GiftLayoutMedia } from '../gifts/GiftLayoutMedia';
import { giftPlaybackDurationMs } from '../../lib/giftMedia';

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
        poster={gift.image}
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
  poster,
  alt,
  size,
  className,
}: {
  src: string;
  poster?: string;
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
      poster={poster}
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
  poster,
  senderName,
  combo,
  animScale = 0.72,
  fillViewport = false,
  slot,
  volume = 1,
  durationMs,
  onComplete,
}: {
  src: string;
  poster?: string;
  senderName?: string;
  combo?: number;
  animScale?: number;
  fillViewport?: boolean;
  slot?: GiftLayoutSlot;
  volume?: number;
  durationMs?: number;
  onComplete?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const [ready, setReady] = useState(false);
  const scale = clampGiftAnimScale(animScale);
  const bleed = slot ? isGiftLayoutBleed(slot) : fillViewport;
  const layoutStyle = slot ? giftLayoutMediaStyle(slot) : undefined;
  const mediaStyle = layoutStyle
    ? { ...layoutStyle, background: 'transparent' as const }
    : fillViewport
      ? { background: 'transparent' as const }
      : { width: `${scale * 100}%`, height: `${scale * 100}%`, background: 'transparent' };
  const useFillClass = fillViewport && !slot;

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

    const startPlayback = () => {
      if (doneRef.current) return;
      setReady(true);
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
    const onError = () => {
      console.warn('[gift-video] load failed', src);
      finish();
    };

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplaythrough', onCanPlay);
    video.addEventListener('error', onError);
    video.load();

    return () => {
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
        fillViewport || (slot && (slot.displayArea === 'global' || slot.fullscreenMode === 'global'))
          ? 'fixed inset-0 z-[114]'
          : 'absolute inset-0 z-[60]'
      } ${bleed ? 'lb-gift-layout-stage--bleed' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {!ready && poster ? (
        <img
          src={poster}
          alt=""
          className={`absolute inset-0 m-auto bg-transparent ${
            useFillClass ? 'lb-gift-burst-video--fill object-contain' : ''
          } ${bleed && !useFillClass ? 'object-cover' : useFillClass ? '' : 'object-contain'}`}
          style={mediaStyle}
          draggable={false}
        />
      ) : null}
      <video
        ref={videoRef}
        src={src}
        className={`lb-gift-burst-video bg-transparent ${
          useFillClass ? 'lb-gift-burst-video--fill object-contain' : 'lb-gift-layout-media'
        }`}
        style={mediaStyle}
        playsInline
        muted
        autoPlay
        preload="auto"
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
  durationMs,
  onComplete,
}: {
  src?: string;
  emoji?: string;
  senderName?: string;
  combo?: number;
  slot: GiftLayoutSlot;
  globalArea: boolean;
  durationMs: number;
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

  return (
    <motion.div
      className={`pointer-events-none ${
        globalArea ? 'fixed inset-0 z-[114]' : 'absolute inset-0 z-[60]'
      } ${isGiftLayoutBleed(slot) ? 'lb-gift-layout-stage--bleed' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <GiftLayoutMedia src={src} poster={src} emoji={emoji} slot={slot} />
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
  /** Mensajes / feed: llena el viewport como en el celular. LIVE sigue usando animScale. */
  fillViewport?: boolean;
  /** Formato real del LIVE activo (9:16 o 16:9). */
  liveAspect?: LiveAspectRatio;
};

export function FloatingGift({ giftId, senderName, left = 50, onComplete, lite, combo, fillViewport = false, liveAspect: _liveAspect }: FloatingGiftProps) {
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

  if (fillViewport) {
    if (gift?.video) {
      return (
        <AnimatePresence>
          <GiftVideoBurst
            src={gift.video}
            poster={gift.image}
            senderName={senderName}
            combo={combo}
            animScale={clampGiftAnimScale(gift.animScale, level)}
          fillViewport
          volume={gift.media?.volume ?? 1}
          durationMs={giftPlaybackDurationMs(gift.media)}
          onComplete={onComplete}
          />
        </AnimatePresence>
      );
    }
  } else if (gift?.video || gift?.image) {
    const device = giftLayoutDeviceFromViewport();
    const slot = resolveGiftLayoutSlot({
      layout: gift.giftLayout,
      animScale: gift.animScale,
      device,
      liveFormat: giftPlaybackLiveFormat(device),
    });
    const globalArea = slot.displayArea === 'global' || slot.fullscreenMode === 'global';
    const burst = gift.video ? (
      <AnimatePresence>
        <GiftVideoBurst
          src={gift.video}
          poster={gift.image}
          senderName={senderName}
          combo={combo}
          animScale={clampGiftAnimScale(gift.animScale, level)}
          fillViewport={globalArea}
          slot={slot}
          volume={gift.media?.volume ?? 1}
          durationMs={giftPlaybackDurationMs(gift.media)}
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
          globalArea={globalArea}
          durationMs={Math.max(1200, fx.duration * 1000)}
          onComplete={onComplete}
        />
      </AnimatePresence>
    );
    if (globalArea && typeof document !== 'undefined') {
      return createPortal(burst, document.body);
    }
    return burst;
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
