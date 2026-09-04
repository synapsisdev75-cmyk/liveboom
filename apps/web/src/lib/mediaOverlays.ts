/** Overlays de GIF/sticker sobre foto o video. Un solo formato para Publicación, Boom Clip y Flash Boom. */

export type MediaOverlayKind = 'sticker' | 'gif' | 'text';

export type MediaOverlayItem = {
  id: string;
  kind: MediaOverlayKind;
  src: string;
  text?: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Índice de foto en carrusel (0 = principal). */
  mediaIndex?: number;
};

const MAX_OVERLAYS = 8;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.06, Math.min(0.94, value));
}

function clampScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.35, Math.min(2.8, value));
}

export function normalizeOverlay(raw: unknown): MediaOverlayItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const src = String(data.src || '').trim();
  const text = String(data.text || '').trim();
  const kind = data.kind === 'gif' || data.kind === 'text' || data.kind === 'sticker' ? data.kind : 'sticker';
  if (kind !== 'text' && !src) return null;
  return {
    id: String(data.id || '').trim() || `ov-${Math.random().toString(36).slice(2, 9)}`,
    kind,
    src,
    text: text || undefined,
    x: clamp01(Number(data.x)),
    y: clamp01(Number(data.y)),
    scale: clampScale(Number(data.scale) || 1),
    rotation: Number.isFinite(Number(data.rotation)) ? Number(data.rotation) : 0,
    mediaIndex: Math.max(0, Math.min(24, Math.floor(Number(data.mediaIndex) || 0))),
  };
}

export function parseMediaOverlays(value: unknown): MediaOverlayItem[] {
  if (!Array.isArray(value)) return [];
  const out: MediaOverlayItem[] = [];
  for (const item of value) {
    const next = normalizeOverlay(item);
    if (next) out.push(next);
    if (out.length >= MAX_OVERLAYS) break;
  }
  return out;
}

export function serializeMediaOverlays(items: MediaOverlayItem[]) {
  return parseMediaOverlays(items).map((item) => ({
    id: item.id,
    kind: item.kind,
    src: item.src,
    ...(item.text ? { text: item.text } : {}),
    x: item.x,
    y: item.y,
    scale: item.scale,
    rotation: item.rotation,
    ...(item.mediaIndex ? { mediaIndex: item.mediaIndex } : {}),
  }));
}

export function canAddOverlay(items: MediaOverlayItem[]) {
  return items.length < MAX_OVERLAYS;
}

export function newOverlayId() {
  return `ov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
