import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  Flag,
  Loader2,
  MapPin,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { googleMapsDirectionsUrl, parseTravelMode, type TravelMode } from '../lib/googleMaps';
import { locateErrorMessage, locationInAppHref, parseLocationParams } from '../lib/locationShare';
import { useLiveLocation } from '../lib/liveLocation';
import {
  bearingDeg,
  distanceM,
  fetchRoute,
  formatDistance,
  formatDuration,
  projectOnRoute,
  type LngLat,
  type Route,
} from '../lib/routing';
import { TravelModePicker } from '../components/location/DirectionsSheet';
import type { NavUserPosition } from '../components/location/RouteMap';
import { UserAvatar } from '../components/profile/UserAvatar';

const RouteMap = lazy(() => import('../components/location/RouteMap'));

const VOICE_KEY = 'lb.navVoice';
const OFF_ROUTE_M = 45;
const REROUTE_MIN_MS = 8_000;
const DEST_MOVED_M = 60;

function readVoicePref(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function speak(text: string) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    window.speechSynthesis.speak(utterance);
  } catch {
    /* voz no disponible */
  }
}

function ManeuverIcon({ instruction }: { instruction: string }) {
  const text = instruction.toLowerCase();
  const props = { size: 30, className: 'shrink-0' };
  if (text.includes('llegaste') || text.includes('destino')) return <Flag {...props} />;
  if (text.includes('vuelta en u') || text.includes('media vuelta')) return <RotateCcw {...props} />;
  if (text.includes('glorieta') || text.includes('rotonda')) return <RotateCw {...props} />;
  if (text.includes('izquierda')) return <CornerUpLeft {...props} />;
  if (text.includes('derecha')) return <CornerUpRight {...props} />;
  return <ArrowUp {...props} />;
}

/** Mantiene la pantalla encendida mientras se navega. */
function useScreenWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock
        ?.request('screen')
        .then((s) => {
          if (cancelled) void s.release();
          else sentinel = s;
        })
        .catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}

/** Sigue el GPS del dispositivo; calcula el rumbo con el movimiento cuando el navegador no lo da. */
function useWatchedPosition() {
  const [position, setPosition] = useState<NavUserPosition | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const lastRef = useRef<{ point: LngLat; heading: number | null } | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError(locateErrorMessage('unsupported'));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError('');
        const point: LngLat = [p.coords.longitude, p.coords.latitude];
        const prev = lastRef.current;
        let heading: number | null = prev?.heading ?? null;
        const gpsHeading = p.coords.heading;
        if (typeof gpsHeading === 'number' && Number.isFinite(gpsHeading) && (p.coords.speed ?? 0) > 0.8) {
          heading = gpsHeading;
        } else if (prev && distanceM(prev.point, point) > 8) {
          heading = bearingDeg(prev.point, point);
        }
        if (!prev || distanceM(prev.point, point) > 8 || heading !== prev.heading) {
          lastRef.current = { point, heading };
        }
        setPosition({ lat: point[1], lng: point[0], heading, accuracy: p.coords.accuracy });
      },
      (err) => {
        setError(
          locateErrorMessage(
            err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable',
          ),
        );
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [attempt]);

  return { position, error, retry: () => setAttempt((n) => n + 1) };
}

export default function NavigationView() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const loc = useMemo(() => parseLocationParams(params), [params]);
  const mode = parseTravelMode(params.get('m'));
  const live = useLiveLocation(loc?.liveId);
  const liveData = live && live.status !== 'loading' ? live.data : null;
  const isLive = live?.status === 'live';
  const dest = useMemo(
    () => (loc ? (isLive && liveData ? { lat: liveData.lat, lng: liveData.lng } : { lat: loc.lat, lng: loc.lng }) : null),
    [loc, isLive, liveData],
  );
  const person = {
    uid: liveData?.ownerUid || loc?.uid,
    avatarUrl: liveData?.avatarUrl,
    handle: liveData?.handle || loc?.handle,
    displayName: liveData?.displayName,
  };
  const destName = loc?.liveId
    ? person.displayName || (person.handle ? `@${person.handle}` : 'Ubicación en tiempo real')
    : loc?.label || 'Destino';

  useScreenWakeLock();
  const { position: user, error: geoError, retry: retryGeo } = useWatchedPosition();
  const [route, setRoute] = useState<Route | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [mapFailed, setMapFailed] = useState(false);
  const [voice, setVoice] = useState(readVoicePref);
  const [retryKey, setRetryKey] = useState(0);
  const requestRef = useRef<{ at: number; mode: TravelMode; dest: LngLat; from: LngLat; retryKey: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const progress = useMemo(() => {
    if (!route || !user) return null;
    return projectOnRoute([user.lng, user.lat], route.coords, route.cumulative);
  }, [route, user]);

  useEffect(() => {
    if (!user || !dest) return;
    const now = Date.now();
    const destPoint: LngLat = [dest.lng, dest.lat];
    const userPoint: LngLat = [user.lng, user.lat];
    const last = requestRef.current;
    const tolerance = Math.max(OFF_ROUTE_M, Math.min(user.accuracy ?? 0, 120));
    /* Si se calculó la ruta desde fuera de la vía (dentro de un edificio), no recalcular hasta que te muevas. */
    const offRoute =
      progress !== null && progress.offRouteM > tolerance && !!last && distanceM(last.from, userPoint) > tolerance;
    const needs =
      !last ||
      last.mode !== mode ||
      last.retryKey !== retryKey ||
      (now - last.at > REROUTE_MIN_MS && offRoute) ||
      (now - last.at > REROUTE_MIN_MS * 2 && distanceM(last.dest, destPoint) > DEST_MOVED_M);
    if (!needs) return;
    requestRef.current = { at: now, mode, dest: destPoint, from: userPoint, retryKey };
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRouting(true);
    fetchRoute(user, dest, mode, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setRoute(next);
        setRouteError('');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRouteError('No se pudo calcular la ruta. Revisa tu conexión.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouting(false);
      });
  }, [user, dest, mode, progress, retryKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const distToDest = user && dest ? distanceM([user.lng, user.lat], [dest.lng, dest.lat]) : null;
  const arrived = distToDest !== null && distToDest < Math.max(25, Math.min(user?.accuracy ?? 0, 60));
  const remainingM = route && progress ? Math.max(0, route.distanceM - progress.alongM) : null;
  const remainingS =
    route && remainingM !== null && route.distanceM > 0 ? (route.durationS * remainingM) / route.distanceM : null;
  const arrivalClock =
    remainingS !== null
      ? new Date(Date.now() + remainingS * 1000).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
      : '';
  const nextStepIndex = route && progress ? route.steps.findIndex((s) => s.alongM > progress.alongM + 8) : -1;
  const nextStep = route && nextStepIndex >= 0 ? route.steps[nextStepIndex] : null;
  const toNextM = nextStep && progress ? Math.max(0, nextStep.alongM - progress.alongM) : null;

  const spokenRef = useRef<{ index: number; near: boolean; arrived: boolean }>({ index: -1, near: false, arrived: false });
  useEffect(() => {
    if (!voice) return;
    const spoken = spokenRef.current;
    if (arrived) {
      if (!spoken.arrived) speak('Llegaste a tu destino');
      spokenRef.current = { ...spoken, arrived: true };
      return;
    }
    if (!nextStep || toNextM === null) return;
    if (spoken.index !== nextStepIndex) {
      speak(toNextM > 40 ? `En ${formatDistance(toNextM).replace(' m', ' metros').replace(' km', ' kilómetros')}, ${nextStep.instruction}` : nextStep.instruction);
      spokenRef.current = { index: nextStepIndex, near: toNextM <= 60, arrived: false };
    } else if (!spoken.near && toNextM <= 60) {
      speak(nextStep.instruction);
      spokenRef.current = { ...spoken, near: true };
    }
  }, [voice, arrived, nextStep, nextStepIndex, toNextM]);

  const toggleVoice = useCallback(() => {
    setVoice((on) => {
      const next = !on;
      try {
        localStorage.setItem(VOICE_KEY, next ? 'on' : 'off');
      } catch {
        /* almacenamiento bloqueado */
      }
      if (!next) window.speechSynthesis?.cancel();
      return next;
    });
  }, []);

  function setMode(next: TravelMode) {
    const nextParams = new URLSearchParams(params);
    nextParams.set('m', next);
    setParams(nextParams, { replace: true });
  }

  function exit() {
    window.speechSynthesis?.cancel();
    if (window.history.length > 1) navigate(-1);
    else navigate(loc ? locationInAppHref(loc) : '/');
  }

  if (!loc || !dest) {
    return (
      <div className="flex h-[var(--lb-vv-height,100dvh)] flex-col items-center justify-center gap-3 bg-[color:var(--bg-primary)] p-6 text-center text-[color:var(--text-primary)]">
        <MapPin size={32} className="text-[#06b6d4]" />
        <p className="text-sm font-semibold">Este destino no es válido.</p>
        <Link to="/" className="text-sm font-semibold text-[#06b6d4] underline">
          Ir a LiveBoom
        </Link>
      </div>
    );
  }

  const banner = geoError ? (
    <div className="flex items-center gap-3">
      <p className="min-w-0 flex-1 text-sm font-semibold">{geoError}</p>
      <button type="button" onClick={retryGeo} className="min-h-11 shrink-0 rounded-xl bg-[#ffffff] px-3 text-xs font-bold text-[#0b0f19]">
        Reintentar
      </button>
    </div>
  ) : arrived ? (
    <div className="flex items-center gap-3">
      <Flag size={26} className="shrink-0" />
      <p className="text-lg font-bold">Llegaste a tu destino</p>
    </div>
  ) : !user ? (
    <div className="flex items-center gap-3">
      <Loader2 size={22} className="shrink-0 animate-spin" />
      <p className="text-sm font-semibold">Buscando tu ubicación…</p>
    </div>
  ) : routeError && !route ? (
    <div className="flex items-center gap-3">
      <p className="min-w-0 flex-1 text-sm font-semibold">{routeError}</p>
      <button
        type="button"
        onClick={() => setRetryKey((n) => n + 1)}
        className="min-h-11 shrink-0 rounded-xl bg-[#ffffff] px-3 text-xs font-bold text-[#0b0f19]"
      >
        Reintentar
      </button>
    </div>
  ) : nextStep && toNextM !== null ? (
    <div className="flex items-center gap-3">
      <ManeuverIcon instruction={nextStep.instruction} />
      <div className="min-w-0">
        <p className="text-2xl font-black leading-tight tabular-nums">{formatDistance(toNextM)}</p>
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{nextStep.instruction}</p>
      </div>
    </div>
  ) : route && distToDest !== null ? (
    <div className="flex items-center gap-3">
      <Flag size={24} className="shrink-0" />
      <div className="min-w-0">
        <p className="text-2xl font-black leading-tight tabular-nums">{formatDistance(distToDest)}</p>
        <p className="text-sm font-semibold">Sigue hasta el destino</p>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-3">
      <Loader2 size={22} className="shrink-0 animate-spin" />
      <p className="text-sm font-semibold">Calculando ruta…</p>
    </div>
  );

  return (
    <div className="lb-nav-view flex h-[var(--lb-vv-height,100dvh)] w-full flex-col overflow-hidden bg-[color:var(--bg-primary)] text-[color:var(--text-primary)]">
      <div className="relative min-h-0 flex-1">
        {mapFailed ? (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-[color:var(--text-muted)]">
            Este dispositivo no puede mostrar el mapa de navegación. Usa Google Maps.
          </div>
        ) : (
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-[color:var(--surface-primary)]" />}>
            <RouteMap
              route={route}
              user={user}
              destination={dest}
              person={person}
              live={isLive}
              className="h-full w-full"
              onFail={() => setMapFailed(true)}
            />
          </Suspense>
        )}
        <div className="lb-nav-banner" style={{ top: 'max(0.6rem, var(--lb-safe-top, 0px))' }}>
          <button type="button" onClick={exit} aria-label="Volver" className="lb-nav-banner__back">
            <ArrowLeft size={20} />
          </button>
          <div className={`lb-nav-banner__card${arrived ? ' is-arrived' : ''}${geoError ? ' is-error' : ''}`} aria-live="polite">
            {banner}
          </div>
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={voice ? 'Silenciar indicaciones de voz' : 'Activar indicaciones de voz'}
            className="lb-nav-banner__back"
          >
            {voice ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
        </div>
      </div>

      <div
        className="border-t border-[color:var(--border-soft)] bg-[color:var(--bg-elevated)] px-3 pt-3"
        style={{ paddingBottom: 'max(0.75rem, var(--lb-safe-bottom, 0px))' }}
      >
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <span
              className={`shrink-0 rounded-full p-[2px] ${
                isLive ? 'bg-gradient-to-br from-[#ef4444] to-[#a78bfa]' : 'bg-gradient-to-br from-[#22d3ee] to-[#a78bfa]'
              }`}
            >
              {person.uid || person.handle ? (
                <UserAvatar src={person.avatarUrl} uid={person.uid} username={person.handle} displayName={person.displayName} size={40} />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--bg-elevated)] text-[#06b6d4]">
                  <MapPin size={18} />
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2">
                <span className="text-xl font-black tabular-nums text-[#06b6d4]">
                  {arrived ? 'Llegaste' : remainingS !== null ? formatDuration(remainingS) : routing ? '…' : '--'}
                </span>
                {!arrived && remainingM !== null ? (
                  <span className="truncate text-xs font-semibold text-[color:var(--text-muted)]">
                    {formatDistance(remainingM)}
                    {arrivalClock ? ` · llegada ${arrivalClock}` : ''}
                  </span>
                ) : null}
              </p>
              <p className="flex items-center gap-1.5 truncate text-xs text-[color:var(--text-muted)]">
                {isLive ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#ef4444]" aria-hidden /> : null}
                <span className="truncate">
                  {isLive ? 'Siguiendo en vivo a ' : 'Hacia '}
                  {destName}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={exit}
              aria-label="Terminar navegación"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ef4444]/15 text-[#ef4444]"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <TravelModePicker value={mode} onChange={setMode} className="min-w-0 flex-1" />
            <a
              href={googleMapsDirectionsUrl(dest, mode)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[color:var(--border-default)] px-3 text-xs font-bold hover:bg-[color:var(--surface-hover)]"
            >
              <ExternalLink size={14} />
              Google Maps
            </a>
          </div>
          {route ? (
            <p className="text-center text-[10px] text-[color:var(--text-muted)]">
              Ruta: {route.provider === 'google' ? 'Google' : 'OpenStreetMap'}
              {routing ? ' · recalculando…' : ''}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
