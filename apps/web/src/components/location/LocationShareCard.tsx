import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Navigation } from 'lucide-react';
import { directionsUrl, locationInAppHref, type SharedLocation } from '../../lib/locationShare';

const LocationMap = lazy(() => import('./LocationMap'));

type Props = {
  location: SharedLocation;
  onDismiss?: () => void;
  compact?: boolean;
  className?: string;
};

/** Tarjeta de ubicación compartida: mapa con el punto, nombre del lugar y "Cómo llegar". */
export function LocationShareCard({ location, onDismiss, compact = false, className = '' }: Props) {
  const mapHeight = compact ? 'h-28' : 'h-36 sm:h-40';
  return (
    <div
      className={`lb-location-card relative w-full min-w-0 overflow-hidden rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-secondary)] text-left shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <Link to={locationInAppHref(location)} className="block" aria-label="Ver ubicación en el mapa">
        <Suspense fallback={<div className={`${mapHeight} w-full animate-pulse bg-[color:var(--surface-primary)]`} />}>
          <LocationMap lat={location.lat} lng={location.lng} zoom={15} className={`${mapHeight} pointer-events-none w-full`} />
        </Suspense>
      </Link>
      <div className="flex min-w-0 items-center gap-2.5 p-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#22d3ee]/15 text-[#06b6d4]" aria-hidden>
          <MapPin size={17} />
        </span>
        <Link to={locationInAppHref(location)} className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[color:var(--text-primary)]">
            {location.label || 'Ubicación compartida'}
          </span>
          <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
            LiveBoom · Ubicación
          </span>
        </Link>
        <a
          href={directionsUrl(location)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] px-3 text-[11px] font-bold text-[#0b0f19]"
        >
          <Navigation size={13} />
          Cómo llegar
        </a>
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
