import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Radio, X } from 'lucide-react';
import { formatRemaining, locationInAppHref } from '../../lib/locationShare';
import { useLiveLocationShare, useNow } from '../../lib/liveLocation';
import { useAuthStore } from '../../store/authStore';

/** Aviso flotante mientras se comparte la ubicación en tiempo real (en todas las pantallas). */
export function LiveLocationIndicator() {
  const uid = useAuthStore((state) => state.profile?.firebaseUid ?? null);
  const shareId = useLiveLocationShare((state) => state.shareId);
  const expiresAtMs = useLiveLocationShare((state) => state.expiresAtMs);
  const resume = useLiveLocationShare((state) => state.resume);
  const stop = useLiveLocationShare((state) => state.stop);
  const current = useLiveLocationShare((state) => state.currentLocation);
  const lat = useLiveLocationShare((state) => state.lat);
  const routeLocation = useLocation();
  const now = useNow(Boolean(shareId));

  useEffect(() => {
    if (uid) resume();
    else if (useLiveLocationShare.getState().shareId) void useLiveLocationShare.getState().stop();
  }, [uid, resume]);

  if (!shareId || routeLocation.pathname.startsWith('/stream/')) return null;
  const loc = lat !== null ? current() : null;

  return (
    <div className="lb-live-loc-indicator" role="status">
      <span className="lb-live-loc-indicator__dot" aria-hidden />
      {loc ? (
        <Link to={locationInAppHref(loc)} className="lb-live-loc-indicator__text">
          <Radio size={13} aria-hidden />
          <span>Ubicación en vivo · {formatRemaining(expiresAtMs - now)}</span>
        </Link>
      ) : (
        <span className="lb-live-loc-indicator__text">
          <Radio size={13} aria-hidden />
          <span>Ubicación en vivo · {formatRemaining(expiresAtMs - now)}</span>
        </span>
      )}
      <button
        type="button"
        onClick={() => void stop()}
        className="lb-live-loc-indicator__stop"
        aria-label="Detener ubicación en tiempo real"
      >
        <X size={15} />
      </button>
    </div>
  );
}
