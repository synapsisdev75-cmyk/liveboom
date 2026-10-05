import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { buildPublicGeo, parsePublicGeo, sameGeoKeys, type PublicGeo } from './geoKeys';
import { fetchPrivateLocation } from './userLocation';

const VIEWER_GEO_KEY = 'liveboom.geo.viewer.v1';
const SYNC_KEY = 'liveboom.geo.sync.v2';
const VIEWER_GEO_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const SYNC_EVERY_MS = 3 * 24 * 60 * 60 * 1000;
/** Una zona por GPS (más precisa) no se pisa con la de IP durante este tiempo. */
const GPS_PRIORITY_MS = 30 * 24 * 60 * 60 * 1000;

async function fetchJson(url: string, timeoutMs = 5000): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Zona aproximada por IP (ciudad / departamento / país), sin GPS ni permisos. */
async function detectIpGeo(): Promise<PublicGeo | null> {
  const geojs = await fetchJson('https://get.geojs.io/v1/ip/geo.json');
  if (geojs && (geojs.country_code || geojs.country)) {
    const geo = buildPublicGeo({
      city: geojs.city,
      region: geojs.region,
      country: geojs.country,
      countryCode: geojs.country_code,
      source: 'ip',
    });
    if (geo) return geo;
  }
  const ipwho = await fetchJson('https://ipwho.is/');
  if (ipwho && ipwho.success !== false && (ipwho.country_code || ipwho.country)) {
    return buildPublicGeo({
      city: ipwho.city,
      region: ipwho.region,
      country: ipwho.country,
      countryCode: ipwho.country_code,
      source: 'ip',
    });
  }
  return null;
}

function readCachedViewerGeo(): PublicGeo | null {
  try {
    const raw = localStorage.getItem(VIEWER_GEO_KEY);
    if (!raw) return null;
    const geo = parsePublicGeo(JSON.parse(raw));
    if (!geo || Date.now() - geo.updatedAtMs > VIEWER_GEO_TTL_MS) return null;
    return geo;
  } catch {
    return null;
  }
}

let viewerGeoInflight: Promise<PublicGeo | null> | null = null;

/** Zona del visitante actual (caché local 3 días). Sirve también sin sesión. */
export function detectViewerGeo(): Promise<PublicGeo | null> {
  const cached = readCachedViewerGeo();
  if (cached) return Promise.resolve(cached);
  if (!viewerGeoInflight) {
    viewerGeoInflight = detectIpGeo()
      .then((geo) => {
        if (geo) {
          try {
            localStorage.setItem(VIEWER_GEO_KEY, JSON.stringify(geo));
          } catch {
            // ignore
          }
        }
        return geo;
      })
      .finally(() => {
        viewerGeoInflight = null;
      });
  }
  return viewerGeoInflight;
}

function syncedRecently(uid: string): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(`${SYNC_KEY}:${uid}`) || 0) < SYNC_EVERY_MS;
  } catch {
    return false;
  }
}

function markSynced(uid: string) {
  try {
    localStorage.setItem(`${SYNC_KEY}:${uid}`, String(Date.now()));
  } catch {
    // ignore
  }
}

/**
 * Guarda en `users/{uid}.geo` la zona aproximada (ciudad, departamento, país)
 * para recomendar creadores cercanos. Prioriza la ubicación compartida en «Tu zona».
 */
export async function syncPublicGeo(uid: string, options?: { force?: boolean }): Promise<void> {
  const id = String(uid || '').trim();
  if (!id) return;
  if (!options?.force && syncedRecently(id)) return;
  try {
    const ref = doc(db, 'users', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const current = parsePublicGeo((snap.data() as Record<string, unknown>).geo);

    let next: PublicGeo | null = null;
    const privateGeo = await fetchPrivateLocation(id).catch(() => null);
    if (privateGeo && (privateGeo.city || privateGeo.country)) {
      const knownRegion = privateGeo.regionId !== 'otros' && privateGeo.regionId !== 'nacional';
      next = buildPublicGeo({
        city: privateGeo.city,
        region: knownRegion ? privateGeo.regionLabel : '',
        country: privateGeo.country,
        source: 'gps',
      });
    } else if (current?.source === 'gps' && Date.now() - current.updatedAtMs < GPS_PRIORITY_MS) {
      markSynced(id);
      return;
    } else {
      next = await detectViewerGeo();
    }
    if (!next) {
      markSynced(id);
      return;
    }
    if (sameGeoKeys(current, next) && current?.source === next.source) {
      markSynced(id);
      return;
    }
    await updateDoc(ref, { geo: next });
    markSynced(id);
  } catch {
    // Sin zona: las recomendaciones usan solo señales sociales.
  }
}
