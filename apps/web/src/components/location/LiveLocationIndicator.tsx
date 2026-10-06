import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Radio, Square } from 'lucide-react';
import { formatRemaining, locationInAppHref } from '../../lib/locationShare';
import { useLiveLocationShare, useNow } from '../../lib/liveLocation';
import { useAuthStore } from '../../store/authStore';

/**
 * Aviso permanente mientras se comparte la ubicación en tiempo real (todas las pantallas,
 * también dentro de un directo): qué se comparte, cuánto falta y el botón para dejar de compartir.
 */
export function LiveLocationIndicator() {
  const uid = useAuthStore((state) => state.profile?.firebaseUid ?? null);
  const shareId = useLiveLocationShare((state) => state.shareId);
  const expiresAtMs = useLiveLocationShare((state) => state.expiresAtMs);
  const untilOff = useLiveLocationShare((state) => state.untilOff);
  const resume = useLiveLocationShare((state) => state.resume);
  const stop = useLiveLocationShare((state) => state.stop);
  const current = useLiveLocationShare((state) => state.currentLocation);
  const lat = useLiveLocationShare((state) => state.lat);
  const routeLocation = useLocation();
  const now = useNow(Boolean(shareId) && !untilOff);

  useEffect(() => {
    if (uid) resume();
    else if (useLiveLocationShare.getState().shareId) void useLiveLocationShare.getState().stop();
  }, [uid, resume]);

  if (!shareId) return null;
  const loc = lat !== null ? current() : null;
  const onStream = routeLocation.pathname.startsWith('/stream/');
  const duration = untilOff ? 'Hasta que la desactives' : `Termina en ${formatRemaining(expiresAtMs - now)}`;
  const text = (
    <>
      <Radio size={13} aria-hidden className="shrink-0" />
      <span className="lb-live-loc-indicator__copy">
        <span className="lb-live-loc-indicator__title">Compartiendo ubicación en tiempo real</span>
        <span className="lb-live-loc-indicator__time">{duration}</span>
      </span>
    </>
  );

  return (
    <div className={`lb-live-loc-indicator${onStream ? ' is-stream' : ''}`} role="status" aria-live="polite">
      <span className="lb-live-loc-indicator__dot" aria-hidden />
      {loc ? (
        <Link to={locationInAppHref(loc)} className="lb-live-loc-indicator__text">
          {text}
        </Link>
      ) : (
        <span className="lb-live-loc-indicator__text">{text}</span>
      )}
      <button type="button" onClick={() => void stop()} className="lb-live-loc-indicator__stop">
        <Square size={12} aria-hidden />
        <span>Dejar de compartir</span>
      </button>
    </div>
  );
}
