import { motion } from 'framer-motion';
import { Diamond, Heart, type LucideIcon } from 'lucide-react';

export type GiftKind = 'heart' | 'diamond';

export function giftKindFromId(giftId?: string): GiftKind {
  if (giftId === 'diamond' || giftId === 'star' || giftId === 'crown') return 'diamond';
  return 'heart';
}

export function GiftIcon({
  giftId,
  size = 16,
}: {
  giftId?: string;
  size?: number;
}) {
  const kind = giftKindFromId(giftId);
  const Icon: LucideIcon = kind === 'diamond' ? Diamond : Heart;
  return (
    <Icon
      size={size}
      strokeWidth={2.4}
      fill="currentColor"
      className={kind === 'diamond' ? 'shrink-0 text-cyan-400' : 'shrink-0 text-fuchsia-500'}
    />
  );
}

type FloatingGiftProps = {
  giftId?: string;
  left?: number;
  onComplete?: () => void;
};

export function FloatingGift({ giftId, left = 48, onComplete }: FloatingGiftProps) {
  const kind = giftKindFromId(giftId);
  const Icon = kind === 'diamond' ? Diamond : Heart;

  return (
    <motion.div
      className="pointer-events-none absolute bottom-24 z-20"
      style={{ left: `${left}%` }}
      initial={{ y: 0, opacity: 1 }}
      animate={{ y: [0, -100], opacity: [1, 0] }}
      transition={{ duration: 2, ease: 'easeOut' }}
      onAnimationComplete={() => onComplete?.()}
    >
      <Icon
        size={36}
        strokeWidth={2.2}
        fill="currentColor"
        className={
          kind === 'diamond'
            ? 'text-cyan-400 drop-shadow-[0_0_12px_rgba(0,240,255,0.9)]'
            : 'text-fuchsia-500 drop-shadow-[0_0_12px_rgba(255,0,85,0.9)]'
        }
      />
    </motion.div>
  );
}
