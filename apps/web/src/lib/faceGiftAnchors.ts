/** Regalos que se anclan a la cara con MediaPipe Face Mesh (468 landmarks). */

export type FaceGiftProp = {
  /** Emoji o carácter a dibujar sobre la cara. */
  emoji: string;
  /** Tipo de anclaje. */
  anchor: 'hat' | 'crown' | 'mask' | 'glasses' | 'kiss';
  /** Escala relativa al ancho de la cara (1 = ancho completo entre sienes). */
  scale: number;
  /** Desplazamiento vertical relativo al alto de la cara (−1 arriba, +1 abajo). */
  offsetY: number;
};

/**
 * Índices MediaPipe Face Mesh / Face Landmarker:
 * 10 ≈ frente, 151 ≈ frente alta, 234/454 ≈ sienes, 13/14 ≈ labios.
 */
export const FACE_LANDMARK = {
  forehead: 10,
  foreheadTop: 151,
  leftTemple: 234,
  rightTemple: 454,
  noseTip: 1,
  upperLip: 13,
  leftEyeOuter: 33,
  rightEyeOuter: 263,
} as const;

export const FACE_GIFT_PROPS: Record<string, FaceGiftProp> = {
  sombrero_llanero: { emoji: '👒', anchor: 'hat', scale: 1.55, offsetY: -0.85 },
  sombrero_vueltiao: { emoji: '🎩', anchor: 'hat', scale: 1.45, offsetY: -0.9 },
  reina_del_live: { emoji: '👑', anchor: 'crown', scale: 1.35, offsetY: -0.95 },
  besito: { emoji: '💋', anchor: 'kiss', scale: 0.45, offsetY: 0.35 },
  corazon_latino: { emoji: '❤️', anchor: 'kiss', scale: 0.4, offsetY: 0.15 },
  flor_tropical: { emoji: '🌺', anchor: 'hat', scale: 0.7, offsetY: -0.7 },
  guacamaya: { emoji: '🦜', anchor: 'hat', scale: 1.1, offsetY: -0.75 },
  tucan_tropical: { emoji: '🦜', anchor: 'hat', scale: 1.05, offsetY: -0.72 },
};

export function getFaceGiftProp(giftId: string | undefined | null): FaceGiftProp | null {
  if (!giftId) return null;
  return FACE_GIFT_PROPS[giftId] ?? null;
}

export function isFaceAnchoredGift(giftId: string | undefined | null): boolean {
  return Boolean(getFaceGiftProp(giftId));
}
