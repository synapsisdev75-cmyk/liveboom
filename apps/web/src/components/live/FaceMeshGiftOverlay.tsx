import { motion } from 'framer-motion';
import { getFaceGiftProp } from '../../lib/faceGiftAnchors';
import { findLiveGift, GIFT_LEVEL_FX } from '../../lib/liveboomGifts';

type ActiveFaceGift = {
  id: string;
  giftId: string;
  endsAt: number;
};

type Props = {
  containerRef?: React.RefObject<HTMLElement | null>;
  active: ActiveFaceGift | null;
};

/**
 * Overlay de regalos anclados a la cara sin leer el <video> de LiveKit.
 * MediaPipe sobre el track WebRTC dejaba la cámara en negro unos segundos.
 */
export function FaceMeshGiftOverlay({ active }: Props) {
  if (!active) return null;
  const prop = getFaceGiftProp(active.giftId);
  const gift = findLiveGift(active.giftId);
  const emoji = prop?.emoji || gift?.emoji || '🎁';
  const duration = gift ? GIFT_LEVEL_FX[gift.level].duration : 3;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <motion.div
        className="absolute left-1/2 top-[28%] origin-center drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)]"
        initial={{ opacity: 0, scale: 0.4, y: -12 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.15, 1, 0.9], y: [-12, 0, 0, -8] }}
        transition={{ duration, times: [0, 0.12, 0.78, 1] }}
        style={{ fontSize: prop ? '4.2rem' : '3.2rem', lineHeight: 1, translate: '-50% -50%' }}
      >
        {emoji}
      </motion.div>
    </div>
  );
}

export type { ActiveFaceGift };
