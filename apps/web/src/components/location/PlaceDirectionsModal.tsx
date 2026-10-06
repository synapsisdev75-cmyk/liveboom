import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin, Navigation, Search, X } from 'lucide-react';
import { createPlacesSession, type PlaceSuggestion } from '../../lib/googleMaps';
import type { SharedLocation } from '../../lib/locationShare';
import { DirectionsSheet } from './DirectionsSheet';

/** Buscar un lugar (Google Places) y elegir cómo llegar: LiveBoom o Google Maps. */
export function PlaceDirectionsModal({
  open,
  onClose,
  near,
}: {
  open: boolean;
  onClose: () => void;
  near: { lat: number; lng: number } | null;
}) {
  const session = useMemo(() => createPlacesSession(), []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState('');
  const [error, setError] = useState('');
  const [destination, setDestination] = useState<SharedLocation | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nearRef = useRef(near);
  nearRef.current = near;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setError('');
    setDestination(null);
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const id = window.setTimeout(() => {
      session
        .search(text, nearRef.current, controller.signal)
        .then((items) => {
          setResults(items);
          setError(items.length ? '' : 'Sin resultados para esa búsqueda.');
        })
        .catch(() => {
          if (!controller.signal.aborted) setError('No se pudo buscar. Revisa tu conexión.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 280);
    return () => {
      window.clearTimeout(id);
      controller.abort();
    };
  }, [query, open, session]);

  async function pick(item: PlaceSuggestion) {
    setResolving(item.placeId);
    setError('');
    try {
      const point = await session.resolve(item.placeId);
      setDestination({ lat: point.lat, lng: point.lng, label: item.primary || point.label });
    } catch {
      setError('No se pudo abrir ese lugar. Intenta con otro.');
    } finally {
      setResolving('');
    }
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[145] flex items-end justify-center bg-[rgba(0,0,0,0.55)] backdrop-blur-sm sm:items-center sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cómo llegar a un lugar"
          onClick={(event) => event.stopPropagation()}
          className="flex max-h-[min(88dvh,36rem)] w-full flex-col overflow-hidden rounded-t-3xl border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] text-[color:var(--text-primary)] shadow-[var(--shadow-modal)] sm:max-w-md sm:rounded-3xl"
          style={{ paddingBottom: 'var(--lb-safe-bottom, 0px)' }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-soft)] px-4 py-3">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Navigation size={17} className="text-[#06b6d4]" />
              Cómo llegar
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid h-11 w-11 place-items-center rounded-full hover:bg-[color:var(--surface-hover)]"
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-4 pt-3">
            <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-secondary)] px-3 focus-within:border-[#22d3ee]">
              <Search size={17} className="shrink-0 text-[color:var(--text-muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Busca un lugar, dirección o negocio"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--text-muted)]"
                enterKeyHint="search"
                autoComplete="off"
              />
              {searching ? <Loader2 size={16} className="shrink-0 animate-spin text-[#06b6d4]" /> : null}
            </label>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {results.map((item) => (
              <li key={item.placeId}>
                <button
                  type="button"
                  disabled={Boolean(resolving)}
                  onClick={() => void pick(item)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[color:var(--surface-hover)] disabled:opacity-60"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#22d3ee]/15 text-[#06b6d4]">
                    {resolving === item.placeId ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.primary}</span>
                    {item.secondary ? (
                      <span className="block truncate text-xs text-[color:var(--text-muted)]">{item.secondary}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {error ? <p className="px-4 pb-3 text-xs text-[#f87171]">{error}</p> : null}
          <p className="px-4 pb-3 text-right text-[10px] text-[color:var(--text-muted)]">Búsqueda con Google</p>
        </div>
      </div>
      <DirectionsSheet
        destination={destination}
        open={Boolean(destination)}
        onClose={() => {
          setDestination(null);
          onClose();
        }}
      />
    </>,
    document.body,
  );
}
