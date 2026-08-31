import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './firebase';
import { regionFromNominatimState, regionLabel, type RegionId } from './promoRegions';

const db = getFirestore(firebaseApp);

export type PrivateUserLocation = {
  lat: number;
  lng: number;
  regionId: RegionId;
  regionLabel: string;
  city: string;
  country: string;
  updatedAtMs: number;
};

const LS_KEY = 'liveboom:locationPromptDismissed';

export function locationPromptDismissed() {
  try {
    return localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissLocationPrompt() {
  try {
    localStorage.setItem(LS_KEY, '1');
  } catch {
    // ignore
  }
}

/** Solo el dueño puede leer/escribir: users/{uid}/private/geo */
export async function fetchPrivateLocation(uid: string): Promise<PrivateUserLocation | null> {
  const id = String(uid || '').trim();
  if (!id) return null;
  const snap = await getDoc(doc(db, 'users', id, 'private', 'geo'));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    lat: Number(data.lat || 0),
    lng: Number(data.lng || 0),
    regionId: (String(data.regionId || 'otros') as RegionId) || 'otros',
    regionLabel: String(data.regionLabel || regionLabel(String(data.regionId || 'otros'))),
    city: String(data.city || ''),
    country: String(data.country || ''),
    updatedAtMs: Number(data.updatedAtMs || 0),
  };
}

async function reverseGeocode(lat: number, lng: number) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('accept-language', 'es');
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('No se pudo resolver la ubicación');
  const data = (await res.json()) as {
    address?: {
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      state?: string;
      country?: string;
      country_code?: string;
    };
  };
  const address = data.address || {};
  const city =
    address.city || address.town || address.village || address.municipality || '';
  const regionId = regionFromNominatimState(address.state);
  return {
    city,
    country: address.country || 'Colombia',
    regionId,
    regionLabel: regionLabel(regionId),
  };
}

export async function savePrivateLocation(
  uid: string,
  coords: { lat: number; lng: number },
): Promise<PrivateUserLocation> {
  const id = String(uid || '').trim();
  if (!id) throw new Error('Usuario inválido');
  const geo = await reverseGeocode(coords.lat, coords.lng);
  const payload: PrivateUserLocation = {
    lat: coords.lat,
    lng: coords.lng,
    regionId: geo.regionId,
    regionLabel: geo.regionLabel,
    city: geo.city,
    country: geo.country,
    updatedAtMs: Date.now(),
  };
  await setDoc(
    doc(db, 'users', id, 'private', 'geo'),
    {
      ...payload,
      // No se expone en el perfil público; solo el dueño lee este doc.
      private: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return payload;
}

export function requestBrowserLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu dispositivo no soporta ubicación'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        reject(new Error(err.message || 'No se pudo obtener la ubicación'));
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60_000 },
    );
  });
}
