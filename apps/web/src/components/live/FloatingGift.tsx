import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { playGiftAlert } from '../../lib/alertSound';
import { giftMotionFor } from '../../lib/giftAnimations';
import { findLiveGift, GIFT_LEVEL_FX, type GiftLevel } from '../../lib/liveboomGifts';

export function GiftIcon({
  giftId,
  size = 16,
}: {
  giftId?: string;
  size?: number;
}) {
  const gift = findLiveGift(giftId);
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ fontSize: size }}>
      {gift?.emoji || '🎁'}
    </span>
  );
}

type FloatingGiftProps = {
  giftId?: string;
  senderName?: string;
  left?: number;
  onComplete?: () => void;
};

export function FloatingGift({ giftId, senderName, left = 50, onComplete }: FloatingGiftProps) {
  const gift = findLiveGift(giftId);
  const level = (gift?.level || 1) as GiftLevel;
  const fx = GIFT_LEVEL_FX[level];
  const emoji = gift?.emoji || '🎁';
  const motionSpec = giftMotionFor(giftId, level);
  const isBig = level >= 3;
  const particles = Array.from({ length: Math.min(motionSpec.particleCount, 12) }, (_, i) => i);
  const sizePx = Math.round(42 + Math.min(fx.screenPct, 55) * 0.9);
  const x = Math.min(78, Math.max(18, left));

  useEffect(() => {
    playGiftAlert(level, giftId);
  }, [level, giftId]);

  return (
    <AnimatePresence>
      <motion.div
        className="pointer-events-none absolute z-40 flex flex-col items-center"
        style={{
          left: `${x}%`,
          top: isBig ? '22%' : '30%',
          width: isBig ? '62%' : '46%',
          maxWidth: 280,
          translate: '-50% 0',
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
        <span
          style={{ fontSize: sizePx }}
          className="relative drop-shadow-[0_0_18px_rgba(0,240,255,0.65)]"
        >
          {emoji}
        </span>
        {senderName ? (
          <span className="mt-1 text-[11px] font-semibold text-cyan-200 drop-shadow">{senderName}</span>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
