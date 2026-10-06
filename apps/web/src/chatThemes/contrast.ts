import type { ChatThemeScheme } from './types';

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Luminancia percibida 0..1 de un color sRGB 0..255. */
export function perceivedLuminance(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Velo automático según el brillo del fondo:
 * texto claro (tema oscuro) necesita oscurecer fondos claros; texto oscuro, aclarar fondos oscuros.
 */
export function autoOverlayOpacity(luminance: number, scheme: ChatThemeScheme) {
  const lum = clamp(Number.isFinite(luminance) ? luminance : 0.2, 0, 1);
  const raw = scheme === 'dark' ? (lum - 0.22) * 1.15 : (0.62 - lum) * 1.15;
  return clamp(raw, 0, 0.62);
}

export type ImageAnalysis = { luminance: number; baseColor: string };

/** Analiza un lienzo pequeño: brillo medio (pesa más la zona central donde van las burbujas) y color base. */
export function analyzeImageData(data: Uint8ClampedArray, width: number, height: number): ImageAnalysis {
  let sum = 0;
  let weight = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const pr = data[i] ?? 0;
      const pg = data[i + 1] ?? 0;
      const pb = data[i + 2] ?? 0;
      const dx = Math.abs(x / Math.max(1, width - 1) - 0.5);
      const w = dx < 0.3 ? 1.6 : 1;
      sum += perceivedLuminance(pr, pg, pb) * w;
      weight += w;
      r += pr;
      g += pg;
      b += pb;
      count += 1;
    }
  }
  if (!count) return { luminance: 0.2, baseColor: '#0a0a0b' };
  return {
    luminance: Math.round((sum / weight) * 100) / 100,
    baseColor: toHex(r / count, g / count, b / count),
  };
}
