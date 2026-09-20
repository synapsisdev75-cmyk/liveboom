import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { playGiftAlert } from '../../lib/alertSound';
import { giftMotionFor } from '../../lib/giftAnimations';
import { findLiveGift, GIFT_LEVEL_FX, clampGiftAnimScale, type GiftLevel, type LiveGift } from '../../lib/liveboomGifts';

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
  onComplete,
}: {
  src: string;
  poster?: string;
  senderName?: string;
  combo?: number;
  animScale?: number;
  onComplete?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const [ready, setReady] = useState(false);
  const scale = clampGiftAnimScale(animScale);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete?.();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let durationTimer = 0;
    // Siempre cerrar: evita aguacate/coco pegados si canplaythrough no llega.
    const hardCapTimer = window.setTimeout(finish, 15000);

    const startPlayback = () => {
      if (doneRef.current) return;
      setReady(true);
      video.muted = true;
      const playPromise = video.play();
      void Promise.resolve(playPromise)
        .then(() => {
          video.muted = false;
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
      const durationMs =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : 9000;
      durationTimer = window.setTimeout(finish, durationMs + 600);
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
  }, [src]);

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-[60] flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {!ready && poster ? (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 m-auto bg-transparent object-contain opacity-80"
          style={{ width: `${scale * 100}%`, height: `${scale * 100}%`, background: 'transparent' }}
          draggable={false}
        />
      ) : null}
      <video
        ref={videoRef}
        src={src}
        className="lb-gift-burst-video bg-transparent object-contain"
        style={{ width: `${scale * 100}%`, height: `${scale * 100}%`, background: 'transparent' }}
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

type FloatingGiftProps = {
  giftId?: string;
  senderName?: string;
  left?: number;
  onComplete?: () => void;
  /** Menos partículas/FX para espectadores bajo carga. */
  lite?: boolean;
  combo?: number;
};

export function FloatingGift({ giftId, senderName, left = 50, onComplete, lite, combo }: FloatingGiftProps) {
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

  useEffect(() => {
    // Si el regalo trae video con audio propio, no sumar beep sintético.
    if (gift?.video) return;
    playGiftAlert(level, giftId);
  }, [level, giftId, gift?.video]);

  if (gift?.video) {
    return (
      <AnimatePresence>
        <GiftVideoBurst
          src={gift.video}
          poster={gift.image}
          senderName={senderName}
          combo={combo}
          animScale={clampGiftAnimScale(gift.animScale, level)}
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
