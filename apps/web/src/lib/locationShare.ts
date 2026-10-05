import type { LinkPreviewData } from './linkPreview';

export type SharedLocation = { lat: number; lng: number; label: string; accuracy?: number };

export const LOCATION_PATH = '/ubicacion';
export const LOCATION_MESSAGE_TEXT = '📍 Ubicación';

const APP_HOSTS = new Set([
  'liveboomapp.com',
  'www.liveboomapp.com',
  'liveboom-app.web.app',
  'liveboom-app.firebaseapp.com',
  'localhost',
  '127.0.0.1',
]);

function validLatLng(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    (lat !== 0 || lng !== 0)
  );
}

export function buildLocationUrl(loc: SharedLocation): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://liveboomapp.com';
  const params = new URLSearchParams({ lat: loc.lat.toFixed(5), lng: loc.lng.toFixed(5) });
  const label = loc.label.trim().slice(0, 80);
  if (label) params.set('n', label);
  return `${origin}${LOCATION_PATH}?${params.toString()}`;
}

/** Reconoce solo enlaces de ubicación de LiveBoom; cualquier otro enlace devuelve null. */
export function parseLocationUrl(raw: string | null | undefined): SharedLocation | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!APP_HOSTS.has(url.hostname) || url.pathname.replace(/\/$/, '') !== LOCATION_PATH) return null;
  return parseLocationParams(url.searchParams);
}

export function parseLocationParams(params: URLSearchParams): SharedLocation | null {
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (!validLatLng(lat, lng)) return null;
  return { lat, lng, label: String(params.get('n') || '').trim().slice(0, 80) };
}

export function locationLinkPreview(loc: SharedLocation): LinkPreviewData {
  return {
    url: buildLocationUrl(loc),
    title: `📍 ${loc.label || 'Ubicación compartida'}`,
    description: 'Toca para ver el mapa',
    image: '',
    siteName: 'LiveBoom · Ubicación',
  };
}

export function directionsUrl(loc: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
}

export function openStreetMapUrl(loc: { lat: number; lng: number }): string {
  return `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=16/${loc.lat}/${loc.lng}`;
}

export function locationInAppHref(loc: SharedLocation): string {
  const url = new URL(buildLocationUrl(loc));
  return `${url.pathname}${url.search}`;
}

export type LocateError = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

/** Pide la posición actual: el navegador muestra su solicitud de permiso si aún no se dio. */
export function locateOnce(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject('unsupported' satisfies LocateError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) =>
        reject(
          (err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable') satisfies LocateError,
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 15_000 },
    );
  });
}

export function locateErrorMessage(code: unknown): string {
  switch (code) {
    case 'unsupported':
      return 'Tu dispositivo no permite compartir ubicación.';
    case 'denied':
      return 'Permiso de ubicación bloqueado. Actívalo en la configuración del navegador (ícono 🔒 junto a la dirección) y vuelve a intentarlo.';
    case 'timeout':
      return 'La ubicación tardó demasiado. Revisa el GPS o la conexión e inténtalo de nuevo.';
    default:
      return 'No se pudo obtener tu ubicación. Inténtalo de nuevo.';
  }
}
