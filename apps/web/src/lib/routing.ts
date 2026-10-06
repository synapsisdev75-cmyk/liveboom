import { GOOGLE_MAPS_API_KEY, type TravelMode } from './googleMaps';

export type LngLat = [number, number];
export type LatLng = { lat: number; lng: number };

export type RouteStep = {
  /** Maniobra que se hace en `at` (girar, tomar la glorieta, llegar…). */
  instruction: string;
  at: LngLat;
  /** Distancia a lo largo de la ruta hasta `at`. */
  alongM: number;
};

export type Route = {
  coords: LngLat[];
  /** Distancia acumulada desde el inicio hasta cada vértice. */
  cumulative: number[];
  distanceM: number;
  durationS: number;
  steps: RouteStep[];
  provider: 'google' | 'osm';
};

const EARTH_M = 6_371_000;
const RAD = Math.PI / 180;

export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: LngLat, b: LngLat): number {
  const y = Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD);
  const x =
    Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) -
    Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

function cumulativeOf(coords: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i += 1) out.push(out[i - 1]! + distanceM(coords[i - 1]!, coords[i]!));
  return out;
}

export type RouteProjection = {
  /** Distancia recorrida a lo largo de la ruta hasta el punto más cercano. */
  alongM: number;
  /** Qué tan lejos está el punto de la ruta. */
  offRouteM: number;
  segment: number;
};

export function projectOnRoute(point: LngLat, coords: LngLat[], cumulative: number[]): RouteProjection {
  const k = Math.cos(point[1] * RAD) * RAD * EARTH_M;
  const ky = RAD * EARTH_M;
  const px = point[0] * k;
  const py = point[1] * ky;
  let best: RouteProjection = { alongM: 0, offRouteM: Number.POSITIVE_INFINITY, segment: 0 };
  if (coords.length === 1) {
    return { alongM: 0, offRouteM: distanceM(point, coords[0]!), segment: 0 };
  }
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const ax = a[0] * k;
    const ay = a[1] * ky;
    const bx = b[0] * k;
    const by = b[1] * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const off = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (off < best.offRouteM) {
      const start = cumulative[i] ?? 0;
      best = { alongM: start + t * ((cumulative[i + 1] ?? start) - start), offRouteM: off, segment: i };
    }
  }
  return best;
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '';
  if (m < 1000) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

export function formatDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

export function decodePolyline(encoded: string): LngLat[] {
  const out: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index) - 63;
        index += 1;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}

function withSteps(
  coords: LngLat[],
  distanceM: number,
  durationS: number,
  rawSteps: { instruction: string; at: LngLat }[],
  provider: Route['provider'],
): Route {
  const cumulative = cumulativeOf(coords);
  const steps = rawSteps
    .filter((s) => s.instruction)
    .map((s) => ({ ...s, alongM: projectOnRoute(s.at, coords, cumulative).alongM }));
  return {
    coords,
    cumulative,
    distanceM: distanceM || cumulative[cumulative.length - 1] || 0,
    durationS,
    steps,
    provider,
  };
}

class RouteHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`route ${status}`);
    this.status = status;
  }
}

/** Se apaga en la sesión si Routes API no está habilitada en el proyecto de Google. */
let googleRoutesDisabled = false;

const GOOGLE_MODE: Record<TravelMode, string> = {
  driving: 'DRIVE',
  motorcycle: 'TWO_WHEELER',
  walking: 'WALK',
};

async function googleRoute(from: LatLng, to: LatLng, mode: TravelMode, signal?: AbortSignal): Promise<Route> {
  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: GOOGLE_MODE[mode],
    languageCode: 'es',
    units: 'METRIC',
  };
  if (mode !== 'walking') body.routingPreference = 'TRAFFIC_AWARE';
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask':
        'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.startLocation',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new RouteHttpError(res.status);
  const data = (await res.json()) as {
    routes?: {
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
      legs?: {
        steps?: {
          navigationInstruction?: { instructions?: string };
          startLocation?: { latLng?: { latitude?: number; longitude?: number } };
        }[];
      }[];
    }[];
  };
  const route = data.routes?.[0];
  const encoded = route?.polyline?.encodedPolyline;
  if (!route || !encoded) throw new RouteHttpError(404);
  const coords = decodePolyline(encoded);
  const steps = (route.legs || []).flatMap((leg) =>
    (leg.steps || []).map((step) => ({
      instruction: step.navigationInstruction?.instructions?.split('\n')[0] || '',
      at: [Number(step.startLocation?.latLng?.longitude), Number(step.startLocation?.latLng?.latitude)] as LngLat,
    })),
  );
  const end = coords[coords.length - 1];
  if (end) steps.push({ instruction: 'Llegaste a tu destino', at: end });
  return withSteps(
    coords,
    Number(route.distanceMeters) || 0,
    Number.parseFloat(route.duration || '0') || 0,
    steps.filter((s) => Number.isFinite(s.at[0]) && Number.isFinite(s.at[1])),
    'google',
  );
}

const TURN: Record<string, string> = {
  uturn: 'Da la vuelta en U',
  'sharp right': 'Gira fuerte a la derecha',
  right: 'Gira a la derecha',
  'slight right': 'Gira levemente a la derecha',
  straight: 'Sigue derecho',
  'slight left': 'Gira levemente a la izquierda',
  left: 'Gira a la izquierda',
  'sharp left': 'Gira fuerte a la izquierda',
};

type OsrmStep = {
  name?: string;
  maneuver?: { type?: string; modifier?: string; exit?: number; location?: LngLat };
};

function osrmInstruction(step: OsrmStep): string {
  const type = step.maneuver?.type || '';
  const modifier = step.maneuver?.modifier || '';
  const road = step.name ? ` por ${step.name}` : '';
  switch (type) {
    case 'depart':
      return `Inicia el recorrido${road}`;
    case 'arrive':
      return 'Llegaste a tu destino';
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return step.maneuver?.exit
        ? `En la glorieta, toma la salida ${step.maneuver.exit}${road}`
        : `Entra a la glorieta${road}`;
    case 'continue':
    case 'new name':
      return modifier && modifier !== 'straight' ? `${TURN[modifier] || 'Continúa'}${road}` : `Continúa${road}`;
    case 'fork':
      return `En la bifurcación, mantente a la ${modifier.includes('left') ? 'izquierda' : 'derecha'}${road}`;
    case 'merge':
      return `Incorpórate${road}`;
    case 'on ramp':
      return `Toma la entrada${road}`;
    case 'off ramp':
      return `Toma la salida${road}`;
    case 'end of road':
      return `Al final de la vía, ${(TURN[modifier] || 'continúa').toLowerCase()}${road}`;
    default:
      return `${TURN[modifier] || 'Continúa'}${road}`;
  }
}

const OSM_PROFILE: Record<TravelMode, string> = {
  driving: 'routed-car/route/v1/driving',
  motorcycle: 'routed-car/route/v1/driving',
  walking: 'routed-foot/route/v1/foot',
};

async function osmRoute(from: LatLng, to: LatLng, mode: TravelMode, signal?: AbortSignal): Promise<Route> {
  const path = `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const urls = [`https://routing.openstreetmap.de/${OSM_PROFILE[mode]}/${path}`];
  if (mode !== 'walking') urls.push(`https://router.project-osrm.org/route/v1/driving/${path}`);
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new RouteHttpError(res.status);
      const data = (await res.json()) as {
        routes?: {
          distance?: number;
          duration?: number;
          geometry?: { coordinates?: LngLat[] };
          legs?: { steps?: OsrmStep[] }[];
        }[];
      };
      const route = data.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (!route || !coords?.length) throw new RouteHttpError(404);
      const steps = (route.legs || []).flatMap((leg) =>
        (leg.steps || [])
          .filter((step) => step.maneuver?.location)
          .map((step) => ({ instruction: osrmInstruction(step), at: step.maneuver!.location as LngLat })),
      );
      return withSteps(coords, Number(route.distance) || 0, Number(route.duration) || 0, steps, 'osm');
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new Error('Sin ruta');
}

/** Ruta con Google Routes (tráfico real) y respaldo en OpenStreetMap si Google no responde. */
export async function fetchRoute(from: LatLng, to: LatLng, mode: TravelMode, signal?: AbortSignal): Promise<Route> {
  if (!googleRoutesDisabled) {
    try {
      return await googleRoute(from, to, mode, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err instanceof RouteHttpError && err.status === 403) googleRoutesDisabled = true;
    }
  }
  return osmRoute(from, to, mode, signal);
}
