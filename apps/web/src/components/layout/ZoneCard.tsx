import { MapPin, Navigation } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { syncPublicGeo } from '../../lib/publicGeo';
import {
  dismissLocationPrompt,
  fetchPrivateLocation,
  locationPromptDismissed,
  requestBrowserLocation,
  savePrivateLocation,
  type PrivateUserLocation,
} from '../../lib/userLocation';
import type { SharedLocation } from '../../lib/locationShare';
import { useAuthStore } from '../../store/authStore';

const ZoneLiveMap = lazy(() => import('./ZoneLiveMap'));
const LocationShareModal = lazy(() =>
  import('../location/LocationShareModal').then((m) => ({ default: m.LocationShareModal })),
);
const PlaceDirectionsModal = lazy(() =>
  import('../location/PlaceDirectionsModal').then((m) => ({ default: m.PlaceDirectionsModal })),
);

/** Tarjeta "Tu zona": mapa en tiempo real + compartir ubicación (rail de escritorio y menú móvil). */
export function ZoneCard({
  location,
  onLocationChange,
}: {
  location: PrivateUserLocation | null;
  onLocationChange: (location: PrivateUserLocation) => void;
}) {
  const t = useT();
  const profile = useAuthStore((state) => state.profile);
  const [locBusy, setLocBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(() => !locationPromptDismissed());
  const [shareLoc, setShareLoc] = useState<SharedLocation | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [directionsUsed, setDirectionsUsed] = useState(false);
  const [shareUsed, setShareUsed] = useState(false);

  async function shareLocation() {
    if (!profile) return;
    setLocBusy(true);
    try {
      const coords = await requestBrowserLocation();
      const saved = await savePrivateLocation(profile.firebaseUid, coords);
      onLocationChange(saved);
      setShowPrompt(false);
      void syncPublicGeo(profile.firebaseUid, { force: true });
    } catch {
      // ignore
    } finally {
      setLocBusy(false);
    }
  }

  if (!profile) return null;

  return (
    <section className="lb-panel lb-zone-card rounded-2xl p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        <MapPin size={12} /> Tu zona
      </p>
      {location ? (
        <>
          <p className="mt-1.5 text-xs font-semibold text-cyan-200">
            {location.city ? `${location.city} · ` : ''}
            {location.regionLabel}
          </p>
          <Suspense
            fallback={<div className="mt-2 h-[clamp(9rem,22vh,11rem)] animate-pulse rounded-xl bg-white/5" />}
          >
            <ZoneLiveMap
              saved={{ lat: location.lat, lng: location.lng }}
              onShare={(pos) => {
                setShareUsed(true);
                setShareLoc({
                  lat: pos.lat,
                  lng: pos.lng,
                  accuracy: pos.accuracy,
                  label: [location.city, location.regionLabel].filter(Boolean).join(' · '),
                });
              }}
            />
          </Suspense>
          <button
            type="button"
            onClick={() => {
              setDirectionsUsed(true);
              setDirectionsOpen(true);
            }}
            className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 text-[11px] font-semibold text-cyan-300 [@media(pointer:coarse)]:min-h-11"
          >
            <Navigation size={13} />
            Cómo llegar a un lugar
          </button>
          <Suspense fallback={null}>
            {directionsUsed ? (
              <PlaceDirectionsModal
                open={directionsOpen}
                onClose={() => setDirectionsOpen(false)}
                near={{ lat: location.lat, lng: location.lng }}
              />
            ) : null}
            {shareUsed ? (
              <LocationShareModal
                open={Boolean(shareLoc)}
                onClose={() => setShareLoc(null)}
                mode="share"
                initial={shareLoc}
              />
            ) : null}
          </Suspense>
        </>
      ) : showPrompt ? (
        <button
          type="button"
          disabled={locBusy}
          onClick={() => void shareLocation()}
          className="mt-2 min-h-9 w-full rounded-lg border border-cyan-400/30 text-[11px] font-semibold text-cyan-200 [@media(pointer:coarse)]:min-h-11"
        >
          {locBusy ? '…' : t('actions.shareLocation')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowPrompt(true)}
          className="mt-2 text-[11px] text-zinc-500 hover:text-zinc-300 [@media(pointer:coarse)]:min-h-11"
        >
          Activar ubicación
        </button>
      )}
      {showPrompt && !location ? (
        <button
          type="button"
          onClick={() => {
            dismissLocationPrompt();
            setShowPrompt(false);
          }}
          className="mt-1 text-[10px] text-zinc-600 [@media(pointer:coarse)]:min-h-11"
        >
          Ahora no
        </button>
      ) : null}
    </section>
  );
}

/** "Tu zona" autónoma para el menú de celular / tablet en vertical (donde no se ve el rail derecho). */
export function MobileZoneCard() {
  const uid = useAuthStore((state) => state.profile?.firebaseUid);
  const [location, setLocation] = useState<PrivateUserLocation | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void fetchPrivateLocation(uid)
      .then((geo) => {
        if (!cancelled) setLocation(geo);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!uid) return null;
  return <ZoneCard location={location} onLocationChange={setLocation} />;
}
