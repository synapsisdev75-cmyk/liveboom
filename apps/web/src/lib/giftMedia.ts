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
  };
}

export function serializeGiftMedia(media: GiftMediaInfo | undefined): GiftMediaInfo {
  return normalizeGiftMedia(media);
}

export function giftPlaybackSrc(media: GiftMediaInfo | undefined, video?: string, prefer: 'active' | 'original' | 'processed' = 'active'): string {
  if (prefer === 'original') return media?.originalAsset || video || '';
  if (prefer === 'processed') return media?.processedAsset || video || '';
  if (media?.backgroundRemoved && media.processedAsset) return media.processedAsset;
  return video || media?.originalAsset || '';
}

export function giftPlaybackDurationMs(media: GiftMediaInfo | undefined, fallbackSec = 9): number {
  const sec = media?.duration && media.duration > 0.2 ? media.duration : fallbackSec;
  return Math.min(32_000, Math.round(sec * 1000) + 800);
}
