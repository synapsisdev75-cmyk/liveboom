import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { create } from 'zustand';
import { db } from './firebase';
import { locateErrorMessage, locateOnce, type SharedLocation } from './locationShare';
import { reverseGeocode } from './userLocation';
import { useAuthStore } from '../store/authStore';

export type LiveLocationDoc = {
  ownerUid: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  label: string;
  active: boolean;
  startedAtMs: number;
  expiresAtMs: number;
  /** "Hasta desactivarla": el vencimiento se renueva mientras el dueño comparte. */
  untilOff: boolean;
  endedAtMs: number;
};

export type LiveLocationState =
  | { status: 'loading' }
  | { status: 'live'; data: LiveLocationDoc }
  | { status: 'ended'; data: LiveLocationDoc | null };

const COLLECTION = 'liveLocations';
const STORAGE_KEY = 'lb.liveLocationShare';
const MIN_WRITE_MS = 4_000;
const HEARTBEAT_MS = 25_000;
const MIN_MOVE_M = 8;
/** "Hasta desactivarla": ventana renovable; si la app se cierra sin detener, vence sola. */
const UNTIL_OFF_WINDOW_MS = 30 * 60_000;

function readDoc(raw: Record<string, unknown> | undefined): LiveLocationDoc | null {
  if (!raw) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    ownerUid: String(raw.ownerUid || ''),
    handle: String(raw.handle || ''),
    displayName: String(raw.displayName || ''),
    avatarUrl: typeof raw.avatarUrl === 'string' && raw.avatarUrl ? raw.avatarUrl : null,
    lat,
    lng,
    accuracy: Number(raw.accuracy) || 0,
    heading: Number.isFinite(Number(raw.heading)) && raw.heading !== null ? Number(raw.heading) : null,
    label: String(raw.label || ''),
    active: raw.active === true,
    startedAtMs: Number(raw.startedAtMs) || 0,
    expiresAtMs: Number(raw.expiresAtMs) || 0,
    untilOff: raw.untilOff === true,
    endedAtMs: Number(raw.endedAtMs) || 0,
  };
}

/** Sigue una ubicación en tiempo real; pasa a `ended` al detenerse, expirar o borrarse. */
export function listenLiveLocation(liveId: string, onChange: (state: LiveLocationState) => void): () => void {
  let latest: LiveLocationDoc | null = null;
  let expiryTimer: number | undefined;
  const emit = () => {
    window.clearTimeout(expiryTimer);
    if (!latest || !latest.active || latest.expiresAtMs <= Date.now()) {
      onChange({ status: 'ended', data: latest });
      return;
    }
    onChange({ status: 'live', data: latest });
    expiryTimer = window.setTimeout(emit, Math.min(latest.expiresAtMs - Date.now() + 250, 2 ** 31 - 1));
  };
  const unsub = onSnapshot(
    doc(db, COLLECTION, liveId),
    (snap) => {
      latest = snap.exists() ? readDoc(snap.data()) : null;
      emit();
    },
    () => onChange({ status: 'ended', data: latest }),
  );
  return () => {
    window.clearTimeout(expiryTimer);
    unsub();
  };
}

export function useLiveLocation(liveId?: string | null): LiveLocationState | null {
  const [state, setState] = useState<LiveLocationState | null>(liveId ? { status: 'loading' } : null);
  useEffect(() => {
    if (!liveId) {
      setState(null);
      return;
    }
    setState({ status: 'loading' });
    return listenLiveLocation(liveId, setState);
  }, [liveId]);
  return state;
}

/** Posición de este dispositivo mientras `enabled` (no se guarda en ningún lado). */
export function useDevicePosition(enabled: boolean): {
  position: { lat: number; lng: number; accuracy: number } | null;
  error: string;
} {
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError(locateErrorMessage('unsupported'));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError('');
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (err) =>
        setError(
          locateErrorMessage(
            err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable',
          ),
        ),
      { enableHighAccuracy: false, maximumAge: 15_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return { position: enabled ? position : null, error: enabled ? error : '' };
}

/** Re-renderiza cada `ms` mientras `active` (cuentas regresivas). */
export function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

type ShareState = {
  shareId: string | null;
  ownerUid: string | null;
  startedAtMs: number;
  expiresAtMs: number;
  untilOff: boolean;
  lat: number | null;
  lng: number | null;
  accuracy: number;
  label: string;
  starting: boolean;
  error: string;
  start: (minutes: number) => Promise<SharedLocation | null>;
  stop: () => Promise<void>;
  resume: () => void;
  currentLocation: () => SharedLocation | null;
};

let watchId: number | null = null;
let expiryTimer: number | undefined;
let heartbeatTimer: number | undefined;
let lastWrite = { at: 0, lat: 0, lng: 0 };
let visibilityHandler: (() => void) | null = null;

/** Al detener: sin GPS, sin temporizadores y sin listeners (ningún acceso posterior a la ubicación). */
function clearRuntime() {
  if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
  window.clearTimeout(expiryTimer);
  window.clearInterval(heartbeatTimer);
  if (visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityHandler);
  }
  visibilityHandler = null;
}

/** Marca la ubicación como finalizada conservando el último punto para quien la recibió. */
async function endShareDoc(shareId: string) {
  const now = Date.now();
  try {
    await updateDoc(doc(db, COLLECTION, shareId), {
      active: false,
      endedAtMs: now,
      expiresAtMs: now,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Documento antiguo sin permisos de actualización o ya borrado: se elimina.
    await deleteDoc(doc(db, COLLECTION, shareId)).catch(() => undefined);
  }
}

function persist(
  value: { shareId: string; ownerUid: string; startedAtMs: number; expiresAtMs: number; untilOff?: boolean } | null,
) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* almacenamiento bloqueado */
  }
}

export const useLiveLocationShare = create<ShareState>((set, get) => {
  async function pushPosition(pos: { lat: number; lng: number; accuracy: number; heading: number | null }, force = false) {
    const { shareId } = get();
    if (!shareId) return;
    set({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy });
    const now = Date.now();
    const moved = distanceM(lastWrite, pos);
    if (!force && now - lastWrite.at < MIN_WRITE_MS) return;
    if (!force && moved < MIN_MOVE_M && now - lastWrite.at < HEARTBEAT_MS) return;
    lastWrite = { at: now, lat: pos.lat, lng: pos.lng };
    const renew = get().untilOff ? now + UNTIL_OFF_WINDOW_MS : 0;
    if (renew) {
      set({ expiresAtMs: renew });
      scheduleExpiry();
      const s = get();
      if (s.ownerUid) {
        persist({ shareId, ownerUid: s.ownerUid, startedAtMs: s.startedAtMs, expiresAtMs: renew, untilOff: true });
      }
    }
    try {
      await updateDoc(doc(db, COLLECTION, shareId), {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: Math.round(pos.accuracy),
        heading: pos.heading,
        updatedAt: serverTimestamp(),
        ...(renew ? { expiresAtMs: renew } : null),
      });
    } catch {
      /* se reintenta con la siguiente lectura del GPS */
    }
  }

  function scheduleExpiry() {
    const remaining = get().expiresAtMs - Date.now();
    window.clearTimeout(expiryTimer);
    expiryTimer = window.setTimeout(() => void get().stop(), Math.max(0, remaining));
  }

  function startWatch() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(
      (p) =>
        void pushPosition({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          set({ error: locateErrorMessage('denied') });
          void get().stop();
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = window.setInterval(() => {
      const { lat, lng, accuracy } = get();
      if (lat !== null && lng !== null) void pushPosition({ lat, lng, accuracy, heading: null }, true);
    }, HEARTBEAT_MS);
    scheduleExpiry();
    if (!visibilityHandler && typeof document !== 'undefined') {
      visibilityHandler = () => {
        if (document.visibilityState !== 'visible' || !get().shareId) return;
        if (get().expiresAtMs <= Date.now()) {
          void get().stop();
          return;
        }
        void locateOnce()
          .then((pos) => pushPosition({ ...pos, heading: null }, true))
          .catch(() => undefined);
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }
  }

  return {
    shareId: null,
    ownerUid: null,
    startedAtMs: 0,
    expiresAtMs: 0,
    untilOff: false,
    lat: null,
    lng: null,
    accuracy: 0,
    label: '',
    starting: false,
    error: '',

    currentLocation() {
      const s = get();
      if (!s.shareId || s.lat === null || s.lng === null) return null;
      const profile = useAuthStore.getState().profile;
      return {
        lat: s.lat,
        lng: s.lng,
        accuracy: s.accuracy,
        label: s.label,
        liveId: s.shareId,
        uid: s.ownerUid || undefined,
        handle: profile?.handle,
      };
    },

    async start(minutes) {
      const existing = get().currentLocation();
      if (existing && get().expiresAtMs > Date.now()) return existing;
      const profile = useAuthStore.getState().profile;
      if (!profile?.firebaseUid) {
        set({ error: 'Inicia sesión para compartir tu ubicación en tiempo real.' });
        return null;
      }
      set({ starting: true, error: '' });
      try {
        const pos = await locateOnce();
        const ref = doc(collection(db, COLLECTION));
        const startedAtMs = Date.now();
        const untilOff = minutes <= 0;
        const expiresAtMs = untilOff
          ? startedAtMs + UNTIL_OFF_WINDOW_MS
          : startedAtMs + Math.min(480, Math.max(5, minutes)) * 60_000;
        let label = '';
        try {
          const geo = await reverseGeocode(pos.lat, pos.lng);
          label = [geo.city, geo.regionLabel].filter(Boolean).join(' · ').slice(0, 80);
        } catch {
          /* sin nombre del lugar */
        }
        await setDoc(ref, {
          ownerUid: profile.firebaseUid,
          handle: String(profile.handle || '').slice(0, 32),
          displayName: String(profile.displayName || '').slice(0, 80),
          avatarUrl: profile.avatarUrl ? String(profile.avatarUrl).slice(0, 800) : null,
          lat: pos.lat,
          lng: pos.lng,
          accuracy: Math.round(pos.accuracy),
          heading: null,
          label,
          active: true,
          startedAtMs,
          expiresAtMs,
          ...(untilOff ? { untilOff: true } : null),
          updatedAt: serverTimestamp(),
        });
        lastWrite = { at: Date.now(), lat: pos.lat, lng: pos.lng };
        set({
          shareId: ref.id,
          ownerUid: profile.firebaseUid,
          startedAtMs,
          expiresAtMs,
          untilOff,
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
          label,
          starting: false,
        });
        persist({ shareId: ref.id, ownerUid: profile.firebaseUid, startedAtMs, expiresAtMs, untilOff });
        startWatch();
        return get().currentLocation();
      } catch (code) {
        set({
          starting: false,
          error: typeof code === 'string' ? locateErrorMessage(code) : 'No se pudo iniciar la ubicación en tiempo real.',
        });
        return null;
      }
    },

    async stop() {
      const { shareId } = get();
      clearRuntime();
      persist(null);
      set({
        shareId: null,
        ownerUid: null,
        startedAtMs: 0,
        expiresAtMs: 0,
        untilOff: false,
        lat: null,
        lng: null,
        starting: false,
      });
      if (!shareId) return;
      await endShareDoc(shareId);
    },

    resume() {
      if (get().shareId) return;
      let saved: {
        shareId?: string;
        ownerUid?: string;
        startedAtMs?: number;
        expiresAtMs?: number;
        untilOff?: boolean;
      } | null = null;
      try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      } catch {
        saved = null;
      }
      const uid = useAuthStore.getState().profile?.firebaseUid;
      if (!saved?.shareId || !uid || saved.ownerUid !== uid) return;
      if (!saved.expiresAtMs || saved.expiresAtMs <= Date.now()) {
        persist(null);
        void endShareDoc(saved.shareId);
        return;
      }
      set({
        shareId: saved.shareId,
        ownerUid: uid,
        startedAtMs: saved.startedAtMs || Date.now(),
        expiresAtMs: saved.expiresAtMs,
        untilOff: saved.untilOff === true,
      });
      startWatch();
    },
  };
});
