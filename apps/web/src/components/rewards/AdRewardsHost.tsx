import { Gift, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { adRewardsApi, formatPoints, type AdSurface, type SponsoredCampaign } from '../../lib/adRewardsApi';
import {
  AD_DUE_EVENT,
  claimAdTurn,
  isAdDue,
  isUnsafeAdContext,
  releaseAdTurn,
  setAdIntervalMinutes,
  startAdCadence,
} from '../../lib/adRewardCadence';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { AD_VISIT_KEY, SponsoredRewardCard, type PendingVisit } from './SponsoredRewardCard';

const SEEN_KEY = 'lb.adRewardsSeen.v1';
const STATUS_EVERY_MS = 30 * 60_000;
const VISIT_MAX_MS = 30 * 60_000;

/** Superficie inmersiva actual (el feed de Inicio usa espacios propios dentro de la lista). */
function immersiveSurface(pathname: string): AdSurface | null {
  if (pathname.startsWith('/explorar')) return 'explorar';
  if (typeof document === 'undefined') return null;
  if (document.querySelector('.fixed.inset-0.z-\\[105\\]')) return 'flash';
  if (document.querySelector('.fixed.inset-0.z-\\[100\\]')) return 'clips';
  return null;
}

function readVisit(): PendingVisit | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(AD_VISIT_KEY) || 'null') as PendingVisit | null;
    if (!v?.sessionId || Date.now() - v.startedAtMs > VISIT_MAX_MS) {
      sessionStorage.removeItem(AD_VISIT_KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

function useVisitTracker(pathname: string) {
  const setToast = useUiStore((s) => s.setToast);
  const [visit, setVisit] = useState<PendingVisit | null>(() => readVisit());
  const [seconds, setSeconds] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    setVisit(readVisit());
    doneRef.current = false;
  }, [pathname]);

  const onProfile = Boolean(
    visit && pathname.toLowerCase() === `/u/${visit.username.toLowerCase()}`,
  );

  useEffect(() => {
    if (!visit || !onProfile) return;
    let local = 0;
    let sinceBeat = 0;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min((now - last) / 1000, 1.5);
      last = now;
      if (document.visibilityState !== 'visible' || navigator.onLine === false) {
        sinceBeat = 0;
        return;
      }
      local += delta;
      sinceBeat += delta;
      setSeconds(local);
      if (sinceBeat >= 5) {
        sinceBeat = 0;
        void adRewardsApi.beat(visit.sessionId, {}).catch(() => undefined);
      }
      if (local >= visit.minSeconds && !doneRef.current) {
        doneRef.current = true;
        window.clearInterval(id);
        void adRewardsApi
          .complete(visit.sessionId, {})
          .then((award) => {
            sessionStorage.removeItem(AD_VISIT_KEY);
            setVisit(null);
            setToast(
              award.status === 'VALIDADO'
                ? `+${formatPoints(award.points)} PUNTOS — Puntos acreditados correctamente.`
                : `+${formatPoints(award.points)} PUNTOS PENDIENTES — Se acreditan al verificar la acción.`,
              'success',
            );
          })
          .catch((err: unknown) => {
            doneRef.current = false;
            const code = (err as { data?: { code?: string } })?.data?.code;
            if (code === 'TIME_NOT_REACHED') {
              local = Math.max(0, visit.minSeconds - 5);
              return;
            }
            sessionStorage.removeItem(AD_VISIT_KEY);
            setVisit(null);
            setToast(err instanceof Error ? err.message : 'No se pudieron acreditar los puntos', 'error');
          });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [visit, onProfile, setToast]);

  return onProfile && visit ? { visit, seconds } : null;
}

export function AdRewardsHost() {
  const uid = useAuthStore((s) => s.profile?.firebaseUid ?? null);
  const location = useLocation();
  const pathname = location.pathname;
  const [announce, setAnnounce] = useState(false);
  const [dock, setDock] = useState<{ campaign: SponsoredCampaign; surface: AdSurface } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const visitProgress = useVisitTracker(pathname);

  useEffect(() => {
    if (!uid) return;
    return startAdCadence();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const load = () => {
      void adRewardsApi
        .status()
        .then((s) => {
          if (cancelled || !s.enabled) return;
          setAdIntervalMinutes(s.intervalMinutes);
          const seen = Number(localStorage.getItem(`${SEEN_KEY}:${uid}`) || 0);
          if (s.latestPublishedAtMs > seen) setAnnounce(true);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, STATUS_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || dock) return;
    let busy = false;
    const tryShow = () => {
      if (busy || !isAdDue()) return;
      const path = pathRef.current;
      const surface = immersiveSurface(path);
      if (!surface || isUnsafeAdContext(path)) return;
      if (!claimAdTurn()) return;
      busy = true;
      void adRewardsApi
        .feed(surface)
        .then((out) => {
          releaseAdTurn(Boolean(out.campaign));
          if (out.campaign) setDock({ campaign: out.campaign, surface });
        })
        .catch(() => releaseAdTurn(false))
        .finally(() => {
          busy = false;
        });
    };
    // Punto seguro: al pasar de un video al siguiente (gesto de navegación), nunca a mitad de uno.
    let gestureTimer = 0;
    const onGesture = () => {
      window.clearTimeout(gestureTimer);
      gestureTimer = window.setTimeout(tryShow, 600);
    };
    window.addEventListener('wheel', onGesture, { passive: true });
    window.addEventListener('touchend', onGesture, { passive: true });
    window.addEventListener('keyup', onGesture);
    window.addEventListener(AD_DUE_EVENT, onGesture);
    return () => {
      window.clearTimeout(gestureTimer);
      window.removeEventListener('wheel', onGesture);
      window.removeEventListener('touchend', onGesture);
      window.removeEventListener('keyup', onGesture);
      window.removeEventListener(AD_DUE_EVENT, onGesture);
    };
  }, [uid, dock]);

  useEffect(() => {
    if (!dock || sheetOpen) return;
    if (immersiveSurface(pathname) == null) setDock(null);
  }, [pathname, dock, sheetOpen]);

  function dismissAnnounce() {
    if (uid) localStorage.setItem(`${SEEN_KEY}:${uid}`, String(Date.now()));
    setAnnounce(false);
  }

  if (!uid || typeof document === 'undefined') return null;
  const unsafe = isUnsafeAdContext(pathname);

  return createPortal(
    <>
      {announce && !unsafe && !dock ? (
        <div className="lb-ad-announce fixed inset-x-0 z-[95] flex justify-center px-3" style={{ top: 'max(0.75rem, var(--lb-safe-top))' }}>
          <div className="flex w-full max-w-[24rem] items-center gap-2.5 rounded-2xl border border-fuchsia-400/35 bg-zinc-950/95 px-3 py-2.5 shadow-2xl backdrop-blur-md">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-500 text-white">
              <Gift size={18} />
            </span>
            <Link to="/recompensas" onClick={dismissAnnounce} className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">Gana puntos en iBoom</span>
              <span className="block text-[12px] text-zinc-300">Nuevas recompensas disponibles.</span>
            </Link>
            <button
              type="button"
              onClick={dismissAnnounce}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-400 hover:text-white"
              aria-label="Cerrar aviso"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {dock && !sheetOpen ? (
        <div
          className="fixed left-1/2 z-[115] w-[min(92vw,22rem)] -translate-x-1/2"
          style={{ top: 'calc(var(--lb-safe-top, 0px) + 3.6rem)' }}
        >
          <div className="flex items-center gap-2 rounded-2xl border border-amber-300/35 bg-zinc-950/95 p-1.5 pl-2 shadow-2xl backdrop-blur-md">
            <button type="button" onClick={() => setSheetOpen(true)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
              {dock.campaign.imageUrl ? (
                <img src={dock.campaign.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-fuchsia-500 text-white">
                  <Gift size={16} />
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">Patrocinado</span>
                <span className="block truncate text-[13px] font-semibold text-white">
                  Gana {formatPoints(dock.campaign.points)} puntos · {dock.campaign.advertiser}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDock(null)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-zinc-400 hover:text-white"
              aria-label="Cerrar publicidad"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {dock && sheetOpen ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-[rgba(0,0,0,0.7)] sm:items-center" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0" aria-label="Cerrar" onClick={() => { setSheetOpen(false); setDock(null); }} />
          <div className="relative max-h-[92dvh] w-full max-w-[28rem] overflow-y-auto overscroll-contain px-2 pb-[max(0.5rem,var(--lb-safe-bottom))] pt-2 sm:px-0">
            <button
              type="button"
              onClick={() => {
                setSheetOpen(false);
                setDock(null);
              }}
              className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-[rgba(0,0,0,0.6)] text-white sm:right-2"
              aria-label="Cerrar publicidad"
            >
              <X size={18} />
            </button>
            <SponsoredRewardCard campaign={dock.campaign} variant="sheet" />
          </div>
        </div>
      ) : null}

      {visitProgress ? (
        <div
          className="fixed left-1/2 z-[95] w-[min(92vw,20rem)] -translate-x-1/2"
          style={{ bottom: 'calc(var(--lb-bottom-nav-h, 0px) + var(--lb-safe-bottom, 0px) + 0.75rem)' }}
        >
          <div className="rounded-2xl border border-fuchsia-400/35 bg-zinc-950/95 px-3 py-2 shadow-2xl backdrop-blur-md">
            <p className="text-[12px] font-semibold text-white">
              Gana {formatPoints(visitProgress.visit.points)} puntos · visitando perfil
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-[width] duration-700"
                style={{
                  width: `${Math.min(100, Math.round((visitProgress.seconds / Math.max(1, visitProgress.visit.minSeconds)) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
