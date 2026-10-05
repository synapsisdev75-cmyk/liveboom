import { ArrowLeft, Coins, Gift, Hourglass, RefreshCw, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  adRewardsApi,
  formatPoints,
  type MyRewards,
  type SponsoredCampaign,
} from '../lib/adRewardsApi';
import { SponsoredRewardCard } from '../components/rewards/SponsoredRewardCard';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';

const STATUS_STYLE: Record<string, string> = {
  VALIDADO: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/30',
  PENDIENTE: 'text-amber-300 bg-amber-500/10 ring-amber-300/30',
  RECHAZADO: 'text-fuchsia-300 bg-fuchsia-500/10 ring-fuchsia-400/30',
};

function formatDate(ms: number) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function ConvertModal({
  data,
  busy,
  onCancel,
  onConfirm,
}: {
  data: MyRewards;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(0,0,0,0.7)] sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Cancelar" onClick={onCancel} disabled={busy} />
      <div className="lb-panel relative w-full max-w-[24rem] rounded-t-3xl border border-white/10 bg-zinc-950 p-5 pb-[max(1.25rem,var(--lb-safe-bottom))] sm:rounded-3xl">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-zinc-400 hover:text-white"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
        <h2 className="text-lg font-bold text-white">Convertir a BLAST</h2>
        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <dt className="text-zinc-400">Puntos disponibles</dt>
            <dd className="font-bold text-white">{formatPoints(data.availablePoints)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-cyan-500/10 px-3 py-2.5 ring-1 ring-cyan-400/30">
            <dt className="text-cyan-100">BLAST que recibirás</dt>
            <dd className="text-lg font-black text-cyan-200">{formatPoints(data.conversion.blast)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <dt className="text-zinc-400">Puntos restantes</dt>
            <dd className="font-bold text-white">{formatPoints(data.conversion.remaining)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
          Los BLAST se suman a tus BLAST ganados y se pueden retirar según las Condiciones de Monetización.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-xl border border-white/15 text-sm font-semibold text-zinc-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-sm font-black text-white disabled:opacity-60"
          >
            {busy ? 'Convirtiendo…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function RewardsView() {
  const profile = useAuthStore((s) => s.profile);
  const ready = useAuthStore((s) => s.ready);
  const setToast = useUiStore((s) => s.setToast);
  const [data, setData] = useState<MyRewards | null>(null);
  const [campaigns, setCampaigns] = useState<SponsoredCampaign[]>([]);
  const [limitReached, setLimitReached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, list] = await Promise.all([adRewardsApi.me(), adRewardsApi.campaigns()]);
      setData(me);
      setCampaigns(list.campaigns);
      setLimitReached(list.limitReached);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus recompensas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.firebaseUid) void load();
  }, [profile?.firebaseUid, load]);

  async function convert() {
    setConverting(true);
    try {
      const out = await adRewardsApi.convert();
      setToast(`+${formatPoints(out.blast)} BLAST ganados — Recompensa publicitaria.`, 'success');
      setConfirmOpen(false);
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'No se pudo convertir', 'error');
    } finally {
      setConverting(false);
    }
  }

  if (ready && !profile) {
    return (
      <div className="lb-panel rounded-2xl px-4 py-10 text-center text-sm text-zinc-500">
        <Link to="/login" className="text-cyan-400 underline">
          Inicia sesión
        </Link>{' '}
        para ver tus recompensas.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 pb-6">
      <header className="flex items-center gap-2">
        <Link
          to="/billetera"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-300 hover:text-white"
          aria-label="Volver a Billetera"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-white">Mis recompensas</h1>
          <p className="text-[12px] text-zinc-500">Gana puntos viendo publicidad y completando acciones.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-300 hover:text-white disabled:opacity-50"
          aria-label="Actualizar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {error ? <p className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200">{error}</p> : null}

      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="lb-panel rounded-2xl border border-white/10 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
            <Sparkles size={13} className="text-fuchsia-300" /> Puntos disponibles
          </p>
          <p className="mt-1 text-2xl font-black text-white">{formatPoints(data?.availablePoints ?? 0)}</p>
        </div>
        <div className="lb-panel rounded-2xl border border-white/10 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
            <Hourglass size={13} className="text-amber-300" /> Puntos pendientes
          </p>
          <p className="mt-1 text-2xl font-black text-white">{formatPoints(data?.pendingPoints ?? 0)}</p>
        </div>
        <div className="lb-panel rounded-2xl border border-white/10 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
            <Coins size={13} className="text-cyan-300" /> BLAST obtenidos
          </p>
          <p className="mt-1 text-2xl font-black text-white">{formatPoints(data?.totalBlast ?? 0)}</p>
        </div>
      </section>

      <section className="lb-panel flex flex-col gap-3 rounded-2xl border border-white/10 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Convierte tus puntos en BLAST ganados</p>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            {data?.conversion.canConvert
              ? `Puedes convertir ahora y recibir ${formatPoints(data.conversion.blast)} BLAST.`
              : 'Sigue sumando puntos para hacer tu primera conversión.'}
          </p>
        </div>
        <button
          type="button"
          disabled={!data?.conversion.canConvert}
          onClick={() => setConfirmOpen(true)}
          className="min-h-11 shrink-0 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-5 text-sm font-black tracking-wide text-white disabled:opacity-40"
        >
          CONVERTIR A BLAST
        </button>
      </section>

      {data ? (
        <p className="text-[12px] text-zinc-500">
          Recompensas de hoy: {data.limits.usedToday} de {data.limits.dailyRewardLimit}.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.12em] text-white">
          <Gift size={15} className="text-fuchsia-300" /> Recompensas disponibles
        </h2>
        {limitReached ? (
          <p className="lb-panel rounded-2xl border border-white/10 px-4 py-6 text-center text-sm text-zinc-400">
            Alcanzaste el límite de recompensas de hoy. Vuelve mañana.
          </p>
        ) : campaigns.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {campaigns.map((c) => (
              <SponsoredRewardCard key={c.id} campaign={c} onFinished={() => void load()} />
            ))}
          </div>
        ) : !loading ? (
          <p className="lb-panel rounded-2xl border border-white/10 px-4 py-6 text-center text-sm text-zinc-400">
            No hay recompensas nuevas por ahora. Las publicidades patrocinadas aparecen mientras usas LiveBoom.
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Historial</h2>
        {data?.history.length ? (
          <div className="lb-panel overflow-hidden rounded-2xl border border-white/10">
            <div className="hidden grid-cols-[1.4fr_1.2fr_0.7fr_1fr_0.9fr] gap-2 border-b border-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 md:grid">
              <span>Campaña</span>
              <span>Acción</span>
              <span className="text-right">Puntos</span>
              <span>Fecha</span>
              <span>Estado</span>
            </div>
            <ul className="divide-y divide-white/5">
              {data.history.map((row) => (
                <li
                  key={`${row.kind}-${row.id}`}
                  className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 px-3 py-2.5 text-[13px] md:grid-cols-[1.4fr_1.2fr_0.7fr_1fr_0.9fr] md:items-center"
                >
                  <span className="min-w-0 truncate font-semibold text-white">{row.campaign}</span>
                  <span className="text-right font-bold text-white md:order-3">
                    {row.points > 0 ? '+' : ''}
                    {row.points < 0 ? `-${formatPoints(-row.points)}` : formatPoints(row.points)}
                    {row.blast ? <span className="ml-1 text-cyan-300">(+{formatPoints(row.blast)} BLAST)</span> : null}
                  </span>
                  <span className="min-w-0 truncate text-zinc-400 md:order-2">{row.action}</span>
                  <span className="text-right md:order-5 md:text-left">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                        STATUS_STYLE[row.status] || STATUS_STYLE.PENDIENTE
                      }`}
                    >
                      {row.status}
                    </span>
                  </span>
                  <span className="col-span-2 text-[11px] text-zinc-500 md:order-4 md:col-span-1">
                    {formatDate(row.createdAtMs)}
                    {row.status === 'PENDIENTE' && row.validatesAtMs
                      ? ` · se valida el ${formatDate(row.validatesAtMs)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="lb-panel rounded-2xl border border-white/10 px-4 py-6 text-center text-sm text-zinc-400">
            {loading ? 'Cargando…' : 'Aún no tienes movimientos de recompensas.'}
          </p>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Los puntos no son dinero ni se retiran directamente: solo se convierten en BLAST ganados. Consulta la{' '}
        <Link to="/legal/gana-puntos" className="text-cyan-400 underline">
          Política del programa Gana Puntos
        </Link>
        .
      </p>

      {confirmOpen && data ? (
        <ConvertModal data={data} busy={converting} onCancel={() => setConfirmOpen(false)} onConfirm={() => void convert()} />
      ) : null}
    </div>
  );
}
