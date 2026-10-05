import { CheckCircle2, ExternalLink, Gift, Pause, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import {
  adRewardsApi,
  formatPoints,
  type AwardResult,
  type ClientSignals,
  type SponsoredCampaign,
} from '../../lib/adRewardsApi';
import { followUser } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';

export const AD_VISIT_KEY = 'lb.adVisit.v1';

export type PendingVisit = {
  sessionId: string;
  campaignId: string;
  username: string;
  minSeconds: number;
  points: number;
  startedAtMs: number;
};

type Phase = 'idle' | 'starting' | 'running' | 'follow' | 'claiming' | 'done' | 'error';

type PauseReason = 'hidden' | 'offscreen' | 'offline' | 'video' | null;

const PAUSE_TEXT: Record<Exclude<PauseReason, null>, string> = {
  hidden: 'En pausa: vuelve a esta pantalla para seguir sumando.',
  offscreen: 'En pausa: desplázate hasta la publicidad.',
  offline: 'En pausa: sin conexión.',
  video: 'En pausa: reproduce el video para seguir sumando.',
};

function taskText(c: SponsoredCampaign) {
  const handle = c.advertiserUsername ? `@${c.advertiserUsername}` : c.advertiser;
  switch (c.actionKind) {
    case 'view':
      return `Mira este contenido durante ${c.minSeconds} segundos`;
    case 'visit':
      return `Visita el perfil de ${handle} durante ${c.minSeconds} segundos`;
    case 'follow':
      return `Sigue a ${handle}. Los puntos se confirman si mantienes el seguimiento.`;
    case 'view_follow':
      return `Mira ${c.minSeconds} segundos y sigue a ${handle}`;
    case 'comment':
      return 'Deja un comentario real sobre esta campaña';
    default:
      if (c.actionType === 'REGISTER') return 'Regístrate con el anunciante. Los puntos llegan cuando lo confirme.';
      if (c.actionType === 'DOWNLOAD_FORM') return 'Descarga o completa el formulario. Los puntos llegan cuando el anunciante lo confirme.';
      return 'Realiza tu compra con el anunciante. Los puntos llegan cuando la confirme.';
  }
}

function buttonText(c: SponsoredCampaign) {
  switch (c.actionKind) {
    case 'visit':
      return 'VISITAR PERFIL';
    case 'follow':
      return 'SEGUIR Y GANAR';
    case 'comment':
      return 'COMENTAR Y GANAR';
    case 'external':
      return (c.ctaLabel || 'PARTICIPAR').toUpperCase();
    default:
      return 'GANAR PUNTOS';
  }
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : 'No se pudo completar. Intenta de nuevo.';
}

type Props = {
  campaign: SponsoredCampaign;
  /** `sheet`: dentro de la hoja abierta desde la tarjeta flotante (Explorar, Boom Clip, Flash Boom). */
  variant?: 'feed' | 'sheet';
  onFinished?: (result: AwardResult | null) => void;
};

export function SponsoredRewardCard({ campaign, variant = 'feed', onFinished }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AwardResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pause, setPause] = useState<PauseReason>(null);
  const [muted, setMuted] = useState(true);
  const [comment, setComment] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const sessionRef = useRef<string | null>(null);
  const elapsedRef = useRef(0);
  const inViewRef = useRef(false);
  const signalsRef = useRef<ClientSignals>({});
  const maxWatchedRef = useRef(0);
  const sinceBeatRef = useRef(0);
  const beatClockRef = useRef({ wall: 0, perf: 0 });
  const finishedRef = useRef(false);

  const hasVideo = Boolean(campaign.videoUrl);
  const timed = campaign.actionKind === 'view' || campaign.actionKind === 'view_follow';

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.5);
        const v = videoRef.current;
        if (!v) return;
        if (inViewRef.current) void v.play().catch(() => undefined);
        else v.pause();
      },
      { threshold: [0, 0.5, 0.75] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (sessionRef.current && !finishedRef.current) {
        void adRewardsApi.abandon(sessionRef.current).catch(() => undefined);
      }
    };
  }, []);

  const finish = useCallback(
    (award: AwardResult) => {
      finishedRef.current = true;
      setResult(award);
      setPhase('done');
      onFinished?.(award);
    },
    [onFinished],
  );

  const claimView = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;
    setPhase('claiming');
    try {
      finish(await adRewardsApi.complete(id, signalsRef.current));
    } catch (err) {
      if (err instanceof ApiError && err.data.code === 'TIME_NOT_REACHED') {
        const remaining = Number(err.data.remainingSeconds) || 3;
        elapsedRef.current = Math.max(0, campaign.minSeconds - remaining);
        setElapsed(elapsedRef.current);
        setPhase('running');
        return;
      }
      if (err instanceof ApiError && err.data.code === 'FOLLOW_REQUIRED') {
        setPhase('follow');
        return;
      }
      setError(errorText(err));
      setPhase('error');
    }
  }, [campaign.minSeconds, finish]);

  useEffect(() => {
    if (phase !== 'running') return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min((now - last) / 1000, 1.5);
      last = now;
      let reason: PauseReason = null;
      if (document.visibilityState !== 'visible') reason = 'hidden';
      else if (navigator.onLine === false) reason = 'offline';
      else if (!inViewRef.current) reason = 'offscreen';
      else if (hasVideo && videoRef.current && (videoRef.current.paused || videoRef.current.seeking)) reason = 'video';
      setPause(reason);
      if (reason) {
        sinceBeatRef.current = 0;
        return;
      }
      elapsedRef.current += delta;
      sinceBeatRef.current += delta;
      setElapsed(elapsedRef.current);
      if (sinceBeatRef.current >= 5 && sessionRef.current) {
        sinceBeatRef.current = 0;
        const wall = Date.now();
        const prev = beatClockRef.current;
        if (prev.wall && Math.abs(wall - prev.wall - (now - prev.perf)) > 3000) signalsRef.current.clockSkew = true;
        beatClockRef.current = { wall, perf: now };
        void adRewardsApi.beat(sessionRef.current, signalsRef.current).catch(() => undefined);
      }
      if (elapsedRef.current >= campaign.minSeconds) {
        window.clearInterval(id);
        void claimView();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, hasVideo, campaign.minSeconds, claimView]);

  async function startTimed() {
    setError(null);
    setPhase('starting');
    try {
      const started = await adRewardsApi.startSession(campaign.id, signalsRef.current);
      sessionRef.current = started.sessionId;
      elapsedRef.current = 0;
      sinceBeatRef.current = 0;
      beatClockRef.current = { wall: Date.now(), perf: performance.now() };
      setElapsed(0);
      if (campaign.actionKind === 'visit') {
        const visit: PendingVisit = {
          sessionId: started.sessionId,
          campaignId: campaign.id,
          username: campaign.advertiserUsername,
          minSeconds: started.minSeconds,
          points: campaign.points,
          startedAtMs: Date.now(),
        };
        sessionStorage.setItem(AD_VISIT_KEY, JSON.stringify(visit));
        finishedRef.current = true;
        onFinished?.(null);
        navigate(`/u/${encodeURIComponent(campaign.advertiserUsername)}`);
        return;
      }
      void videoRef.current?.play().catch(() => undefined);
      setPhase('running');
    } catch (err) {
      setError(errorText(err));
      setPhase('error');
    }
  }

  async function doFollow(thenClaimView: boolean) {
    if (!profile) return;
    setError(null);
    setPhase('claiming');
    try {
      await followUser(profile, campaign.advertiserUsername, campaign.advertiserUid);
      if (thenClaimView) await claimView();
      else finish(await adRewardsApi.follow(campaign.id));
    } catch (err) {
      setError(errorText(err));
      setPhase(thenClaimView ? 'follow' : 'error');
    }
  }

  async function doComment() {
    setError(null);
    setPhase('claiming');
    try {
      finish(await adRewardsApi.comment(campaign.id, comment));
    } catch (err) {
      setError(errorText(err));
      setPhase('idle');
    }
  }

  async function doExternal() {
    setError(null);
    setPhase('claiming');
    try {
      const out = await adRewardsApi.participate(campaign.id);
      window.open(out.redirectUrl, '_blank', 'noopener,noreferrer');
      setNote('Cuando el anunciante confirme tu participación verás los puntos en Mis recompensas.');
      setPhase('idle');
    } catch (err) {
      setError(errorText(err));
      setPhase('error');
    }
  }

  function onPrimary() {
    if (campaign.actionKind === 'view' || campaign.actionKind === 'view_follow' || campaign.actionKind === 'visit') {
      void startTimed();
    } else if (campaign.actionKind === 'follow') {
      void doFollow(false);
    } else if (campaign.actionKind === 'comment') {
      void doComment();
    } else {
      void doExternal();
    }
  }

  function openLink() {
    if (!campaign.linkUrl) return;
    void adRewardsApi.click(campaign.id).catch(() => undefined);
    window.open(campaign.linkUrl, '_blank', 'noopener,noreferrer');
  }

  const progress = timed ? Math.min(1, elapsed / Math.max(1, campaign.minSeconds)) : 0;
  const remaining = Math.max(0, Math.ceil(campaign.minSeconds - elapsed));
  const busy = phase === 'starting' || phase === 'claiming';
  const pendingResult = result && result.status !== 'VALIDADO';

  return (
    <article
      ref={rootRef}
      className={`lb-sponsored-card overflow-hidden rounded-2xl border border-amber-300/25 bg-zinc-950/95 ${
        variant === 'sheet' ? 'shadow-2xl' : ''
      }`}
      aria-label={`Publicidad de ${campaign.advertiser}`}
    >
      <header className="flex items-center gap-2.5 px-3.5 pt-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-fuchsia-500 text-sm font-black text-white">
          {campaign.advertiser.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{campaign.advertiser}</span>
          {campaign.advertiserUsername ? (
            <span className="block truncate text-[11px] text-zinc-500">@{campaign.advertiserUsername}</span>
          ) : null}
        </span>
        <span className="shrink-0 rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
          Patrocinado
        </span>
      </header>

      <div className="relative mt-3 bg-black">
        {hasVideo ? (
          <>
            <video
              ref={videoRef}
              src={campaign.videoUrl}
              poster={campaign.imageUrl || undefined}
              className="mx-auto block max-h-[min(70dvh,36rem)] w-full object-contain"
              playsInline
              muted={muted}
              loop
              preload="metadata"
              onRateChange={(e) => {
                const v = e.currentTarget;
                if (v.playbackRate > 1.05) {
                  signalsRef.current.playbackRate = v.playbackRate;
                  v.playbackRate = 1;
                }
              }}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                if (!e.currentTarget.seeking && t < maxWatchedRef.current + 2) {
                  maxWatchedRef.current = Math.max(maxWatchedRef.current, t);
                }
              }}
              onSeeking={(e) => {
                const v = e.currentTarget;
                if (phase === 'running' && v.currentTime > maxWatchedRef.current + 1.5) {
                  signalsRef.current.seekedForward = true;
                  v.currentTime = maxWatchedRef.current;
                }
              }}
            />
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="absolute bottom-2.5 right-2.5 grid h-11 w-11 place-items-center rounded-full bg-[rgba(0,0,0,0.6)] text-white"
              aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </>
        ) : (
          <img
            src={campaign.imageUrl}
            alt=""
            className="mx-auto block max-h-[min(70dvh,36rem)] w-full object-contain"
            loading="lazy"
          />
        )}
      </div>

      <div className="space-y-3 px-3.5 pb-3.5 pt-3">
        <div>
          <h3 className="text-[15px] font-bold leading-snug text-white">{campaign.name}</h3>
          {campaign.description ? (
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">{campaign.description}</p>
          ) : null}
          {campaign.linkUrl && campaign.actionKind !== 'external' ? (
            <button
              type="button"
              onClick={openLink}
              className="mt-1.5 inline-flex min-h-9 items-center gap-1 text-[12px] font-semibold text-cyan-300 hover:underline"
            >
              {campaign.ctaLabel || 'Más información'} <ExternalLink size={12} />
            </button>
          ) : null}
        </div>

        {phase === 'done' && result ? (
          <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-3 text-center">
            <CheckCircle2 className="mx-auto text-emerald-300" size={26} />
            <p className="mt-1 text-lg font-black text-emerald-300">
              +{formatPoints(result.points)} PUNTOS{pendingResult ? ' PENDIENTES' : ''}
            </p>
            <p className="text-[12px] text-zinc-300">
              {pendingResult
                ? 'Se acreditan cuando verifiquemos la acción.'
                : 'Puntos acreditados correctamente.'}
            </p>
            <Link to="/recompensas" className="mt-1.5 inline-flex min-h-9 items-center text-[12px] font-semibold text-cyan-300 hover:underline">
              Ver mis recompensas
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 to-cyan-500/10 px-3 py-3">
            <p className="flex items-center gap-1.5 text-[15px] font-black tracking-wide text-white">
              <Gift size={16} className="text-fuchsia-300" />
              GANA {formatPoints(campaign.points)} PUNTOS
            </p>
            <p className="mt-0.5 text-[12px] text-zinc-300">{taskText(campaign)}</p>

            {phase === 'running' || (phase === 'claiming' && timed) ? (
              <div className="mt-2.5">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-[width] duration-700"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-zinc-200">
                  {pause ? (
                    <>
                      <Pause size={12} className="text-amber-300" /> {PAUSE_TEXT[pause]}
                    </>
                  ) : phase === 'claiming' ? (
                    'Acreditando puntos…'
                  ) : (
                    `Faltan ${remaining} s`
                  )}
                </p>
              </div>
            ) : null}

            {phase === 'follow' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void doFollow(true)}
                className="mt-2.5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-sm font-black text-white disabled:opacity-60"
              >
                SEGUIR A @{campaign.advertiserUsername || campaign.advertiser}
              </button>
            ) : null}

            {campaign.actionKind === 'comment' && phase !== 'claiming' ? (
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={400}
                placeholder="Escribe tu opinión sobre esta campaña"
                className="mt-2.5 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-fuchsia-400/60 focus:outline-none"
              />
            ) : null}

            {phase === 'idle' || phase === 'error' || phase === 'starting' || (phase === 'claiming' && !timed) ? (
              <button
                type="button"
                disabled={busy || !profile || (campaign.actionKind === 'comment' && comment.trim().length < 8)}
                onClick={onPrimary}
                className="mt-2.5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-sm font-black tracking-wide text-white disabled:opacity-60"
              >
                {busy ? 'Un momento…' : phase === 'error' ? 'INTENTAR DE NUEVO' : buttonText(campaign)}
              </button>
            ) : null}

            {error ? <p className="mt-2 text-[12px] font-semibold text-fuchsia-300">{error}</p> : null}
            {note ? <p className="mt-2 text-[12px] text-cyan-200">{note}</p> : null}
          </div>
        )}
      </div>
    </article>
  );
}
