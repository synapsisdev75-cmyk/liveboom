import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { subscribeFeedVideoWarm } from '../../lib/feedVideoWarmup';

/** El inicio ya recibió el primer lote real de publicaciones. */
export const HOME_FEED_READY_EVENT = 'liveboom:home-feed-ready';

let homeFeedMarked = false;

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
 * del arranque de los videos largos.
 */
export function BootSplash() {
  const ready = useAuthStore((state) => state.ready);
  const profile = useAuthStore((state) => state.profile);
  const { pathname } = useLocation();
  const [feedReady, setFeedReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [warmPhase, setWarmPhase] = useState<'idle' | 'running' | 'settled'>('idle');
  const [warmTimedOut, setWarmTimedOut] = useState(false);
  const onHome = pathname === '/';

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

  useEffect(() => {
    const splash = document.getElementById('lb-boot-splash');
    if (!splash) return;
    if (visible) {
      splash.classList.remove('is-done');
      return;
    }
    splash.classList.add('is-done');
  }, [visible]);

  return null;
}
