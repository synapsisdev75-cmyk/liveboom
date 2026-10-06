/** Clave de navegador de Google Maps Platform (restringida por dominio en Google Cloud). */
export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBPNextB9Fn74aVa5FVUHRYXLqAPjiOxJE';

export type TravelMode = 'driving' | 'motorcycle' | 'walking';

export const TRAVEL_MODES: { id: TravelMode; label: string }[] = [
  { id: 'driving', label: 'Auto' },
  { id: 'motorcycle', label: 'Moto' },
  { id: 'walking', label: 'A pie' },
];

export function parseTravelMode(raw: string | null | undefined): TravelMode {
  return raw === 'motorcycle' || raw === 'walking' ? raw : 'driving';
}

export const TRAVEL_MODE_STORAGE_KEY = 'lb.travelMode';

/** Último medio de transporte elegido en "Cómo llegar". */
export function readSavedTravelMode(): TravelMode {
  try {
    return parseTravelMode(localStorage.getItem(TRAVEL_MODE_STORAGE_KEY));
  } catch {
    return 'driving';
  }
}

/** Abre la navegación de la app/web de Google Maps hacia el destino. */
export function googleMapsDirectionsUrl(
  dest: { lat: number; lng: number },
  mode: TravelMode = 'driving',
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${dest.lat},${dest.lng}`,
    travelmode: mode === 'walking' ? 'walking' : 'driving',
    dir_action: 'navigate',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

export type PlacePoint = { lat: number; lng: number; label: string };

function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** Una sesión agrupa la búsqueda y el detalle del lugar elegido (Places cobra por sesión). */
export function createPlacesSession() {
  let token = newSessionToken();

  async function search(
    input: string,
    near: { lat: number; lng: number } | null,
    signal?: AbortSignal,
  ): Promise<PlaceSuggestion[]> {
    const text = input.trim();
    if (text.length < 2) return [];
    const body: Record<string, unknown> = { input: text, languageCode: 'es', sessionToken: token };
    if (near) {
      body.locationBias = {
        circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30_000 },
      };
      body.origin = { latitude: near.lat, longitude: near.lng };
    }
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`places ${res.status}`);
    const data = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        };
      }[];
    };
    return (data.suggestions || [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .map((p) => ({
        placeId: String(p.placeId),
        primary: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondary: p.structuredFormat?.secondaryText?.text || '',
      }));
  }

  async function resolve(placeId: string): Promise<PlacePoint> {
    const params = new URLSearchParams({ languageCode: 'es', sessionToken: token });
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params.toString()}`,
      {
        headers: {
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'location,displayName,formattedAddress',
        },
      },
    );
    token = newSessionToken();
    if (!res.ok) throw new Error(`place ${res.status}`);
    const data = (await res.json()) as {
      location?: { latitude?: number; longitude?: number };
      displayName?: { text?: string };
      formattedAddress?: string;
    };
    const lat = Number(data.location?.latitude);
    const lng = Number(data.location?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('place sin coordenadas');
    return { lat, lng, label: data.displayName?.text || data.formattedAddress || '' };
  }

  return { search, resolve };
}
