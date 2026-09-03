import type { CSSProperties } from 'react';
import { FEED_MEDIA_MAX_HEIGHT } from './mediaFrame';

export type MediaStageMode = 'publication' | 'boomClip' | 'flashBoom' | 'fullscreen' | 'live';

export type IntrinsicQuality = 'low' | 'mid' | 'high';

/** Calidad según dimensión intrínseca menor (px). */
export function intrinsicQualityTier(width: number, height: number): IntrinsicQuality {
  if (width <= 0 || height <= 0) return 'mid';
  const minDim = Math.min(width, height);
  if (minDim < 500) return 'low';
  if (minDim < 900) return 'mid';
  return 'high';
}

/** Factor máximo de upscale permitido para la capa principal. */
export function maxUpscaleFactor(tier: IntrinsicQuality): number {
  if (tier === 'low') return 1;
  if (tier === 'mid') return 1.12;
  return 2.5;
}

/** Limita tamaño de pantalla al intrínseco razonable (evita pixelación). */
export function clampDisplayToIntrinsic(
  displayW: number,
  displayH: number,
  intrinsicW: number,
  intrinsicH: number,
): { width: number; height: number } {
  if (intrinsicW <= 0 || intrinsicH <= 0) {
    return { width: displayW, height: displayH };
  }
  const ratio = intrinsicW / intrinsicH;
  const tier = intrinsicQualityTier(intrinsicW, intrinsicH);
  const maxW = intrinsicW * maxUpscaleFactor(tier);
  const maxH = intrinsicH * maxUpscaleFactor(tier);

  let w = displayW;
  let h = displayH;

  if (w > maxW) {
    w = maxW;
    h = w / ratio;
  }
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }

  return { width: w, height: h };
}

/** Estilos para la capa principal en feed (respeta resolución intrínseca; no estrecha el stage). */
export function feedMediaMainStyle(width: number, height: number): CSSProperties {
  if (width <= 0 || height <= 0) return { maxWidth: '100%', maxHeight: '100%' };
  const tier = intrinsicQualityTier(width, height);
  const dims = width / height;
  const portraitCap = dims < 0.85 ? 'min(100%, 22.5rem)' : dims > 1.15 ? '100%' : 'min(100%, 28rem)';
  if (tier === 'low') {
    return {
      maxWidth: `min(${portraitCap}, ${width}px)`,
      maxHeight: `min(${height}px, ${FEED_MEDIA_MAX_HEIGHT})`,
      width: 'auto',
      height: 'auto',
    };
  }
  if (tier === 'mid') {
    return {
      maxWidth: `min(${portraitCap}, ${Math.round(width * 1.12)}px)`,
      maxHeight: `min(${FEED_MEDIA_MAX_HEIGHT}, ${Math.round(height * 1.12)}px)`,
    };
  }
  return {
    maxWidth: portraitCap,
    maxHeight: FEED_MEDIA_MAX_HEIGHT,
    width: 'auto',
    height: 'auto',
  };
}

export function mediaStageModeClass(mode: MediaStageMode): string {
  return `lb-media-stage--${mode}`;
}
