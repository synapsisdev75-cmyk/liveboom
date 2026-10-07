/**
 * Aviso de actualización de la app nativa (Android / iOS).
 * Super Admin publica en `config/appUpdate` la versión disponible en cada tienda; la app compara
 * con su número de compilación (Android `versionCode`, iOS `CFBundleVersion`).
 */

export type AppStorePlatform = 'android' | 'ios';

export type PlatformRelease = {
  /** Versión visible, p. ej. "1.0.63". */
  latestVersion: string;
  /** Compilación publicada en la tienda; 0 = sin aviso. */
  latestBuild: number;
  /** Compilaciones por debajo de esta deben actualizar para seguir usando la app; 0 = nunca obligatorio. */
  minBuild: number;
  storeUrl: string;
  notes: string;
};

export type AppUpdateConfig = Record<AppStorePlatform, PlatformRelease>;

export type AppUpdateSnooze = { build: number; until: number };

export type AppUpdateDecision =
  | { kind: 'none' }
  | { kind: 'optional' | 'required'; release: PlatformRelease };

export const APP_UPDATE_SNOOZE_MS = 24 * 60 * 60_000;

export const DEFAULT_STORE_URL: Record<AppStorePlatform, string> = {
  android: 'https://play.google.com/store/apps/details?id=com.liveboom.app',
  ios: 'https://apps.apple.com/search?term=LiveBoom',
};

const NOTES_MAX = 400;

function toBuild(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Solo enlaces https; cualquier otro valor vuelve a la tienda oficial. */
export function safeStoreUrl(raw: unknown, platform: AppStorePlatform): string {
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_STORE_URL[platform];
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' ? url.toString() : DEFAULT_STORE_URL[platform];
  } catch {
    return DEFAULT_STORE_URL[platform];
  }
}

export function normalizeRelease(raw: unknown, platform: AppStorePlatform): PlatformRelease {
  const data = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof PlatformRelease, unknown>>) : {};
  const latestBuild = toBuild(data.latestBuild);
  return {
    latestVersion: typeof data.latestVersion === 'string' ? data.latestVersion.trim().slice(0, 32) : '',
    latestBuild,
    minBuild: Math.min(toBuild(data.minBuild), latestBuild),
    storeUrl: safeStoreUrl(data.storeUrl, platform),
    notes: typeof data.notes === 'string' ? data.notes.trim().slice(0, NOTES_MAX) : '',
  };
}

export function normalizeAppUpdateConfig(raw: unknown): AppUpdateConfig {
  const data = raw && typeof raw === 'object' ? (raw as Partial<Record<AppStorePlatform, unknown>>) : {};
  return {
    android: normalizeRelease(data.android, 'android'),
    ios: normalizeRelease(data.ios, 'ios'),
  };
}

export function decideAppUpdate(
  release: PlatformRelease | null | undefined,
  installedBuild: number | null,
  snooze: AppUpdateSnooze | null,
  now: number,
): AppUpdateDecision {
  if (!release || !installedBuild || installedBuild <= 0) return { kind: 'none' };
  if (release.latestBuild <= installedBuild) return { kind: 'none' };
  if (release.minBuild > installedBuild) return { kind: 'required', release };
  if (snooze && snooze.build === release.latestBuild && snooze.until > now) return { kind: 'none' };
  return { kind: 'optional', release };
}
