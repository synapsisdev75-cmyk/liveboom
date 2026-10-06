import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, ExternalLink, MapPin, Radio, Share2, Square, Users } from 'lucide-react';
import {
  buildLocationUrl,
  formatRemaining,
  openStreetMapUrl,
  parseLocationParams,
} from '../lib/locationShare';
import { useDevicePosition, useLiveLocation, useLiveLocationShare, useNow } from '../lib/liveLocation';
import { distanceM, fetchRoute, formatDistance, formatDuration, type LngLat, type Route } from '../lib/routing';
import { readSavedTravelMode, type TravelMode } from '../lib/googleMaps';
import type { SceneCompanion } from '../components/location/LocationScene';

const ROUTE_REFRESH_MS = 10_000;
const ROUTE_MOVE_M = 40;
const MODE_PHRASE: Record<TravelMode, string> = {
  driving: 'en auto',
  motorcycle: 'en moto',
  walking: 'a pie',
};
import { LocationShareModal } from '../components/location/LocationShareModal';
import { DirectionsButton } from '../components/location/DirectionsSheet';
import { UserAvatar } from '../components/profile/UserAvatar';
import { useAuthStore } from '../store/authStore';

const LocationMap = lazy(() => import('../components/location/LocationMap'));

export default function LocationView() {
  const [params] = useSearchParams();
  const profile = useAuthStore((state) => state.profile);
  const loc = useMemo(() => parseLocationParams(params), [params]);
  const live = useLiveLocation(loc?.liveId);
  const myShareId = useLiveLocationShare((state) => state.shareId);
  const myLiveLat = useLiveLocationShare((state) => state.lat);
  const myLiveLng = useLiveLocationShare((state) => state.lng);
  const stopMyShare = useLiveLocationShare((state) => state.stop);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [liveShareOpen, setLiveShareOpen] = useState(false);

  const liveData = live && live.status !== 'loading' ? live.data : null;
  const isLive = live?.status === 'live';
  const ended = Boolean(loc?.liveId) && live?.status === 'ended';
  const now = useNow(isLive);
  const isMine = Boolean(loc?.liveId && myShareId === loc.liveId);
  const point = loc ? (isLive && liveData ? { lat: liveData.lat, lng: liveData.lng } : { lat: loc.lat, lng: loc.lng }) : null;
  const person = {
    uid: liveData?.ownerUid || loc?.uid,
    avatarUrl: liveData?.avatarUrl,
    handle: liveData?.handle || loc?.handle,
    displayName: liveData?.displayName,
  };
  const hasPerson = Boolean(person.uid || person.handle);

  /* Tu posición: tu ubicación en tiempo real si la compartes; si no, el GPS de este dispositivo. */
  const sharingToo = Boolean(myShareId && !isMine && myLiveLat !== null && myLiveLng !== null);
  const [gpsWanted, setGpsWanted] = useState(false);
  const viewingOther = Boolean(loc) && !isMine && !(profile && person.uid === profile.firebaseUid);
  useEffect(() => {
    if (!viewingOther) return;
    let cancelled = false;
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === 'granted') setGpsWanted(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [viewingOther]);
  const { position: gps, error: gpsError } = useDevicePosition(viewingOther && !sharingToo && gpsWanted);
  const me = sharingToo ? { lat: myLiveLat as number, lng: myLiveLng as number } : viewingOther ? gps : null;
  const apartM = me && point ? distanceM([me.lng, me.lat], [point.lng, point.lat]) : null;

  /* Ruta real por calles; se recalcula cuando alguno de los dos se mueve. */
  const [route, setRoute] = useState<{ result: Route; mode: TravelMode } | null>(null);
  const routeReqRef = useRef<{ at: number; from: LngLat; to: LngLat } | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!me || !point || (apartM !== null && apartM < 30)) {
      routeReqRef.current = null;
      setRoute(null);
      return;
    }
    const from: LngLat = [me.lng, me.lat];
    const to: LngLat = [point.lng, point.lat];
    const last = routeReqRef.current;
    const now = Date.now();
    if (last && (now - last.at < ROUTE_REFRESH_MS || (distanceM(last.from, from) < ROUTE_MOVE_M && distanceM(last.to, to) < ROUTE_MOVE_M))) {
      return;
    }
    routeReqRef.current = { at: now, from, to };
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    const mode = readSavedTravelMode();
    fetchRoute(me, point, mode, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRoute({ result, mode });
      })
      .catch(() => {
        /* sin ruta: queda la línea recta y se reintenta al moverse */
        if (!controller.signal.aborted) routeReqRef.current = null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.lat, me?.lng, point?.lat, point?.lng]);
  useEffect(() => () => routeAbortRef.current?.abort(), []);

  const routeKm = route ? formatDistance(route.result.distanceM) : '';
  const routeTime = route ? formatDuration(route.result.durationS) : '';
  const apartLabel = route ? `${routeKm} · ${routeTime}` : apartM !== null ? formatDistance(apartM) : '';
  const companion = useMemo<SceneCompanion | null>(
    () =>
      me
        ? {
            lat: me.lat,
            lng: me.lng,
            live: sharingToo,
            label: apartLabel,
            path: route?.result.coords ?? null,
            person: profile
              ? { uid: profile.firebaseUid, avatarUrl: profile.avatarUrl, handle: profile.handle, displayName: profile.displayName }
              : null,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.lat, me?.lng, sharingToo, apartLabel, route, profile?.firebaseUid, profile?.avatarUrl],
  );
  const otherName = person.displayName || (person.handle ? `@${person.handle}` : loc?.label || 'la ubicación');
  const title = loc?.liveId
    ? person.displayName || (person.handle ? `@${person.handle}` : 'Ubicación en tiempo real')
    : loc?.label || 'Ubicación compartida';
  const status = loc?.liveId
    ? isLive && liveData
      ? `En vivo · termina en ${formatRemaining(liveData.expiresAtMs - now)}`
      : ended
        ? 'La ubicación en tiempo real terminó · último punto'
        : 'Conectando…'
    : person.handle
      ? `Compartida por @${person.handle}`
      : 'LiveBoom · Ubicación';

  async function copyLink() {
    if (!loc) return;
    try {
      await navigator.clipboard.writeText(buildLocationUrl(loc));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* portapapeles bloqueado */
    }
  }

  return (
    <div className="flex h-[var(--lb-vv-height,100dvh)] w-full flex-col bg-[color:var(--bg-primary)] text-[color:var(--text-primary)]">
      <header
        className="flex items-center gap-2 border-b border-[color:var(--border-soft)] px-3 py-2"
        style={{ paddingTop: 'max(0.5rem, var(--lb-safe-top, 0px))' }}
      >
        <Link
          to={profile ? '/inicio' : '/'}
          aria-label="Volver a LiveBoom"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-[color:var(--surface-hover)]"
        >
          <ArrowLeft size={20} />
        </Link>
        {hasPerson ? (
          person.handle ? (
            <Link
              to={`/u/${person.handle}`}
              className={`shrink-0 rounded-full p-[2px] ${
                isLive ? 'bg-gradient-to-br from-[#ef4444] to-[#a78bfa]' : 'bg-gradient-to-br from-[#22d3ee] to-[#a78bfa]'
              }`}
              aria-label={`Perfil de @${person.handle}`}
            >
              <UserAvatar src={person.avatarUrl} uid={person.uid} username={person.handle} displayName={person.displayName} size={38} />
            </Link>
          ) : (
            <span className="shrink-0 rounded-full bg-gradient-to-br from-[#22d3ee] to-[#a78bfa] p-[2px]">
              <UserAvatar src={person.avatarUrl} uid={person.uid} displayName={person.displayName} size={38} />
            </span>
          )
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
            {!hasPerson ? <MapPin size={15} className="shrink-0 text-[#06b6d4]" /> : null}
            {title}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-[color:var(--text-muted)]">
            {isLive ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#ef4444]" aria-hidden /> : null}
            {status}
          </p>
        </div>
      </header>

      {loc && point ? (
        <>
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={<div className="h-full w-full animate-pulse bg-[color:var(--surface-primary)]" />}>
              <LocationMap
                lat={point.lat}
                lng={point.lng}
                accuracy={isLive ? liveData?.accuracy : undefined}
                zoom={16.5}
                interactive
                variant="scene"
                person={person}
                live={isLive}
                companion={companion}
                className={`h-full w-full ${ended ? 'grayscale-[0.6]' : ''}`}
              />
            </Suspense>
            {viewingOther ? (
              <div className="lb-loc-together" aria-live="polite">
                {me && apartM !== null ? (
                  <div className="lb-loc-together__card">
                    <span className={`lb-loc-together__dot${sharingToo && isLive ? ' is-live' : ''}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">
                        {apartM < 30
                          ? `Estás con ${otherName}`
                          : route
                            ? `${routeTime} ${MODE_PHRASE[route.mode]} · ${routeKm}`
                            : `Estás a ${formatDistance(apartM)} de ${otherName}`}
                      </span>
                      <span className="block truncate text-[11px] opacity-80">
                        {sharingToo && isLive
                          ? `Conectados en tiempo real · ruta hasta ${otherName}`
                          : route
                            ? `Ruta por calles hasta ${otherName}${isLive ? ' · en vivo' : ''}`
                            : apartM >= 30
                              ? 'Calculando la ruta…'
                              : isLive
                                ? 'Se actualiza en vivo con tu GPS'
                                : 'Desde tu ubicación actual'}
                      </span>
                    </span>
                  </div>
                ) : gpsError ? (
                  <p className="lb-loc-together__card text-xs font-semibold">{gpsError}</p>
                ) : !gpsWanted && !sharingToo ? (
                  <button type="button" onClick={() => setGpsWanted(true)} className="lb-loc-together__card lb-loc-together__btn">
                    <Users size={16} className="shrink-0" />
                    <span className="text-sm font-bold">Ver la distancia entre nosotros</span>
                  </button>
                ) : null}
                {isLive && !sharingToo && profile ? (
                  <button type="button" onClick={() => setLiveShareOpen(true)} className="lb-loc-together__share">
                    <Radio size={14} className="shrink-0" />
                    Compartir la mía en tiempo real
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div
            className="grid grid-cols-2 gap-2 border-t border-[color:var(--border-soft)] p-3 sm:flex sm:justify-center"
            style={{ paddingBottom: 'max(0.75rem, var(--lb-safe-bottom, 0px))' }}
          >
            <DirectionsButton
              destination={loc}
              className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] px-5 text-sm font-bold text-[#0b0f19] sm:col-span-1"
            />
            {isMine ? (
              <button
                type="button"
                onClick={() => void stopMyShare()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ef4444] px-4 text-sm font-bold text-[#ffffff]"
              >
                <Square size={14} />
                Detener
              </button>
            ) : profile && !loc.liveId ? (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--border-default)] px-4 text-sm font-semibold"
              >
                <Share2 size={15} />
                Compartir
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--border-default)] px-4 text-sm font-semibold"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copiado' : 'Copiar enlace'}
              </button>
            )}
            <a
              href={openStreetMapUrl(point)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--border-default)] px-4 text-sm font-semibold"
            >
              <ExternalLink size={15} />
              Abrir mapa
            </a>
          </div>
          {profile && !loc.liveId ? (
            <LocationShareModal open={shareOpen} onClose={() => setShareOpen(false)} mode="share" initial={loc} />
          ) : null}
          {profile && loc.liveId ? (
            <LocationShareModal
              open={liveShareOpen}
              onClose={() => setLiveShareOpen(false)}
              mode="share"
              initialKind="live"
            />
          ) : null}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="text-4xl" aria-hidden>
            📍
          </span>
          <p className="text-sm font-semibold">Este enlace de ubicación no es válido.</p>
          <Link to="/" className="text-sm font-semibold text-[#06b6d4] underline">
            Ir a LiveBoom
          </Link>
        </div>
      )}
    </div>
  );
}
