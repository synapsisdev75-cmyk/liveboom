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

function levelClass(level: GiftLevel) {
  if (level >= 5) return 'from-amber-400/70 via-fuchsia-600/75 to-cyan-400/60';
  if (level >= 4) return 'from-fuchsia-500/55 via-purple-600/60 to-cyan-400/50';
  if (level >= 3) return 'from-yellow-400/40 via-orange-500/40 to-pink-500/40';
  if (level >= 2) return 'from-cyan-400/25 to-fuchsia-500/25';
  return 'from-white/10 to-transparent';
}

export function FloatingGift({ giftId, senderName, left = 48, onComplete }: FloatingGiftProps) {
  const gift = findLiveGift(giftId);
  const level = (gift?.level || 1) as GiftLevel;
  const fx = GIFT_LEVEL_FX[level];
  const emoji = gift?.emoji || '🎁';
  const name = gift?.name || 'Regalo';
  const sizePx = Math.round(36 + fx.screenPct * 1.35);
  const motionSpec = giftMotionFor(giftId, level);
  const isTakeover = level >= 4;
  const particles = Array.from({ length: motionSpec.particleCount }, (_, i) => i);
  const screenW = Math.min(100, Math.max(18, fx.screenPct));

  useEffect(() => {
    playGiftAlert(level, giftId);
  }, [level, giftId]);

  return (
    <AnimatePresence>
      {isTakeover ? (
        <motion.div
          className={`pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-gradient-to-br ${levelClass(level)}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: fx.duration, times: [0, 0.07, 0.78, 1] }}
          onAnimationComplete={() => onComplete?.()}
        >
          {particles.map((i) => (
            <motion.span
              key={i}
              className="absolute text-xl drop-shadow"
              style={{ left: `${6 + ((i * 17) % 88)}%`, top: `${8 + ((i * 13) % 78)}%` }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1.35, 0.5], y: [0, -50 - (i % 5) * 8] }}
              transition={{ duration: fx.duration * 0.85, delay: i * 0.06 }}
            >
              {motionSpec.particles[i % motionSpec.particles.length]}
            </motion.span>
          ))}
          <motion.div
            className="relative flex flex-col items-center gap-2 text-center"
            initial={motionSpec.initial}
            animate={motionSpec.animate}
            transition={{ duration: Math.min(fx.duration * 0.85, 6) }}
          >
            <span style={{ fontSize: sizePx }} className="drop-shadow-[0_0_32px_rgba(255,255,255,0.8)]">
              {emoji}
            </span>
            <p className="text-lg font-black text-white drop-shadow sm:text-3xl">{name}</p>
            {senderName ? (
              <p className="rounded-full bg-black/55 px-4 py-1 text-sm font-semibold text-cyan-200 backdrop-blur">
                {senderName}
              </p>
            ) : null}
            {level >= 5 ? (
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.28em] text-amber-200">
                vino a facturar
              </p>
            ) : null}
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          className="pointer-events-none absolute z-20 flex flex-col items-center"
          style={{
            left: `${Math.min(78, Math.max(8, left))}%`,
            bottom: level >= 3 ? '22%' : '16%',
            width: `${screenW}%`,
            maxWidth: level >= 3 ? 360 : 240,
          }}
          initial={motionSpec.initial}
          animate={motionSpec.animate}
          transition={{ duration: fx.duration, ease: 'easeOut' }}
          onAnimationComplete={() => onComplete?.()}
        >
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
          {level >= 3 ? (
            <motion.div
              className={`absolute inset-x-[-20%] top-[-30%] -z-10 h-[160%] rounded-full bg-gradient-to-br ${levelClass(level)} blur-2xl`}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.7, 0] }}
              transition={{ duration: fx.duration }}
            />
          ) : null}
          <span
            style={{ fontSize: Math.round(26 + fx.screenPct * 0.7) }}
            className="relative drop-shadow-[0_0_18px_rgba(0,240,255,0.6)]"
          >
            {emoji}
          </span>
          {level >= 2 ? (
            <span className="mt-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
              {name}
            </span>
          ) : null}
          {senderName ? (
            <span className="mt-0.5 text-[11px] font-semibold text-cyan-200 drop-shadow">{senderName}</span>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
