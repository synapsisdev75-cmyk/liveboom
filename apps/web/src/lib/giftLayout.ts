/** Layout visual de regalos: variante × dispositivo × área. Compatible con device × formato LIVE. */

import type { CSSProperties } from 'react';
import { VP_LG, VP_MD } from '../responsive/viewport';

export type GiftLayoutPlacement = 'live' | 'post' | 'boom_clip' | 'flashboom' | 'call' | 'chat';

export type GiftLayoutDevice = 'mobile' | 'tablet' | 'desktop';
export type GiftLiveFormat = 'portrait916' | 'landscape169';
export type GiftFitMode = 'contain' | 'cover' | 'width' | 'height' | 'free';
export type GiftDisplayArea = 'live' | 'global';
export type GiftFullscreenMode = 'none' | 'live' | 'global';
export type GiftLayoutArea = 'content' | 'viewport';
export type GiftLayoutSource = 'exact' | 'variant' | 'area' | 'legacy' | 'default';

export const GIFT_LAYOUT_VARIANT_IDS = [
  'live_9_16',
  'live_16_9',
  'publicaciones',
  'boom_clip',
  'flash_boom',
  'llamadas_voz',
  'llamadas_video',
  'chat',
] as const;

export type GiftLayoutVariantId = (typeof GIFT_LAYOUT_VARIANT_IDS)[number];

export type GiftLayoutSlot = {
  fit: GiftFitMode;
  scale: number;
  x: number;
  y: number;
  cropX: number;
  cropY: number;
  displayArea: GiftDisplayArea;
  fullscreenMode: GiftFullscreenMode;
  anchorX: number;
  anchorY: number;
  widthRatio?: number;
  crop?: { x: number; y: number; width: number; height: number } | null;
};

export type GiftAreaSlots = {
  content?: GiftLayoutSlot;
  viewport?: GiftLayoutSlot;
};

export type GiftDevicePlacement = {
  preferredArea?: GiftLayoutArea;
  areas: GiftAreaSlots;
};

export type GiftVariantLayout = {
  preferredArea?: GiftLayoutArea;
  defaultsByArea?: GiftAreaSlots;
  devices?: Partial<Record<GiftLayoutDevice, GiftDevicePlacement>>;
};

type GiftLayoutCore = Record<GiftLayoutDevice, Record<GiftLiveFormat, GiftLayoutSlot>>;

export type GiftLayoutMap = GiftLayoutCore & {
  schemaVersion?: number;
  defaultsByArea?: GiftAreaSlots;
  variants?: Partial<Record<GiftLayoutVariantId, GiftVariantLayout>>;
};

export const GIFT_LAYOUT_DEVICES: GiftLayoutDevice[] = ['mobile', 'tablet', 'desktop'];
export const GIFT_LIVE_FORMATS: GiftLiveFormat[] = ['portrait916', 'landscape169'];
export const GIFT_LAYOUT_AREAS: GiftLayoutArea[] = ['content', 'viewport'];

export const GIFT_LAYOUT_SCALE_MIN = 0.2;
export const GIFT_LAYOUT_SCALE_MAX = 2;
export const GIFT_LAYOUT_SCHEMA_VERSION = 2;

export const GIFT_LAYOUT_VARIANT_LABEL: Record<GiftLayoutVariantId, string> = {
  live_9_16: 'LIVE 9:16',
  live_16_9: 'LIVE 16:9',
  publicaciones: 'Publicaciones',
  boom_clip: 'Boom Clip',
  flash_boom: 'Flash Boom',
  llamadas_voz: 'Llamada de voz',
  llamadas_video: 'Videollamada',
  chat: 'Chat',
};

const DEVICES: GiftLayoutDevice[] = GIFT_LAYOUT_DEVICES;
const VARIANT_SET = new Set<string>(GIFT_LAYOUT_VARIANT_IDS);

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

function clampUnit(value: unknown, fallback = 0.5): number {
  const n = Number(value);
  const base = Number.isFinite(n) ? n : fallback;
  return Math.min(1, Math.max(0, Math.round(base * 1000) / 1000));
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
    anchorX: 0.5,
    anchorY: 0.5,
    crop: null,
  };
}

function cloneSlot(slot: GiftLayoutSlot): GiftLayoutSlot {
  return {
    ...slot,
    crop: slot.crop ? { ...slot.crop } : slot.crop === null ? null : undefined,
  };
}

function withAreaFlags(slot: GiftLayoutSlot, area: GiftLayoutArea): GiftLayoutSlot {
  const next = cloneSlot(slot);
  if (area === 'viewport') {
    next.displayArea = 'global';
    if (next.fullscreenMode === 'live') next.fullscreenMode = 'global';
  } else {
    next.displayArea = 'live';
    if (next.fullscreenMode === 'global') next.fullscreenMode = 'none';
  }
  return next;
}

function normalizeCropRect(raw: unknown): GiftLayoutSlot['crop'] {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const x = Number(row.x);
  const y = Number(row.y);
  const width = Number(row.width);
  const height = Number(row.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: clampPct(x, 0),
    y: clampPct(y, 0),
    width: clampPct(width, 100),
    height: clampPct(height, 100),
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
  const widthRatioRaw = row.widthRatio ?? fallback.widthRatio;
  const widthRatio =
    widthRatioRaw == null || widthRatioRaw === ''
      ? undefined
      : Number.isFinite(Number(widthRatioRaw)) && Number(widthRatioRaw) > 0
        ? Math.min(4, Math.max(0.05, Number(widthRatioRaw)))
        : undefined;
  return {
    fit,
    scale: clampGiftLayoutScale(row.scale, fallback.scale),
    x: clampPct(row.x, fallback.x),
    y: clampPct(row.y, fallback.y),
    cropX: clampPct(row.cropX, fallback.cropX),
    cropY: clampPct(row.cropY, fallback.cropY),
    displayArea,
    fullscreenMode,
    anchorX: clampUnit(row.anchorX, fallback.anchorX),
    anchorY: clampUnit(row.anchorY, fallback.anchorY),
    widthRatio,
    crop: normalizeCropRect(row.crop !== undefined ? row.crop : fallback.crop),
  };
}

function normalizeAreaSlots(raw: unknown, fallback: GiftLayoutSlot): GiftAreaSlots | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const out: GiftAreaSlots = {};
  if (row.content != null) out.content = normalizeSlot(row.content, fallback);
  if (row.viewport != null) out.viewport = normalizeSlot(row.viewport, fallback);
  return out.content || out.viewport ? out : undefined;
}

function normalizeDevicePlacement(raw: unknown, fallback: GiftLayoutSlot): GiftDevicePlacement | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const areas = normalizeAreaSlots(row.areas, fallback) || {};
  const preferredRaw = String(row.preferredArea || '');
  const preferredArea: GiftLayoutArea | undefined =
    preferredRaw === 'content' || preferredRaw === 'viewport' ? preferredRaw : undefined;
  if (!areas.content && !areas.viewport && !preferredArea) return undefined;
  return { preferredArea, areas };
}

function normalizeVariant(raw: unknown, fallback: GiftLayoutSlot): GiftVariantLayout | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const preferredRaw = String(row.preferredArea || '');
  const preferredArea: GiftLayoutArea | undefined =
    preferredRaw === 'content' || preferredRaw === 'viewport' ? preferredRaw : undefined;
  const defaultsByArea = normalizeAreaSlots(row.defaultsByArea, fallback);
  const devicesRaw = row.devices && typeof row.devices === 'object' ? (row.devices as Record<string, unknown>) : {};
  const devices: GiftVariantLayout['devices'] = {};
  for (const device of DEVICES) {
    const cell = normalizeDevicePlacement(devicesRaw[device], fallback);
    if (cell) devices[device] = cell;
  }
  const hasDevices = Object.keys(devices).length > 0;
  if (!preferredArea && !defaultsByArea && !hasDevices) return undefined;
  return {
    preferredArea,
    defaultsByArea,
    devices: hasDevices ? devices : undefined,
  };
}

function cloneAreaSlots(slots?: GiftAreaSlots): GiftAreaSlots | undefined {
  if (!slots) return undefined;
  const out: GiftAreaSlots = {};
  if (slots.content) out.content = cloneSlot(slots.content);
  if (slots.viewport) out.viewport = cloneSlot(slots.viewport);
  return out.content || out.viewport ? out : undefined;
}

function cloneVariant(variant?: GiftVariantLayout): GiftVariantLayout | undefined {
  if (!variant) return undefined;
  const devices: GiftVariantLayout['devices'] = {};
  for (const device of DEVICES) {
    const cell = variant.devices?.[device];
    if (!cell) continue;
    devices[device] = {
      preferredArea: cell.preferredArea,
      areas: cloneAreaSlots(cell.areas) || {},
    };
  }
  return {
    preferredArea: variant.preferredArea,
    defaultsByArea: cloneAreaSlots(variant.defaultsByArea),
    devices: Object.keys(devices).length ? devices : undefined,
  };
}

export function isGiftLayoutVariantId(value: unknown): value is GiftLayoutVariantId {
  return typeof value === 'string' && VARIANT_SET.has(value);
}

export function giftLiveFormatForVariant(variant: GiftLayoutVariantId): GiftLiveFormat | null {
  if (variant === 'live_9_16') return 'portrait916';
  if (variant === 'live_16_9') return 'landscape169';
  return null;
}

export function giftLayoutVariantFromLiveFormat(format: GiftLiveFormat): GiftLayoutVariantId {
  return format === 'landscape169' ? 'live_16_9' : 'live_9_16';
}

export function giftLayoutVariantFor(
  placement: GiftLayoutPlacement,
  opts?: { liveAspect?: string | null; liveFormat?: GiftLiveFormat; callKind?: 'voice' | 'video' },
): GiftLayoutVariantId {
  if (placement === 'live') {
    if (opts?.liveFormat) return giftLayoutVariantFromLiveFormat(opts.liveFormat);
    return opts?.liveAspect === '16:9' ? 'live_16_9' : 'live_9_16';
  }
  if (placement === 'post') return 'publicaciones';
  if (placement === 'boom_clip') return 'boom_clip';
  if (placement === 'flashboom') return 'flash_boom';
  if (placement === 'call') return opts?.callKind === 'voice' ? 'llamadas_voz' : 'llamadas_video';
  return 'chat';
}

export function giftPlacementForVariant(variant: GiftLayoutVariantId): GiftLayoutPlacement {
  if (variant === 'live_9_16' || variant === 'live_16_9') return 'live';
  if (variant === 'publicaciones') return 'post';
  if (variant === 'boom_clip') return 'boom_clip';
  if (variant === 'flash_boom') return 'flashboom';
  if (variant === 'llamadas_voz' || variant === 'llamadas_video') return 'call';
  return 'chat';
}

export function normalizeGiftLayout(raw: unknown, animScale?: unknown): GiftLayoutMap {
  const base = defaultGiftLayoutSlot(animScale);
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { schemaVersion: GIFT_LAYOUT_SCHEMA_VERSION } as GiftLayoutMap;
  for (const device of DEVICES) {
    const deviceRaw = src[device] && typeof src[device] === 'object' ? (src[device] as Record<string, unknown>) : {};
    out[device] = {
      portrait916: normalizeSlot(deviceRaw.portrait916, base),
      landscape169: normalizeSlot(deviceRaw.landscape169, base),
    };
  }
  const defaultsByArea = normalizeAreaSlots(src.defaultsByArea, base);
  if (defaultsByArea) out.defaultsByArea = defaultsByArea;
  const variantsRaw = src.variants && typeof src.variants === 'object' ? (src.variants as Record<string, unknown>) : {};
  const variants: NonNullable<GiftLayoutMap['variants']> = {};
  for (const id of GIFT_LAYOUT_VARIANT_IDS) {
    const next = normalizeVariant(variantsRaw[id], base);
    if (next) variants[id] = next;
  }
  if (Object.keys(variants).length) out.variants = variants;
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
    if (w < VP_MD) return 'mobile';
    if (w < VP_LG) return 'tablet';
    return 'desktop';
  }
  if (w < VP_MD) return 'mobile';
  if (w < VP_LG) return 'tablet';
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

function legacySlot(map: GiftLayoutMap, variant: GiftLayoutVariantId, device: GiftLayoutDevice): GiftLayoutSlot | undefined {
  const format = giftLiveFormatForVariant(variant);
  if (!format) return map[device]?.portrait916 || map[device]?.landscape169;
  return map[device]?.[format];
}

function preferredAreaOf(
  map: GiftLayoutMap,
  variant: GiftLayoutVariantId,
  device: GiftLayoutDevice,
): GiftLayoutArea {
  const cell = map.variants?.[variant]?.devices?.[device];
  if (cell?.preferredArea) return cell.preferredArea;
  const variantPref = map.variants?.[variant]?.preferredArea;
  if (variantPref) return variantPref;
  const legacy = legacySlot(map, variant, device);
  if (legacy && (legacy.displayArea === 'global' || legacy.fullscreenMode === 'global')) return 'viewport';
  return 'content';
}

export function resolveGiftLayoutArea(input: {
  layout?: GiftLayoutMap | null;
  animScale?: unknown;
  variant: GiftLayoutVariantId;
  device?: GiftLayoutDevice;
}): GiftLayoutArea {
  const map = normalizeGiftLayout(input.layout, input.animScale);
  const device = input.device || giftLayoutDeviceFromViewport();
  return preferredAreaOf(map, input.variant, device);
}

function pickResolvedSlot(
  map: GiftLayoutMap,
  variant: GiftLayoutVariantId,
  device: GiftLayoutDevice,
  area: GiftLayoutArea,
): { slot: GiftLayoutSlot; source: GiftLayoutSource } {
  const exact = map.variants?.[variant]?.devices?.[device]?.areas?.[area];
  if (exact) return { slot: cloneSlot(exact), source: 'exact' };
  const variantDefault = map.variants?.[variant]?.defaultsByArea?.[area];
  if (variantDefault) return { slot: cloneSlot(variantDefault), source: 'variant' };
  const globalDefault = map.defaultsByArea?.[area];
  if (globalDefault) return { slot: cloneSlot(globalDefault), source: 'area' };
  const legacy = legacySlot(map, variant, device);
  if (legacy) return { slot: withAreaFlags(legacy, area), source: 'legacy' };
  return { slot: withAreaFlags(defaultGiftLayoutSlot(), area), source: 'default' };
}

export function resolveGiftLayoutCell(input: {
  layout?: GiftLayoutMap | null;
  animScale?: unknown;
  variant?: GiftLayoutVariantId | null;
  device?: GiftLayoutDevice;
  area?: GiftLayoutArea;
  liveFormat?: GiftLiveFormat;
  liveAspect?: string | null;
}): {
  slot: GiftLayoutSlot;
  source: GiftLayoutSource;
  variant: GiftLayoutVariantId;
  device: GiftLayoutDevice;
  area: GiftLayoutArea;
} {
  const map = normalizeGiftLayout(input.layout, input.animScale);
  const device = input.device || giftLayoutDeviceFromViewport();
  const format =
    input.liveFormat ||
    (input.liveAspect ? giftLiveFormatFromAspect(input.liveAspect) : giftPlaybackLiveFormat(device));
  const variant = input.variant || giftLayoutVariantFromLiveFormat(format);
  const area = input.area || preferredAreaOf(map, variant, device);
  const resolved = pickResolvedSlot(map, variant, device, area);
  return {
    slot: withAreaFlags(resolved.slot, area),
    source: resolved.source,
    variant,
    device,
    area,
  };
}

export function resolveGiftLayoutSlot(input: {
  layout?: GiftLayoutMap | null;
  animScale?: unknown;
  device?: GiftLayoutDevice;
  liveFormat?: GiftLiveFormat;
  liveAspect?: string | null;
  variant?: GiftLayoutVariantId | null;
  area?: GiftLayoutArea;
}): GiftLayoutSlot {
  if (!input.variant && input.area == null) {
    const map = normalizeGiftLayout(input.layout, input.animScale);
    const device = input.device || giftLayoutDeviceFromViewport();
    const format =
      input.liveFormat ||
      (input.liveAspect ? giftLiveFormatFromAspect(input.liveAspect) : giftPlaybackLiveFormat(device));
    return map[device][format];
  }
  return resolveGiftLayoutCell(input).slot;
}

function syncLegacyFromVariant(map: GiftLayoutMap, variant: GiftLayoutVariantId, device: GiftLayoutDevice) {
  const format = giftLiveFormatForVariant(variant);
  if (!format) return;
  const area = preferredAreaOf(map, variant, device);
  const slot = pickResolvedSlot(map, variant, device, area).slot;
  map[device][format] = withAreaFlags(slot, area);
}

function writeExactSlot(
  map: GiftLayoutMap,
  variant: GiftLayoutVariantId,
  device: GiftLayoutDevice,
  area: GiftLayoutArea,
  slot: GiftLayoutSlot,
) {
  const variants = (map.variants ||= {});
  const current = (variants[variant] ||= {});
  const devices = (current.devices ||= {});
  const cell = (devices[device] ||= { areas: {} });
  cell.areas[area] = withAreaFlags(slot, area);
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
  const variant = giftLayoutVariantFromLiveFormat(format);
  const area: GiftLayoutArea =
    next[device][format].displayArea === 'global' || next[device][format].fullscreenMode === 'global'
      ? 'viewport'
      : 'content';
  writeExactSlot(next, variant, device, area, next[device][format]);
  const cell = next.variants?.[variant]?.devices?.[device];
  if (cell) cell.preferredArea = area;
  return next;
}

export function patchGiftLayoutCell(
  layout: GiftLayoutMap | undefined,
  input: {
    variant: GiftLayoutVariantId;
    device: GiftLayoutDevice;
    area: GiftLayoutArea;
  },
  patch: Partial<GiftLayoutSlot>,
  animScale?: unknown,
): GiftLayoutMap {
  const next = normalizeGiftLayout(layout, animScale);
  const current = pickResolvedSlot(next, input.variant, input.device, input.area).slot;
  const merged = normalizeSlot({ ...current, ...patch }, current);
  writeExactSlot(next, input.variant, input.device, input.area, merged);
  syncLegacyFromVariant(next, input.variant, input.device);
  return next;
}

export function setGiftLayoutPreferredArea(
  layout: GiftLayoutMap | undefined,
  input: {
    variant: GiftLayoutVariantId;
    device: GiftLayoutDevice;
    area: GiftLayoutArea;
  },
  animScale?: unknown,
): GiftLayoutMap {
  const next = normalizeGiftLayout(layout, animScale);
  const variants = (next.variants ||= {});
  const current = (variants[input.variant] ||= {});
  const devices = (current.devices ||= {});
  const cell = (devices[input.device] ||= { areas: {} });
  if (!cell.areas[input.area]) {
    cell.areas[input.area] = withAreaFlags(
      pickResolvedSlot(next, input.variant, input.device, input.area).slot,
      input.area,
    );
  }
  cell.preferredArea = input.area;
  syncLegacyFromVariant(next, input.variant, input.device);
  return next;
}

export function resetGiftLayoutCell(
  layout: GiftLayoutMap | undefined,
  input: {
    variant: GiftLayoutVariantId;
    device: GiftLayoutDevice;
    area: GiftLayoutArea;
  },
  animScale?: unknown,
): GiftLayoutMap {
  const next = normalizeGiftLayout(layout, animScale);
  const cell = next.variants?.[input.variant]?.devices?.[input.device];
  if (cell?.areas) delete cell.areas[input.area];
  if (cell?.preferredArea === input.area) delete cell.preferredArea;
  if (cell && !cell.areas.content && !cell.areas.viewport) {
    delete next.variants?.[input.variant]?.devices?.[input.device];
  }
  const devices = next.variants?.[input.variant]?.devices;
  if (devices && !DEVICES.some((device) => devices[device])) {
    delete next.variants?.[input.variant]?.devices;
  }
  const variant = next.variants?.[input.variant];
  if (variant && !variant.preferredArea && !variant.defaultsByArea && !variant.devices) {
    delete next.variants?.[input.variant];
  }
  if (next.variants && !Object.keys(next.variants).length) delete next.variants;
  const remaining = pickResolvedSlot(next, input.variant, input.device, input.area);
  const format = giftLiveFormatForVariant(input.variant);
  if (remaining.source === 'legacy' || remaining.source === 'default') {
    if (format) next[input.device][format] = defaultGiftLayoutSlot(animScale);
  } else {
    syncLegacyFromVariant(next, input.variant, input.device);
  }
  return next;
}

export function copyGiftLayoutToAllDevices(layout: GiftLayoutMap, fromDevice: GiftLayoutDevice): GiftLayoutMap {
  const next = normalizeGiftLayout(layout);
  const source = next[fromDevice];
  for (const device of DEVICES) {
    next[device] = {
      portrait916: cloneSlot(source.portrait916),
      landscape169: cloneSlot(source.landscape169),
    };
  }
  if (next.variants) {
    for (const id of GIFT_LAYOUT_VARIANT_IDS) {
      const from = next.variants[id]?.devices?.[fromDevice];
      if (!from) continue;
      const devices = (next.variants[id]!.devices ||= {});
      for (const device of DEVICES) {
        devices[device] = {
          preferredArea: from.preferredArea,
          areas: cloneAreaSlots(from.areas) || {},
        };
      }
    }
  }
  return next;
}

export function copyGiftLayoutActiveToDevices(
  layout: GiftLayoutMap,
  variant: GiftLayoutVariantId,
  fromDevice: GiftLayoutDevice,
): GiftLayoutMap {
  const next = normalizeGiftLayout(layout);
  const source = next.variants?.[variant]?.devices?.[fromDevice];
  if (source) {
    const devices = (((next.variants ||= {})[variant] ||= {}).devices ||= {});
    for (const device of DEVICES) {
      devices[device] = {
        preferredArea: source.preferredArea,
        areas: cloneAreaSlots(source.areas) || {},
      };
      syncLegacyFromVariant(next, variant, device);
    }
    return next;
  }
  const format = giftLiveFormatForVariant(variant);
  if (format) return copyGiftLayoutToAllDevices(next, fromDevice);
  const fallback = pickResolvedSlot(next, variant, fromDevice, preferredAreaOf(next, variant, fromDevice));
  const devices = (((next.variants ||= {})[variant] ||= {}).devices ||= {});
  for (const device of DEVICES) {
    devices[device] = {
      preferredArea: preferredAreaOf(next, variant, fromDevice),
      areas: { [preferredAreaOf(next, variant, fromDevice)]: cloneSlot(fallback.slot) },
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
    next[device][to] = cloneSlot(next[device][from]);
  }
  const fromVariant = giftLayoutVariantFromLiveFormat(from);
  const toVariant = giftLayoutVariantFromLiveFormat(to);
  const source = next.variants?.[fromVariant];
  if (source) {
    (next.variants ||= {})[toVariant] = cloneVariant(source);
    for (const device of DEVICES) syncLegacyFromVariant(next, toVariant, device);
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
  const anchorX = Number.isFinite(slot.anchorX) ? slot.anchorX : 0.5;
  const anchorY = Number.isFinite(slot.anchorY) ? slot.anchorY : 0.5;
  const originX = `${slot.x}%`;
  const originY = `${slot.y}%`;
  const translate = `translate(-${anchorX * 100}%, -${anchorY * 100}%)`;

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
      transform: translate,
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
      transform: translate,
      objectFit: 'contain',
      objectPosition,
      background: 'transparent',
    };
  }

  const widthPct = slot.fit === 'free' && slot.widthRatio ? slot.widthRatio * 100 : slot.scale * 100;
  const heightPct = slot.scale * 100;

  return {
    position: 'absolute',
    left: `${slot.x}%`,
    top: `${slot.y}%`,
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    maxWidth: 'none',
    maxHeight: 'none',
    transform: translate,
    objectFit: 'contain',
    objectPosition,
    background: 'transparent',
  };
}
