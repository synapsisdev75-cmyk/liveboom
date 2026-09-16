/**
 * Perfiles de calidad Screen Share (juegos).
 * Empezar en NORMAL (720p / 30 FPS) cuando el dispositivo lo permita.
 */

export type ScreenShareQualityId = 'LOW' | 'NORMAL' | 'HIGH';

export type ScreenShareQualityProfile = {
  id: ScreenShareQualityId;
  /** Bitrate máximo de publicación de video (bps). */
  maxBitrate: number;
  maxFps: number;
  /** Etiqueta UI / logs. */
  label: string;
  /** Objetivo de lado corto (px). */
  minShortSide: number;
};

export const SCREEN_SHARE_QUALITY_PROFILES: Record<ScreenShareQualityId, ScreenShareQualityProfile> = {
  LOW: {
    id: 'LOW',
    maxBitrate: 1_400_000,
    maxFps: 24,
    label: '720p · 20–24 FPS',
    minShortSide: 720,
  },
  NORMAL: {
    id: 'NORMAL',
    maxBitrate: 2_800_000,
    maxFps: 30,
    label: '720p · 30 FPS',
    minShortSide: 720,
  },
  HIGH: {
    id: 'HIGH',
    maxBitrate: 4_500_000,
    maxFps: 30,
    label: '1080p · 30 FPS',
    minShortSide: 1080,
  },
};

let activeQuality: ScreenShareQualityId = 'NORMAL';

export function getScreenShareQuality(): ScreenShareQualityProfile {
  return SCREEN_SHARE_QUALITY_PROFILES[activeQuality];
}

export function setScreenShareQuality(id: ScreenShareQualityId): ScreenShareQualityProfile {
  activeQuality = id in SCREEN_SHARE_QUALITY_PROFILES ? id : 'NORMAL';
  return getScreenShareQuality();
}
