import type { LinkPreviewData } from './linkPreview';

export type SharedLocation = {
  lat: number;
  lng: number;
  label: string;
  accuracy?: number;
  /** Documento `liveLocations/{liveId}` cuando es ubicación en tiempo real. */
  liveId?: string;
  /** Quien comparte: su foto aparece en el marcador. */
  uid?: string;
  handle?: string;
};

export const LOCATION_PATH = '/ubicacion';
/** Enlace para compartir: el servidor da a WhatsApp/redes la imagen del mapa y redirige a LOCATION_PATH. */
export const LOCATION_SHARE_PATH = '/l';
export const LOCATION_MESSAGE_TEXT = '📍 Ubicación';

export const LIVE_LOCATION_DURATIONS = [
  { minutes: 15, label: '15 min' },
  { minutes: 60, label: '1 hora' },
  { minutes: 480, label: '8 horas' },
] as const;

const APP_HOSTS = new Set([
  'liveboomapp.com',
  'www.liveboomapp.com',
  'liveboom-app.web.app',
  'liveboom-app.firebaseapp.com',
  'localhost',
  '127.0.0.1',
]);

const LIVE_ID_RE = /^[A-Za-z0-9]{12,40}$/;
const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;

function validLatLng(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    (lat !== 0 || lng !== 0)
  );
}

function shareOrigin(): string {
  if (typeof window === 'undefined') return 'https://liveboomapp.com';
  const { hostname, origin } = window.location;
  return APP_HOSTS.has(hostname) && hostname !== 'localhost' && hostname !== '127.0.0.1' ? origin : 'https://liveboomapp.com';
}

export function buildLocationUrl(loc: SharedLocation): string {
  return `${shareOrigin()}${LOCATION_SHARE_PATH}?${locationParams(loc).toString()}`;
}

function locationParams(loc: SharedLocation): URLSearchParams {
  const params = new URLSearchParams({ lat: loc.lat.toFixed(5), lng: loc.lng.toFixed(5) });
  const label = loc.label.trim().slice(0, 80);
  if (label) params.set('n', label);
  if (loc.liveId && LIVE_ID_RE.test(loc.liveId)) params.set('live', loc.liveId);
  if (loc.uid && UID_RE.test(loc.uid)) params.set('u', loc.uid);
  const handle = (loc.handle || '').replace(/^@/, '').trim().slice(0, 32);
  if (handle) params.set('h', handle);
  return params;
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
  const path = url.pathname.replace(/\/$/, '');
  if (!APP_HOSTS.has(url.hostname) || (path !== LOCATION_PATH && path !== LOCATION_SHARE_PATH)) return null;
  return parseLocationParams(url.searchParams);
}

export function parseLocationParams(params: URLSearchParams): SharedLocation | null {
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (!validLatLng(lat, lng)) return null;
  const loc: SharedLocation = { lat, lng, label: String(params.get('n') || '').trim().slice(0, 80) };
  const liveId = String(params.get('live') || '');
  if (LIVE_ID_RE.test(liveId)) loc.liveId = liveId;
  const uid = String(params.get('u') || '');
  if (UID_RE.test(uid)) loc.uid = uid;
  const handle = String(params.get('h') || '').replace(/^@/, '').trim().slice(0, 32);
  if (handle) loc.handle = handle;
  return loc;
}

export function locationLinkPreview(loc: SharedLocation): LinkPreviewData {
  return {
    url: buildLocationUrl(loc),
    title: loc.liveId ? '🔴 Ubicación en tiempo real' : `📍 ${loc.label || 'Ubicación compartida'}`,
    description: loc.liveId ? 'Toca para seguirla en el mapa' : 'Toca para ver el mapa',
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
  return `${LOCATION_PATH}?${locationParams(loc).toString()}`;
}

export function whatsappShareUrl(text: string, url: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text}\n${url}`)}`;
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

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
