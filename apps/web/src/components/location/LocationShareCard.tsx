import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Radio } from 'lucide-react';
import { formatRemaining, locationInAppHref, type SharedLocation } from '../../lib/locationShare';
import { useLiveLocation, useLiveLocationShare, useNow } from '../../lib/liveLocation';
import { DirectionsButton } from './DirectionsSheet';

const LocationMap = lazy(() => import('./LocationMap'));

type Props = {
  location: SharedLocation;
  onDismiss?: () => void;
  compact?: boolean;
  className?: string;
};

/** Tarjeta de ubicación compartida: mapa con la foto de quien comparte, nombre del lugar y "Cómo llegar". */
export function LocationShareCard({ location, onDismiss, compact = false, className = '' }: Props) {
  const mapHeight = compact ? 'h-28' : 'h-36 sm:h-40';
  const live = useLiveLocation(location.liveId);
  const liveData = live && live.status !== 'loading' ? live.data : null;
  const isLive = live?.status === 'live';
  const ended = Boolean(location.liveId) && live?.status === 'ended';
  const now = useNow(isLive);
  const point = liveData ? { lat: liveData.lat, lng: liveData.lng } : location;
  const person = {
    uid: liveData?.ownerUid || location.uid,
    avatarUrl: liveData?.avatarUrl,
    handle: liveData?.handle || location.handle,
    displayName: liveData?.displayName,
  };
  const who = person.handle ? `@${person.handle}` : '';
  const myShareId = useLiveLocationShare((state) => state.shareId);
  const stopMyShare = useLiveLocationShare((state) => state.stop);
  const isMyActiveShare = Boolean(location.liveId) && location.liveId === myShareId && isLive;
  const title = location.liveId
    ? isLive
      ? `En vivo${who ? ` · ${who}` : ''}`
      : ended
        ? 'Ubicación en tiempo real finalizada'
        : 'Ubicación en tiempo real'
    : location.label || 'Ubicación compartida';
  const subtitle = location.liveId
    ? isLive && liveData
      ? liveData.untilOff
        ? 'Hasta que se desactive'
        : `Termina en ${formatRemaining(liveData.expiresAtMs - now)}`
      : ended
        ? 'Último punto compartido'
        : 'Conectando…'
    : who
      ? `Compartida por ${who}`
      : 'LiveBoom · Ubicación';

  return (
    <div
      className={`lb-location-card relative w-full min-w-0 overflow-hidden rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-secondary)] text-left shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <Link to={locationInAppHref(location)} className="block" aria-label="Ver ubicación en el mapa">
        <Suspense fallback={<div className={`${mapHeight} w-full animate-pulse bg-[color:var(--surface-primary)]`} />}>
          <LocationMap
            lat={point.lat}
            lng={point.lng}
            zoom={15}
            person={person}
            live={isLive}
            className={`${mapHeight} pointer-events-none w-full ${ended ? 'opacity-60 grayscale' : ''}`}
          />
        </Suspense>
      </Link>
      <div className="lb-location-card__foot flex min-w-0 items-center gap-2.5 p-2.5">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
            isLive ? 'bg-[#ef4444]/15 text-[#ef4444]' : 'bg-[#22d3ee]/15 text-[#06b6d4]'
          }`}
          aria-hidden
        >
          {location.liveId ? <Radio size={17} className={isLive ? 'animate-pulse' : ''} /> : <MapPin size={17} />}
        </span>
        <Link to={locationInAppHref(location)} className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[color:var(--text-primary)]">{title}</span>
          <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
            {subtitle}
          </span>
        </Link>
        {isMyActiveShare ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void stopMyShare();
            }}
            className="lb-location-card__action inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#ef4444] px-3 text-[11px] font-black uppercase text-[#ffffff]"
          >
            Dejar de compartir
          </button>
        ) : (
          <DirectionsButton
            destination={location}
            iconSize={13}
            className="lb-location-card__action inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] px-3 text-[11px] font-bold text-[#0b0f19]"
          />
        )}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 z-[600] grid h-9 w-9 place-items-center rounded-full bg-[rgba(0,0,0,0.6)] text-base text-[#ffffff]"
          aria-label="Quitar ubicación"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDismiss();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
