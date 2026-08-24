import type { GiftLevel } from './liveboomGifts';

export type GiftMotion = {
  initial: Record<string, number | number[]>;
  animate: Record<string, number | number[]>;
  particles: string[];
  particleCount: number;
  trail?: string;
};

const byId: Record<string, GiftMotion> = {
  besito: {
    initial: { x: -90, opacity: 0, rotate: -25, scale: 0.5 },
    animate: { x: [-90, 8, 18], y: [0, -24, -88], opacity: [0, 1, 1, 0], rotate: [-25, 18, 6], scale: [0.5, 1.25, 1] },
    particles: ['💕', '💗', '✨'],
    particleCount: 6,
    trail: '💕',
  },
  corazon_latino: {
    initial: { y: 70, opacity: 0, scale: 0.4 },
    animate: { y: [70, -8, -18, -18, -110], opacity: [0, 1, 1, 1, 0], scale: [0.4, 1.35, 1.05, 1.3, 0.85] },
    particles: ['❤️', '✨', '💫'],
    particleCount: 5,
  },
  cafecito: {
    initial: { y: 40, opacity: 0, scale: 0.6 },
    animate: { y: [40, -12, 6, -70], opacity: [0, 1, 1, 0], scale: [0.6, 1.15, 1.05, 0.9] },
    particles: ['💨', '💕', '☕'],
    particleCount: 4,
  },
  arepita: {
    initial: { rotate: -180, scale: 0.3, opacity: 0 },
    animate: { rotate: [-180, 20, 0], scale: [0.3, 1.2, 1], opacity: [0, 1, 1, 0], y: [20, -10, -75] },
    particles: ['✨', '🌟', '💛'],
    particleCount: 5,
  },
  empanadita: {
    initial: { rotate: 0, y: -40, opacity: 0, scale: 0.5 },
    animate: { rotate: [0, 360, 380], y: [-40, 16, -6, -80], opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1] },
    particles: ['✨', '🌾', '💛'],
    particleCount: 5,
  },
  flor_tropical: {
    initial: { scale: 0.1, opacity: 0, rotate: -20 },
    animate: { scale: [0.1, 1.35, 1.1], opacity: [0, 1, 1, 0], rotate: [-20, 8, 0], y: [0, -16, -70] },
    particles: ['🌺', '🌼', '💚', '💛'],
    particleCount: 7,
  },
  maracas: {
    initial: { opacity: 0, scale: 0.5, x: -20 },
    animate: { opacity: [0, 1, 1, 0], rotate: [0, -28, 28, -18, 12, 0], scale: [0.5, 1.2, 1], y: [16, -36, -90], x: [-20, 10, 0] },
    particles: ['✨', '🎵', '💥'],
    particleCount: 6,
  },
  aguacate: {
    initial: { y: -80, opacity: 0, scale: 0.6 },
    animate: { y: [-80, 10, -8, -70], opacity: [0, 1, 1, 0], scale: [0.6, 1.1, 1.25, 0.9], rotate: [0, -8, 6, 0] },
    particles: ['💚', '✨', '🥑'],
    particleCount: 5,
  },
  pina_tropical: {
    initial: { y: 80, opacity: 0, scale: 0.5 },
    animate: { y: [80, -10, -20, -95], opacity: [0, 1, 1, 0], rotate: [0, 18, -10, 8], scale: [0.5, 1.2, 1.35, 0.4] },
    particles: ['💛', '💚', '✨', '💥'],
    particleCount: 8,
  },
  coco_caribeno: {
    initial: { y: -90, opacity: 0, scale: 0.55 },
    animate: { y: [-90, 12, 4, -75], opacity: [0, 1, 1, 0], rotate: [0, -12, 8, 0], scale: [0.55, 1.15, 1.05, 0.85] },
    particles: ['💧', '🌴', '✨'],
    particleCount: 6,
  },
  cafe_colombiano: {
    initial: { y: 50, opacity: 0, scale: 0.5 },
    animate: { y: [50, -18, -28, -100], opacity: [0, 1, 1, 0], scale: [0.5, 1.25, 1.1, 0.9] },
    particles: ['☕', '⛰️', '💨', '✨'],
    particleCount: 8,
  },
  arepa_venezolana: {
    initial: { scale: 0.4, opacity: 0, rotate: -30 },
    animate: { scale: [0.4, 1.2, 1.05], opacity: [0, 1, 1, 0], rotate: [-30, 12, 0], y: [30, -20, -90] },
    particles: ['✨', '💛', '🫓'],
    particleCount: 7,
  },
  sombrero_llanero: {
    initial: { y: -110, opacity: 0, rotate: -40, scale: 0.5 },
    animate: { y: [-110, 8, -12, -70], opacity: [0, 1, 1, 0], rotate: [-40, 18, 0], scale: [0.5, 1.2, 1.1] },
    particles: ['💨', '🌾', '✨'],
    particleCount: 7,
  },
  sombrero_vueltiao: {
    initial: { scale: 0.2, opacity: 0, rotate: 0 },
    animate: { scale: [0.2, 1.3, 1.15], opacity: [0, 1, 1, 0], rotate: [0, 280, 360], y: [40, -10, -80] },
    particles: ['🎨', '✨', '🌀'],
    particleCount: 8,
  },
  cuatro_venezolano: {
    initial: { x: -100, opacity: 0, rotate: -15 },
    animate: { x: [-100, 8, 16], y: [0, -16, -85], opacity: [0, 1, 1, 0], rotate: [-15, 8, 0], scale: [0.7, 1.2, 1] },
    particles: ['🎵', '🎶', '〰️'],
    particleCount: 7,
  },
  tucan_tropical: {
    initial: { x: -140, y: 24, opacity: 0, rotate: -12 },
    animate: { x: [-140, 20, 150], y: [24, -36, -8], opacity: [0, 1, 1, 0], rotate: [-12, 10, 4], scale: [0.65, 1.2, 1] },
    particles: ['🍃', '💚', '💛', '🌺'],
    particleCount: 9,
  },
  guacamaya: {
    initial: { x: -150, y: 10, opacity: 0 },
    animate: { x: [-150, 0, 160], y: [10, -40, -16], opacity: [0, 1, 1, 0], rotate: [-8, 12, 0], scale: [0.7, 1.25, 1] },
    particles: ['🪶', '❤️', '💛', '💚', '💙'],
    particleCount: 10,
  },
  tambor_caribeno: {
    initial: { scale: 0.3, opacity: 0 },
    animate: { scale: [0.3, 1.3, 1.05, 1.25, 1, 0.9], opacity: [0, 1, 1, 1, 1, 0], y: [20, -10, -20, -80] },
    particles: ['💥', '〰️', '🥁'],
    particleCount: 8,
  },
  botas_llaneras: {
    initial: { y: -90, opacity: 0, rotate: -20 },
    animate: { y: [-90, 12, 4, 12, -70], opacity: [0, 1, 1, 1, 0], rotate: [-20, 8, -6, 0], scale: [0.7, 1.15, 1] },
    particles: ['💨', '🌾', '✨'],
    particleCount: 8,
  },
  caballo_criollo: {
    initial: { x: -130, opacity: 0, y: 10 },
    animate: { x: [-130, -20, 10, 24], y: [10, -6, 4, -50], opacity: [0, 1, 1, 0], scale: [0.75, 1.15, 1.05] },
    particles: ['💨', '🌾', '✨'],
    particleCount: 8,
  },
  fiesta_latina: {
    initial: { scale: 0.15, opacity: 0 },
    animate: { scale: [0.15, 1.5, 1.2], opacity: [0, 1, 1, 0], rotate: [0, 16, -8, 0], y: [0, -24, -70] },
    particles: ['🎊', '🎉', '✨', '💛', '💖'],
    particleCount: 14,
  },
  carnaval: {
    initial: { scale: 0.2, opacity: 0, y: 30 },
    animate: { scale: [0.2, 1.45, 1.15], opacity: [0, 1, 1, 0], y: [30, -20, -90], rotate: [0, 12, -8, 0] },
    particles: ['🎭', '🎊', '💃', '✨'],
    particleCount: 12,
  },
  orquesta_tropical: {
    initial: { x: -80, opacity: 0, scale: 0.5 },
    animate: { x: [-80, 0, 12], y: [20, -24, -90], opacity: [0, 1, 1, 0], scale: [0.5, 1.3, 1.1], rotate: [0, 8, 0] },
    particles: ['🎺', '🎷', '🎵', '✨'],
    particleCount: 12,
  },
  reina_del_live: {
    initial: { y: -80, opacity: 0, scale: 0.4 },
    animate: { y: [-80, -8, -16, -90], opacity: [0, 1, 1, 0], scale: [0.4, 1.35, 1.15], rotate: [0, -8, 8, 0] },
    particles: ['👑', '✨', '💎', '💖'],
    particleCount: 12,
  },
  rey_del_flow: {
    initial: { scale: 0.2, opacity: 0 },
    animate: { scale: [0.2, 1.4, 1.15], opacity: [0, 1, 1, 0], y: [40, -20, -100], rotate: [0, 10, -6, 0] },
    particles: ['🔥', '💥', '✨', '🖤'],
    particleCount: 12,
  },
  yate_caribe: {
    initial: { x: -160, y: 30, opacity: 0 },
    animate: { x: [-160, -20, 40, 80], y: [30, 8, -10, -40], opacity: [0, 1, 1, 0], scale: [0.6, 1.2, 1.1] },
    particles: ['🌊', '💙', '✨', '☀️'],
    particleCount: 14,
  },
  disco_oro: {
    initial: { scale: 0.15, rotate: -90, opacity: 0 },
    animate: { scale: [0.15, 1.4, 1.1], rotate: [-90, 20, 0], opacity: [0, 1, 1, 0], y: [20, -20, -80] },
    particles: ['💿', '✨', '🏆', '💛'],
    particleCount: 14,
  },
  estrella_latina: {
    initial: { scale: 0.1, opacity: 0, rotate: -30 },
    animate: { scale: [0.1, 1.55, 1.2], opacity: [0, 1, 1, 0], rotate: [-30, 12, 0], y: [0, -30, -70] },
    particles: ['🌟', '✨', '💫', '💖'],
    particleCount: 16,
  },
  leyenda_liveboom: {
    initial: { scale: 0.08, opacity: 0 },
    animate: { scale: [0.08, 1.5, 1.2], opacity: [0, 1, 1, 0], y: [20, -20, -60], rotate: [0, 8, 0] },
    particles: ['💫', '⚡', '✨', '👑'],
    particleCount: 18,
  },
  millon_latino: {
    initial: { y: 80, opacity: 0, scale: 0.3 },
    animate: { y: [80, -10, -30, -50], opacity: [0, 1, 1, 0], scale: [0.3, 1.45, 1.2] },
    particles: ['💰', '💵', '✨', '🤑'],
    particleCount: 20,
  },
  dios_del_live: {
    initial: { scale: 0.05, opacity: 0 },
    animate: { scale: [0.05, 1.6, 1.25], opacity: [0, 1, 1, 0], y: [0, -16, -40], rotate: [0, -8, 8, 0] },
    particles: ['⚡', '🌩️', '✨', '👑', '💥'],
    particleCount: 22,
  },
};

export function giftMotionFor(giftId: string | undefined, level: GiftLevel): GiftMotion {
  if (giftId && byId[giftId]) return byId[giftId];
  if (level >= 3) {
    return {
      initial: { scale: 0.25, opacity: 0, y: 40 },
      animate: { scale: [0.25, 1.3, 1], opacity: [0, 1, 1, 0], y: [40, -24, -90], rotate: [0, 8, -6, 0] },
      particles: ['🎊', '✨'],
      particleCount: 8 + level * 2,
    };
  }
  return {
    initial: { y: 40, opacity: 0, scale: 0.5 },
    animate: {
      y: [40, -16 - level * 10, -80 - level * 16],
      opacity: [0, 1, 1, 0],
      scale: [0.5, 1.2, 1],
      rotate: level >= 2 ? [0, 12, -8, 0] : [0, 6, 0],
    },
    particles: level >= 2 ? ['✨', '💫'] : ['✨'],
    particleCount: level >= 2 ? 4 + level : 3,
  };
}
