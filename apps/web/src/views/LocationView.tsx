import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, ExternalLink, MapPin, Share2, Square } from 'lucide-react';
import {
  buildLocationUrl,
  formatRemaining,
  openStreetMapUrl,
  parseLocationParams,
} from '../lib/locationShare';
import { useLiveLocation, useLiveLocationShare, useNow } from '../lib/liveLocation';
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
  const stopMyShare = useLiveLocationShare((state) => state.stop);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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
                className={`h-full w-full ${ended ? 'grayscale-[0.6]' : ''}`}
              />
            </Suspense>
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
