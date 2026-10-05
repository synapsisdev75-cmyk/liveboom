import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { subscribeFeedVideoWarm } from '../../lib/feedVideoWarmup';

/** El inicio ya recibió el primer lote real de publicaciones. */
export const HOME_FEED_READY_EVENT = 'liveboom:home-feed-ready';

let homeFeedMarked = false;

type BootProgressApi = {
  setTarget: (n: number) => void;
  setExact: (n: number) => void;
  stop: () => void;
};

function bootProgress(): BootProgressApi | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { __lbBootProgress?: BootProgressApi }).__lbBootProgress || null;
}

export function markHomeFeedReady() {
  if (homeFeedMarked || typeof window === 'undefined') return;
  homeFeedMarked = true;
  window.setTimeout(() => {
    window.dispatchEvent(new Event(HOME_FEED_READY_EVENT));
  }, 280);
}

const FEED_WAIT_MS = 5000;

/**
 * Mantiene el splash hasta la sesión, el feed de inicio y la precarga
 * del arranque de los videos largos. Actualiza la barra real del splash.
 */
export function BootSplash() {
  const ready = useAuthStore((state) => state.ready);
  const profile = useAuthStore((state) => state.profile);
  const { pathname } = useLocation();
  const [feedReady, setFeedReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [warmPhase, setWarmPhase] = useState<'idle' | 'running' | 'settled'>('idle');
  const [warmTimedOut, setWarmTimedOut] = useState(false);
  const onHome = pathname === '/inicio';

  useEffect(() => {
    const onFeed = () => setFeedReady(true);
    window.addEventListener(HOME_FEED_READY_EVENT, onFeed);
    return () => window.removeEventListener(HOME_FEED_READY_EVENT, onFeed);
  }, []);

  useEffect(() => {
    if (!ready || !profile || !onHome || feedReady) return;
    const timer = window.setTimeout(() => setTimedOut(true), FEED_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [ready, profile, onHome, feedReady]);

  useEffect(() => subscribeFeedVideoWarm(setWarmPhase), []);

  useEffect(() => {
    if (warmPhase !== 'running') return;
    const timer = window.setTimeout(() => setWarmTimedOut(true), 4000);
    return () => window.clearTimeout(timer);
  }, [warmPhase]);

  const waitingFeed = Boolean(ready && profile && onHome && !feedReady && !timedOut);
  const waitingWarm = Boolean(onHome && warmPhase === 'running' && !warmTimedOut);
  const visible = !ready || waitingFeed || waitingWarm;

  // Barra real: hitos de sesión / feed / warm (nunca baja).
  useEffect(() => {
    const api = bootProgress();
    if (!api) return;
    let target = 22;
    if (ready) target = 52;
    if (!waitingFeed) target = Math.max(target, 78);
    if (!waitingWarm) target = Math.max(target, 92);
    if (!visible) target = 100;
    api.setTarget(target);
    if (!visible) {
      api.setExact(100);
      window.setTimeout(() => api.stop(), 260);
    }
  }, [ready, waitingFeed, waitingWarm, visible]);

  useEffect(() => {
    const splash = document.getElementById('lb-boot-splash');
    if (!splash) return;
    if (visible) {
      splash.classList.remove('is-done');
      splash.setAttribute('aria-busy', 'true');
      return;
    }
    splash.classList.add('is-done');
    splash.setAttribute('aria-busy', 'false');
  }, [visible]);

  return null;
}
