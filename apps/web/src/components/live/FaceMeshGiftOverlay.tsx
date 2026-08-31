import { motion } from 'framer-motion';
import { getFaceGiftProp } from '../../lib/faceGiftAnchors';
import { findLiveGift, GIFT_LEVEL_FX, type LiveGift } from '../../lib/liveboomGifts';
import { GiftVisual } from './FloatingGift';

type ActiveFaceGift = {
  id: string;
  giftId: string;
  endsAt: number;
};

type Props = {
  containerRef?: React.RefObject<HTMLElement | null>;
  active: ActiveFaceGift | null;
  onDone?: () => void;
};

/**
 * Overlay de regalos anclados a la cara sin leer el <video> de LiveKit.
 * MediaPipe sobre el track WebRTC dejaba la cámara en negro unos segundos.
 */
export function FaceMeshGiftOverlay({ active, onDone }: Props) {
  if (!active) return null;
  const prop = getFaceGiftProp(active.giftId);
  const gift = findLiveGift(active.giftId);
  const duration = gift ? GIFT_LEVEL_FX[gift.level].duration : 3;
  const sizePx = prop ? 67 : 51;
  const visualGift: LiveGift | null = gift
    ? gift
    : {
        id: active.giftId,
        name: '',
        emoji: prop?.emoji || '🎁',
        coins: 0,
        level: 1,
        animation: '',
      };

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <motion.div
        className="absolute left-1/2 top-[28%] origin-center drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)]"
        initial={{ opacity: 0, scale: 0.4, y: -12 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.15, 1, 0.9], y: [-12, 0, 0, -8] }}
        transition={{ duration, times: [0, 0.12, 0.78, 1] }}
        onAnimationComplete={onDone}
        style={{ lineHeight: 1, translate: '-50% -50%' }}
      >
        <GiftVisual gift={visualGift} size={sizePx} />
      </motion.div>
    </div>
  );
}

export type { ActiveFaceGift };
