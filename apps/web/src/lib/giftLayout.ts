/** Layout visual de regalos: dispositivo × formato LIVE × área. Un archivo, solo parámetros CSS. */

import type { CSSProperties } from 'react';

export type GiftLayoutDevice = 'mobile' | 'tablet' | 'desktop';
export type GiftLiveFormat = 'portrait916' | 'landscape169';
export type GiftFitMode = 'contain' | 'cover' | 'width' | 'height' | 'free';
export type GiftDisplayArea = 'live' | 'global';
export type GiftFullscreenMode = 'none' | 'live' | 'global';

export type GiftLayoutSlot = {
  fit: GiftFitMode;
  scale: number;
  x: number;
  y: number;
  cropX: number;
  cropY: number;
  displayArea: GiftDisplayArea;
  fullscreenMode: GiftFullscreenMode;
};

export type GiftLayoutMap = Record<GiftLayoutDevice, Record<GiftLiveFormat, GiftLayoutSlot>>;

export const GIFT_LAYOUT_DEVICES: GiftLayoutDevice[] = ['mobile', 'tablet', 'desktop'];
export const GIFT_LIVE_FORMATS: GiftLiveFormat[] = ['portrait916', 'landscape169'];

export const GIFT_LAYOUT_SCALE_MIN = 0.2;
export const GIFT_LAYOUT_SCALE_MAX = 2;

const DEVICES: GiftLayoutDevice[] = GIFT_LAYOUT_DEVICES;

export function clampGiftLayoutScale(value: unknown, fallback = 0.72): number {
  const n = Number(value);
  const base = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.min(GIFT_LAYOUT_SCALE_MAX, Math.max(GIFT_LAYOUT_SCALE_MIN, Math.round(base * 100) / 100));
}

export function clampPct(value: unknown, fallback = 50): number {
  const n = Number(value);
  const base = Number.isFinite(n) ? n : fallback;
  return Math.min(100, Math.max(0, Math.round(base * 10) / 10));
}

export function defaultGiftLayoutSlot(animScale?: unknown): GiftLayoutSlot {
  return {
    fit: 'contain',
    scale: clampGiftLayoutScale(animScale, 0.72),
    x: 50,
    y: 50,
    cropX: 50,
    cropY: 50,
    displayArea: 'live',
    fullscreenMode: 'none',
  };
}

function normalizeSlot(raw: unknown, fallback: GiftLayoutSlot): GiftLayoutSlot {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const fitRaw = String(row.fit || fallback.fit);
  const fit: GiftFitMode = (['contain', 'cover', 'width', 'height', 'free'] as const).includes(
    fitRaw as GiftFitMode,
  )
    ? (fitRaw as GiftFitMode)
    : fallback.fit;
  const areaRaw = String(row.displayArea || fallback.displayArea);
  const displayArea: GiftDisplayArea = areaRaw === 'global' ? 'global' : 'live';
  const fullRaw = String(row.fullscreenMode || fallback.fullscreenMode);
  const fullscreenMode: GiftFullscreenMode =
    fullRaw === 'live' || fullRaw === 'global' ? fullRaw : 'none';
  return {
    fit,
    scale: clampGiftLayoutScale(row.scale, fallback.scale),
    x: clampPct(row.x, fallback.x),
    y: clampPct(row.y, fallback.y),
    cropX: clampPct(row.cropX, fallback.cropX),
    cropY: clampPct(row.cropY, fallback.cropY),
    displayArea,
    fullscreenMode,
  };
}

export function normalizeGiftLayout(raw: unknown, animScale?: unknown): GiftLayoutMap {
  const base = defaultGiftLayoutSlot(animScale);
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as GiftLayoutMap;
  for (const device of DEVICES) {
    const deviceRaw = src[device] && typeof src[device] === 'object' ? (src[device] as Record<string, unknown>) : {};
    out[device] = {
      portrait916: normalizeSlot(deviceRaw.portrait916, base),
      landscape169: normalizeSlot(deviceRaw.landscape169, base),
    };
  }
  return out;
}

export function serializeGiftLayout(layout: GiftLayoutMap | undefined, animScale?: unknown): GiftLayoutMap {
  return normalizeGiftLayout(layout, animScale);
}

export function giftLayoutDeviceFromViewport(
  width = typeof window === 'undefined' ? 1280 : window.innerWidth,
  height?: number,
): GiftLayoutDevice {
  const w = Number(width) || 1280;
  const h =
    height == null
      ? typeof window === 'undefined'
        ? 0
        : window.innerHeight
      : Number(height) || 0;
  const short = h > 0 ? Math.min(w, h) : w;
  const hasWindow = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  if (hasWindow) {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (short < 600) return 'mobile';
    if (coarse && short <= 1100) return 'tablet';
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

export function giftViewerOrientation(
  width = typeof window === 'undefined' ? 1280 : window.innerWidth,
  height = typeof window === 'undefined' ? 720 : window.innerHeight,
): 'portrait' | 'landscape' {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(orientation: landscape)').matches) return 'landscape';
    if (window.matchMedia('(orientation: portrait)').matches) return 'portrait';
  }
  return Number(width) >= Number(height) ? 'landscape' : 'portrait';
}

/** Móvil y tablet vertical: 9:16. Escritorio o tablet horizontal: 16:9. */
export function giftPlaybackLiveFormat(
  device?: GiftLayoutDevice,
  orientation?: 'portrait' | 'landscape',
): GiftLiveFormat {
  const d = device || giftLayoutDeviceFromViewport();
  const o = orientation || giftViewerOrientation();
  if (d === 'desktop') return 'landscape169';
  if (d === 'tablet' && o === 'landscape') return 'landscape169';
  return 'portrait916';
}

export function giftLiveFormatFromAspect(ratio: string | undefined | null): GiftLiveFormat {
  return ratio === '16:9' ? 'landscape169' : 'portrait916';
}

export function resolveGiftLayoutSlot(input: {
  layout?: GiftLayoutMap | null;
  animScale?: unknown;
  device?: GiftLayoutDevice;
  liveFormat?: GiftLiveFormat;
  liveAspect?: string | null;
}): GiftLayoutSlot {
  const map = normalizeGiftLayout(input.layout, input.animScale);
  const device = input.device || giftLayoutDeviceFromViewport();
  const format =
    input.liveFormat ||
    (input.liveAspect ? giftLiveFormatFromAspect(input.liveAspect) : giftPlaybackLiveFormat(device));
  return map[device][format];
}

export function patchGiftLayout(
  layout: GiftLayoutMap | undefined,
  device: GiftLayoutDevice,
  format: GiftLiveFormat,
  patch: Partial<GiftLayoutSlot>,
  animScale?: unknown,
): GiftLayoutMap {
  const next = normalizeGiftLayout(layout, animScale);
  next[device][format] = normalizeSlot({ ...next[device][format], ...patch }, next[device][format]);
  return next;
}

export function copyGiftLayoutToAllDevices(layout: GiftLayoutMap, fromDevice: GiftLayoutDevice): GiftLayoutMap {
  const next = normalizeGiftLayout(layout);
  const source = next[fromDevice];
  for (const device of DEVICES) {
    next[device] = {
      portrait916: { ...source.portrait916 },
      landscape169: { ...source.landscape169 },
    };
  }
  return next;
}

export function copyGiftLayoutFormat(
  layout: GiftLayoutMap,
  from: GiftLiveFormat,
  to: GiftLiveFormat,
): GiftLayoutMap {
  const next = normalizeGiftLayout(layout);
  for (const device of DEVICES) {
    next[device][to] = { ...next[device][from] };
  }
  return next;
}

export function isGiftLayoutBleed(slot: GiftLayoutSlot): boolean {
  return slot.fit === 'cover' || slot.fullscreenMode === 'live' || slot.fullscreenMode === 'global';
}

export function giftLayoutObjectFit(slot: GiftLayoutSlot): 'contain' | 'cover' {
  if (isGiftLayoutBleed(slot)) return 'cover';
  return 'contain';
}

export function giftLayoutMediaStyle(slot: GiftLayoutSlot): CSSProperties {
  const bleed = isGiftLayoutBleed(slot);
  const objectFit = giftLayoutObjectFit(slot);
  const objectPosition = `${slot.cropX}% ${slot.cropY}%`;
  const originX = `${slot.x}%`;
  const originY = `${slot.y}%`;

  if (bleed) {
    return {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      maxWidth: 'none',
      maxHeight: 'none',
      margin: 0,
      padding: 0,
      border: 0,
      objectFit,
      objectPosition,
      transform: `scale(${slot.scale})`,
      transformOrigin: `${originX} ${originY}`,
      background: 'transparent',
    };
  }

  if (slot.fit === 'width') {
    return {
      position: 'absolute',
      left: `${slot.x}%`,
      top: `${slot.y}%`,
      width: `${slot.scale * 100}%`,
      height: 'auto',
      maxWidth: 'none',
      maxHeight: 'none',
      transform: 'translate(-50%, -50%)',
      objectFit: 'contain',
      objectPosition,
      background: 'transparent',
    };
  }

  if (slot.fit === 'height') {
    return {
      position: 'absolute',
      left: `${slot.x}%`,
      top: `${slot.y}%`,
      width: 'auto',
      height: `${slot.scale * 100}%`,
      maxWidth: 'none',
      maxHeight: 'none',
      transform: 'translate(-50%, -50%)',
      objectFit: 'contain',
      objectPosition,
      background: 'transparent',
    };
  }

  return {
    position: 'absolute',
    left: `${slot.x}%`,
    top: `${slot.y}%`,
    width: `${slot.scale * 100}%`,
    height: `${slot.scale * 100}%`,
    maxWidth: 'none',
    maxHeight: 'none',
    transform: 'translate(-50%, -50%)',
    objectFit: 'contain',
    objectPosition,
    background: 'transparent',
  };
}
