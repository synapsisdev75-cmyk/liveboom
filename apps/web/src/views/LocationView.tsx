import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, ExternalLink, MapPin, Navigation, Share2 } from 'lucide-react';
import {
  buildLocationUrl,
  directionsUrl,
  openStreetMapUrl,
  parseLocationParams,
} from '../lib/locationShare';
import { LocationShareModal } from '../components/location/LocationShareModal';
import { useAuthStore } from '../store/authStore';

const LocationMap = lazy(() => import('../components/location/LocationMap'));

export default function LocationView() {
  const [params] = useSearchParams();
  const profile = useAuthStore((state) => state.profile);
  const loc = useMemo(() => parseLocationParams(params), [params]);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-[color:var(--surface-hover)]"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
            <MapPin size={15} className="shrink-0 text-[#06b6d4]" />
            {loc?.label || 'Ubicación compartida'}
          </p>
          <p className="text-[11px] text-[color:var(--text-muted)]">LiveBoom · Ubicación</p>
        </div>
      </header>

      {loc ? (
        <>
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={<div className="h-full w-full animate-pulse bg-[color:var(--surface-primary)]" />}>
              <LocationMap lat={loc.lat} lng={loc.lng} zoom={16} interactive className="h-full w-full" />
            </Suspense>
          </div>
          <div
            className="grid grid-cols-2 gap-2 border-t border-[color:var(--border-soft)] p-3 sm:flex sm:justify-center"
            style={{ paddingBottom: 'max(0.75rem, var(--lb-safe-bottom, 0px))' }}
          >
            <a
              href={directionsUrl(loc)}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] px-5 text-sm font-bold text-[#0b0f19] sm:col-span-1"
            >
              <Navigation size={16} />
              Cómo llegar
            </a>
            {profile ? (
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
              href={openStreetMapUrl(loc)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--border-default)] px-4 text-sm font-semibold"
            >
              <ExternalLink size={15} />
              Abrir mapa
            </a>
          </div>
          {profile ? (
            <LocationShareModal open={shareOpen} onClose={() => setShareOpen(false)} mode="share" initial={loc} />
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
