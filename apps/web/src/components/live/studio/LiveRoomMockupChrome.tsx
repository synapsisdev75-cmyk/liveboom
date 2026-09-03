import { Coins, Eye, Gift, Heart, MapPin, Radio, Timer } from 'lucide-react';
import { GiftIcon } from '../FloatingGift';

export type HostLiveStatSnapshot = {
  startedAt?: string;
  viewers: number;
  likes?: number;
  giftsCount?: number;
  coinsEarned: number;
  goalCoins: number;
  goalLabel?: string;
  topGifters: { uid: string; name: string; coins: number }[];
};

export type RecentLiveGiftRow = {
  id: string;
  senderName: string;
  giftId: string;
  giftName: string;
  coins: number;
  atLabel: string;
};

function formatElapsed(startedAt?: string) {
  const start = startedAt ? new Date(startedAt).getTime() : Date.now();
  const total = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('es-CO');
}

type LeftProps = {
  stats: HostLiveStatSnapshot;
  recentGifts: RecentLiveGiftRow[];
  nowMs: number;
  onOpenWishlist?: () => void;
};

/** Columna izquierda del dashboard host (mockup transmitir). */
export function HostLiveLeftRail({ stats, recentGifts, nowMs: _nowMs, onOpenWishlist }: LeftProps) {
  void _nowMs;
  const elapsed = formatElapsed(stats.startedAt);
  const goal = Math.max(0, stats.goalCoins || 0);
  const earned = Math.max(0, stats.coinsEarned || 0);
  const softCap = goal > 0 ? goal : Math.max(20, Math.ceil(Math.max(earned, 1) / 20) * 20);
  const pct = Math.min(100, Math.round((earned / softCap) * 100));
  const metaCurrent = goal > 0 ? Math.min(earned, goal) : Math.min(earned, softCap);
  const metaMax = goal > 0 ? goal : softCap;

  return (
    <aside className="lb-host-left hidden min-h-0 w-[min(100%,240px)] shrink-0 flex-col gap-3 overflow-y-auto lg:flex">
      <section className="rounded-2xl border border-white/10 bg-zinc-950/80 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Resumen del live</p>
        <ul className="mt-2 space-y-2 text-xs text-zinc-200">
          <li className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <Timer size={12} className="text-violet-400" /> Tiempo en vivo
            </span>
            <span className="font-semibold tabular-nums text-white">{elapsed}</span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <Eye size={12} className="text-violet-400" /> Espectadores
            </span>
            <span className="font-semibold text-white">{formatCompact(stats.viewers)}</span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <Heart size={12} className="text-violet-400" /> Me gusta
            </span>
            <span className="font-semibold text-white">{formatCompact(stats.likes || 0)}</span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <Gift size={12} className="text-violet-400" /> Regalos recibidos
            </span>
            <span className="font-semibold text-white">{formatCompact(stats.giftsCount || 0)}</span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <Coins size={12} className="text-violet-400" /> Coins ganados
            </span>
            <span className="font-semibold text-amber-300">{earned.toLocaleString('es-CO')}</span>
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-950/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Meta de regalos</p>
          <span className="text-[11px] font-bold tabular-nums text-violet-300">
            {metaCurrent} / {metaMax || 20}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[10px] leading-snug text-zinc-500">
          {stats.goalLabel || 'Envía regalos para completar la meta y ganar recompensas.'}
        </p>
        {onOpenWishlist ? (
          <button
            type="button"
            onClick={onOpenWishlist}
            className="mt-1 text-[11px] font-semibold text-violet-300 hover:text-violet-200"
          >
            Ver lista
          </button>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-950/80 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Regalos recientes</p>
        <ul className="mt-2 space-y-2">
          {recentGifts.length === 0 ? (
            <li className="text-[11px] text-zinc-500">Aún no hay regalos en esta sala.</li>
          ) : (
            recentGifts.slice(0, 8).map((gift) => (
              <li key={gift.id} className="flex items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-100">
                  {gift.senderName.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-white">
                    @{gift.senderName.replace(/^@/, '')}
                  </span>
                  <span className="block truncate text-[10px] text-zinc-500">
                    {gift.giftName} · {gift.atLabel}
                  </span>
                </span>
                <GiftIcon giftId={gift.giftId} size={22} />
              </li>
            ))
          )}
        </ul>
      </section>
    </aside>
  );
}

type FooterProps = {
  stats: HostLiveStatSnapshot;
  onCrearVs: () => void;
};

export function HostLiveFooterBar({ stats, onCrearVs }: FooterProps) {
  const elapsed = formatElapsed(stats.startedAt);
  const top = stats.topGifters[0];
  return (
    <footer className="lb-host-footer hidden shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/90 px-3 py-2 lg:flex">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-300">
        <span className="inline-flex items-center gap-1">
          <Radio size={12} className="text-red-400" /> {elapsed}
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye size={12} /> {formatCompact(stats.viewers)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Heart size={12} /> {formatCompact(stats.likes || 0)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Gift size={12} /> {formatCompact(stats.giftsCount || 0)}
        </span>
        <span className="inline-flex items-center gap-1 text-amber-300">
          <Coins size={12} /> {stats.coinsEarned.toLocaleString('es-CO')}
        </span>
        {top ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-violet-500/30 text-[9px] font-bold">
              {top.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate max-w-[7rem]">@{top.name.replace(/^@/, '')}</span>
            <span className="tabular-nums text-amber-300">{top.coins.toLocaleString('es-CO')}</span>
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onCrearVs}
        className="group relative inline-flex h-14 max-w-[min(100%,16rem)] shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-violet-400/35 transition hover:ring-violet-300/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
        aria-label="Crear VS — Invita a otro creador"
      >
        <video
          src="/reactions/vs-cta.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          controls={false}
          className="pointer-events-none h-full w-auto max-w-full object-contain"
        />
      </button>
    </footer>
  );
}

type ViewerMetaProps = {
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
  title: string;
  subtitle?: string;
  category?: string;
  country?: string;
  following?: boolean;
  followBusy?: boolean;
  onFollow?: () => void;
  onGift?: () => void;
  onRecharge?: () => void;
  coins?: number;
  isSelf?: boolean;
};

/** Barra bajo el video del espectador (mockup quien ve). */
export function ViewerLiveInfoBar({
  username,
  displayName,
  avatarUrl,
  title,
  subtitle,
  category,
  country = 'Colombia',
  following,
  followBusy,
  onFollow,
  onGift,
  onRecharge,
  coins = 0,
  isSelf,
}: ViewerMetaProps) {
  return (
    <div className="lb-viewer-info pointer-events-auto mt-2 hidden w-full gap-3 lg:flex">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/15" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-violet-600/40 text-sm font-bold text-white">
            {(displayName || username).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{title}</p>
          {subtitle ? <p className="truncate text-xs text-zinc-400">{subtitle}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {category ? (
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                {category}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> En vivo
            </span>
            {country ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                <MapPin size={10} /> {country}
              </span>
            ) : null}
          </div>
          {!isSelf && onFollow ? (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={followBusy}
                onClick={onFollow}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                  following
                    ? 'bg-white/10 text-zinc-200'
                    : 'bg-violet-600 text-white hover:bg-violet-500'
                }`}
              >
                <Heart size={12} fill={following ? 'currentColor' : 'none'} />
                {following ? 'Siguiendo' : 'Seguir'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onGift ? (
          <button
            type="button"
            onClick={onGift}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            <Gift size={14} /> Regalar
          </button>
        ) : null}
        {onRecharge ? (
          <button
            type="button"
            onClick={onRecharge}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-zinc-900 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-zinc-800"
          >
            <Coins size={14} className="text-amber-400" /> Recargar
          </button>
        ) : null}
        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900 py-1 pl-2.5 pr-1">
          <Coins size={14} className="text-amber-400" />
          <span className="text-xs font-bold tabular-nums text-white">{coins.toLocaleString('es-CO')}</span>
          {onRecharge ? (
            <button
              type="button"
              onClick={onRecharge}
              className="grid h-7 w-7 place-items-center rounded-full bg-violet-600 text-sm font-bold text-white"
              aria-label="Añadir coins"
            >
              +
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function formatLiveElapsed(startedAt?: string) {
  return formatElapsed(startedAt);
}

export function formatLiveCompact(n: number) {
  return formatCompact(n);
}
