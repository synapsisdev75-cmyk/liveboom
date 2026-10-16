/** Metadatos de video de un regalo: original + procesado, sin deformar el archivo. */

export type GiftProcessingStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'error';

export type GiftMediaInfo = {
  hasAudio: boolean;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  originalAsset: string | null;
  processedAsset: string | null;
  backgroundRemoved: boolean;
  volume: number;
  processingStatus: GiftProcessingStatus;
  /** Canal alfa real (yuva / ALPHA_MODE), no solo la extensión. */
  hasAlpha?: boolean;
  alphaUsable?: boolean | null;
  alphaWarning?: string | null;
  /** El pipeline no pudo dejar una versión de producción segura. */
  needsReview?: boolean;
  ingestReason?: string | null;
  ingestMessage?: string | null;
  /** MP4 color arriba + máscara abajo para WebKit (iPhone / Safari), que ignora el alfa de WebM. */
  stackedAlphaAsset?: string | null;
  /** Video del que salió `stackedAlphaAsset`; si el regalo cambia de video, deja de usarse. */
  stackedAlphaSource?: string | null;
};

export function clampGiftVolume(value: unknown, fallback = 1): number {
  const n = Number(value);
  const base = Number.isFinite(n) ? n : fallback;
  return Math.min(1, Math.max(0, Math.round(base * 100) / 100));
}

export function defaultGiftMedia(): GiftMediaInfo {
  return {
    hasAudio: false,
    duration: 0,
    width: 0,
    height: 0,
    fps: 0,
    codec: '',
    originalAsset: null,
    processedAsset: null,
    backgroundRemoved: false,
    volume: 1,
    processingStatus: 'idle',
    hasAlpha: false,
    alphaUsable: null,
    alphaWarning: null,
    needsReview: false,
    ingestReason: null,
    ingestMessage: null,
    stackedAlphaAsset: null,
    stackedAlphaSource: null,
  };
}

export function normalizeGiftMedia(raw: unknown): GiftMediaInfo {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const statusRaw = String(row.processingStatus || 'idle');
  const processingStatus: GiftProcessingStatus = (
    ['idle', 'uploading', 'processing', 'ready', 'error'] as const
  ).includes(statusRaw as GiftProcessingStatus)
    ? (statusRaw as GiftProcessingStatus)
    : 'idle';
  const duration = Math.max(0, Number(row.duration) || 0);
  return {
    hasAudio: Boolean(row.hasAudio),
    duration: Number.isFinite(duration) ? Math.round(duration * 100) / 100 : 0,
    width: Math.max(0, Math.floor(Number(row.width) || 0)),
    height: Math.max(0, Math.floor(Number(row.height) || 0)),
    fps: Math.max(0, Math.round((Number(row.fps) || 0) * 100) / 100),
    codec: String(row.codec || '').slice(0, 40),
    originalAsset: row.originalAsset ? String(row.originalAsset) : null,
    processedAsset: row.processedAsset ? String(row.processedAsset) : null,
    backgroundRemoved: Boolean(row.backgroundRemoved),
    volume: clampGiftVolume(row.volume, 1),
    processingStatus: processingStatus === 'uploading' || processingStatus === 'processing' ? 'idle' : processingStatus,
    hasAlpha: Boolean(row.hasAlpha),
    alphaUsable: row.alphaUsable == null ? null : Boolean(row.alphaUsable),
    alphaWarning: row.alphaWarning ? String(row.alphaWarning) : null,
    needsReview: Boolean(row.needsReview),
    ingestReason: row.ingestReason ? String(row.ingestReason) : null,
    ingestMessage: row.ingestMessage ? String(row.ingestMessage) : null,
    stackedAlphaAsset: row.stackedAlphaAsset ? String(row.stackedAlphaAsset) : null,
    stackedAlphaSource: row.stackedAlphaSource ? String(row.stackedAlphaSource) : null,
  };
}

export function serializeGiftMedia(media: GiftMediaInfo | undefined): GiftMediaInfo {
  return normalizeGiftMedia(media);
}

export function giftPlaybackSrc(media: GiftMediaInfo | undefined, video?: string, prefer: 'active' | 'original' | 'processed' = 'active'): string {
  if (prefer === 'original') return media?.originalAsset || video || '';
  if (prefer === 'processed') return media?.processedAsset || video || '';
  if (media?.processedAsset) return media.processedAsset;
  return video || media?.originalAsset || '';
}

/**
 * Clave estable del archivo (sin token ni query). El token de Storage cambia
 * y iPhone dejaba de usar la versión transparente.
 */
export function giftAssetKey(url: string | null | undefined): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const noHash = raw.split('#')[0];
  const encoded = noHash.match(/\/o\/([^?]+)/);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      return encoded[1];
    }
  }
  const gs = noHash.match(/^gs:\/\/[^/]+\/(.+)$/);
  if (gs?.[1]) return gs[1];
  return noHash.split('?')[0];
}

export function sameGiftAsset(a?: string | null, b?: string | null): boolean {
  const left = giftAssetKey(a);
  const right = giftAssetKey(b);
  return Boolean(left && right && left === right);
}

/** Versión stacked alpha vigente para `playbackSrc`, o '' si falta o quedó vieja. */
export function giftStackedAlphaSrc(media: GiftMediaInfo | undefined, playbackSrc: string): string {
  if (!media?.stackedAlphaAsset || !playbackSrc) return '';
  return sameGiftAsset(media.stackedAlphaSource, playbackSrc) ? media.stackedAlphaAsset : '';
}

/**
 * Al publicar el catálogo el admin a veces no trae `stackedAlpha*` (lo escribe el
 * servidor). Si el video no cambió, se conserva la versión iPhone remota.
 */
export function preserveGiftStackedAlpha<T extends { video?: string; media?: GiftMediaInfo }>(
  remote: T | null | undefined,
  local: T,
): T {
  if (!local) return local;
  const localSrc = giftPlaybackSrc(local.media, local.video);
  if (giftStackedAlphaSrc(local.media, localSrc)) return local;
  const remoteMedia = remote?.media;
  if (!remoteMedia?.stackedAlphaAsset) return local;
  const remoteSrc = giftPlaybackSrc(remoteMedia, remote?.video);
  if (!sameGiftAsset(localSrc, remoteSrc) && !sameGiftAsset(localSrc, remoteMedia.stackedAlphaSource)) {
    return local;
  }
  return {
    ...local,
    media: {
      ...(local.media || defaultGiftMedia()),
      stackedAlphaAsset: remoteMedia.stackedAlphaAsset,
      stackedAlphaSource: localSrc || remoteMedia.stackedAlphaSource || null,
    },
  };
}

export function giftPlaybackDurationMs(media: GiftMediaInfo | undefined, fallbackSec = 9): number {
  const sec = media?.duration && media.duration > 0.2 ? media.duration : fallbackSec;
  return Math.min(32_000, Math.round(sec * 1000) + 800);
}
