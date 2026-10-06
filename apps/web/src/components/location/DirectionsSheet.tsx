import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bike, Car, ExternalLink, Footprints, Navigation, X } from 'lucide-react';
import {
  googleMapsDirectionsUrl,
  readSavedTravelMode,
  TRAVEL_MODE_STORAGE_KEY,
  TRAVEL_MODES,
  type TravelMode,
} from '../../lib/googleMaps';
import { navigationInAppHref, type SharedLocation } from '../../lib/locationShare';

const MODE_ICON: Record<TravelMode, ReactNode> = {
  driving: <Car size={16} />,
  motorcycle: <Bike size={16} />,
  walking: <Footprints size={16} />,
};

export function TravelModePicker({
  value,
  onChange,
  className = '',
}: {
  value: TravelMode;
  onChange: (mode: TravelMode) => void;
  className?: string;
}) {
  return (
    <div className={`lb-travel-modes ${className}`} role="radiogroup" aria-label="Medio de transporte">
      {TRAVEL_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="radio"
          aria-checked={value === mode.id}
          className={`lb-travel-modes__btn${value === mode.id ? ' is-active' : ''}`}
          onClick={() => {
            onChange(mode.id);
            try {
              localStorage.setItem(TRAVEL_MODE_STORAGE_KEY, mode.id);
            } catch {
              /* almacenamiento bloqueado */
            }
          }}
        >
          {MODE_ICON[mode.id]}
          {mode.label}
        </button>
      ))}
    </div>
  );
}

/** Elegir cómo llegar: navegación dentro de LiveBoom o en Google Maps. */
export function DirectionsSheet({
  destination,
  open,
  onClose,
}: {
  destination: SharedLocation | null;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<TravelMode>(readSavedTravelMode);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !destination || typeof document === 'undefined') return null;
  const name = destination.label || (destination.handle ? `@${destination.handle}` : 'la ubicación');

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-[rgba(0,0,0,0.55)] backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cómo llegar"
        onClick={(event) => event.stopPropagation()}
        className="w-full rounded-t-3xl border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] p-4 text-[color:var(--text-primary)] shadow-[var(--shadow-modal)] sm:max-w-sm sm:rounded-3xl"
        style={{ paddingBottom: 'max(1rem, var(--lb-safe-bottom, 0px))' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Navigation size={17} className="text-[#06b6d4]" />
              Cómo llegar
            </h2>
            <p className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">Hacia {name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-[color:var(--surface-hover)]"
          >
            <X size={18} />
          </button>
        </div>

        <TravelModePicker value={mode} onChange={setMode} className="mt-3" />

        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(navigationInAppHref(destination, mode));
            }}
            className="flex min-h-14 items-center gap-3 rounded-2xl bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] px-4 text-left text-[#0b0f19]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[rgba(11,15,25,0.14)]">
              <Navigation size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">Ir con LiveBoom</span>
              <span className="block text-[11px] font-medium opacity-80">Ruta y seguimiento en vivo dentro de la app</span>
            </span>
          </button>
          <a
            href={googleMapsDirectionsUrl(destination, mode)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-[color:var(--border-default)] px-4 text-left hover:bg-[color:var(--surface-hover)]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--surface-secondary)] text-[#34a853]">
              <ExternalLink size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">Abrir en Google Maps</span>
              <span className="block text-[11px] text-[color:var(--text-muted)]">Navegación en la app de Google</span>
            </span>
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Botón "Cómo llegar" que abre el selector LiveBoom / Google Maps. */
export function DirectionsButton({
  destination,
  className = '',
  iconSize = 16,
  label = 'Cómo llegar',
}: {
  destination: SharedLocation;
  className?: string;
  iconSize?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Navigation size={iconSize} />
        {label}
      </button>
      <DirectionsSheet destination={destination} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
