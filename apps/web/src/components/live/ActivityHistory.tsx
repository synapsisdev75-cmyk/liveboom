import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Coins, Gift, Info, Radio, Video } from 'lucide-react';
import { apiPublic } from '../../lib/api';
import { listenLiveActivity, type LiveActivityEntry } from '../../lib/liveGiftsFirestore';
import { LIVEBOOM_REACTION_ASSETS } from '../../lib/liveBoomReactionAssets';
import { profileHref } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';

export type LiveActivity = {
  id?: string;
  username: string;
  displayName: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  viewers: number;
  coinsEarned?: number;
  goalCoins?: number;
  goalLabel?: string;
  topGifters?: { uid?: string; name: string; coins: number }[];
};

function formatDuration(ms?: number) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function mapEntry(entry: LiveActivityEntry): LiveActivity {
  return {
    id: entry.id,
    username: entry.username,
    displayName: entry.displayName,
    title: entry.title,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    durationMs: entry.durationMs,
    viewers: entry.viewers,
    coinsEarned: entry.coinsEarned,
    goalCoins: entry.goalCoins,
    goalLabel: entry.goalLabel,
    topGifters: entry.topGifters,
  };
}

export function ActivityHistory({
  username,
  compact = false,
  limit = 2,
  showAllLink = true,
  positiveReactions = 0,
  negativeReactions = 0,
}: {
  username: string;
  compact?: boolean;
  limit?: number;
  showAllLink?: boolean;
  positiveReactions?: number;
  negativeReactions?: number;
}) {
  const profile = useAuthStore((state) => state.profile);
  const [lives, setLives] = useState<LiveActivity[]>([]);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;

    // Historial durable en Firestore (cuenta propia).
    if (profile?.firebaseUid && profile.handle.toLowerCase() === username.toLowerCase()) {
      return listenLiveActivity(profile.firebaseUid, (list) => {
        if (!cancelled) setLives(list.map(mapEntry));
      });
    }

    void apiPublic<{ lives: LiveActivity[] }>(
      `/api/stream/history?username=${encodeURIComponent(username)}`,
    )
      .then((data) => {
        if (!cancelled) setLives(data.lives || []);
      })
      .catch(() => {
        if (!cancelled) setLives([]);
      });
    return () => {
      cancelled = true;
    };
  }, [username, profile?.firebaseUid, profile?.handle]);

  if (compact) {
    if (lives.length === 0) {
      return <p className="mt-3 text-sm text-zinc-400">Aún no has transmitido.</p>;
    }
    return (
      <ul className="mt-3 space-y-2">
        {lives.slice(0, limit).map((live) => (
          <li key={live.id || `${live.username}-${live.startedAt}`} className="text-xs text-zinc-400">
            <p className="font-semibold text-zinc-200">{live.title}</p>
            <p>
              {formatDuration(live.durationMs)} · {(live.coinsEarned || 0).toLocaleString('es-CO')} coins
            </p>
            {live.topGifters && live.topGifters.length > 0 ? (
              <p className="truncate text-[10px] text-cyan-400">
                Top:{' '}
                {live.topGifters[0]?.uid ? (
                  <Link
                    to={profileHref(live.topGifters[0].name, live.topGifters[0].uid)}
                    className="hover:underline"
                  >
                    {live.topGifters[0]?.name}
                  </Link>
                ) : (
                  live.topGifters[0]?.name
                )}{' '}
                ({live.topGifters[0]?.coins})
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  const totalLives = lives.length;
  const totalBlasts = lives.reduce((sum, live) => sum + Math.max(0, live.coinsEarned || 0), 0);
  const totalGifts = lives.reduce((sum, live) => sum + (live.topGifters?.length || 0), 0);
  const positives = Math.max(0, positiveReactions);
  const negatives = Math.max(0, negativeReactions);
  const hasInteractions = positives + negatives > 0;
  const hasBlasts = totalGifts + totalBlasts > 0;

  return (
    <section className="lb-activity-summary">
      <div className="lb-activity-summary__head">
        <span className="lb-activity-summary__mark" aria-hidden>
          <Radio size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="lb-activity-summary__title">Actividad</h2>
          <p className="lb-activity-summary__sub">
            Consulta tu resumen de lives, interacciones y Blasts.
          </p>
        </div>
        {showAllLink ? (
          <Link to="/actividad" className="lb-activity-summary__more">
            Ver más
            <ChevronRight size={14} />
          </Link>
        ) : null}
      </div>

      <div className="lb-activity-summary__grid">
        <Link to="/actividad" className="lb-activity-card lb-activity-card--lives">
          <span className="lb-activity-card__icon">
            <Video size={15} />
          </span>
          <span className="lb-activity-card__label">
            Lives
            <span title="Total de transmisiones finalizadas" className="inline-flex">
              <Info size={11} aria-hidden />
            </span>
          </span>
          {totalLives > 0 ? (
            <>
              <strong className="lb-activity-card__value">{totalLives.toLocaleString('es-CO')}</strong>
              <span className="lb-activity-card__hint">Transmisiones totales</span>
            </>
          ) : (
            <span className="lb-activity-card__empty">Aún sin transmisiones</span>
          )}
          <ChevronRight size={14} className="lb-activity-card__chevron" />
        </Link>

        <Link to="/actividad" className="lb-activity-card lb-activity-card--react">
          <span className="lb-activity-card__icon">
            <Radio size={15} />
          </span>
          <span className="lb-activity-card__label">
            Interacciones
            <span title="Reacciones positivas y negativas en tu contenido" className="inline-flex">
              <Info size={11} aria-hidden />
            </span>
          </span>
          {hasInteractions ? (
            <span className="lb-activity-card__split">
              <span className="lb-activity-metric">
                <img
                  src={positives > 0 ? LIVEBOOM_REACTION_ASSETS.likeOn : LIVEBOOM_REACTION_ASSETS.likeOff}
                  alt=""
                  className="lb-activity-bomb"
                />
                <strong>{positives.toLocaleString('es-CO')}</strong>
                <em>Positivas</em>
              </span>
              <span className="lb-activity-metric">
                <img
                  src={negatives > 0 ? LIVEBOOM_REACTION_ASSETS.dislikeOn : LIVEBOOM_REACTION_ASSETS.dislikeOff}
                  alt=""
                  className="lb-activity-bomb"
                />
                <strong>{negatives.toLocaleString('es-CO')}</strong>
                <em>Negativas</em>
              </span>
            </span>
          ) : (
            <span className="lb-activity-card__empty">Sin interacciones todavía</span>
          )}
          <ChevronRight size={14} className="lb-activity-card__chevron" />
        </Link>

        <Link to="/actividad" className="lb-activity-card lb-activity-card--blasts">
          <span className="lb-activity-card__icon">
            <Gift size={15} />
          </span>
          <span className="lb-activity-card__label">
            Blasts / Coins
            <span title="Regalos y Blasts acumulados en tus lives" className="inline-flex">
              <Info size={11} aria-hidden />
            </span>
          </span>
          {hasBlasts ? (
            <span className="lb-activity-card__split">
              <span className="lb-activity-metric">
                <Gift size={14} className="text-pink-300" />
                <strong>{totalGifts.toLocaleString('es-CO')}</strong>
                <em>Regalos recibidos</em>
              </span>
              <span className="lb-activity-metric">
                <Coins size={14} className="text-amber-300" />
                <strong>{totalBlasts.toLocaleString('es-CO')}</strong>
                <em>Blasts ganados</em>
              </span>
            </span>
          ) : (
            <span className="lb-activity-card__empty">Sin movimientos todavía</span>
          )}
          <ChevronRight size={14} className="lb-activity-card__chevron" />
        </Link>
      </div>
    </section>
  );
}
