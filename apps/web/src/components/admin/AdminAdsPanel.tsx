import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  formatPromoCop,
  PROMO_ANIMATED_MONTHLY_REF,
  PROMO_KINDS,
  PROMO_REVIEW_DEADLINE_MS,
  promoDurationLabel,
} from '../../lib/promoRegions';
import { PromotionBanner } from '../ads/PromotionBanner';
import type { PromotionAd } from '../../lib/promotionsFirestore';

type Campaign = PromotionAd & {
  paymentStatus?: string | null;
  reviewStatus?: string | null;
  publishStatus?: string | null;
  amountPaidCop?: number;
  hours?: number;
  createdAtMs?: number;
  orderReference?: string | null;
};

function reviewDeadlineLabel(createdAtMs?: number) {
  if (!createdAtMs) return null;
  const left = createdAtMs + PROMO_REVIEW_DEADLINE_MS - Date.now();
  if (left <= 0) return { text: 'Plazo de 24 h vencido: responder ya', late: true };
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return { text: `Responder en ${hours} h ${minutes} min`, late: false };
}

function campaignDuration(hours?: number) {
  const h = Math.max(0, Math.floor(Number(hours) || 0));
  if (!h) return '—';
  return promoDurationLabel(h >= 24 ? Math.round(h / 24) : 0, h);
}

type ProjectionRow = {
  mau: number;
  dauEstimated: number;
  impressionsPerSlot: number;
  impressionsTotal: number;
  staticIncomeCopRounded: number;
  animatedIncomeCopRounded: number;
  guidance: string;
};

type ProjectionRes = {
  params: {
    dauShare: number;
    impressionsPerUserPerDayPerSlot: number;
    scenarioDays: number;
    slots: number;
    cpmUsd: number;
    occupancy: number;
    animatedUplift: number;
    copPerUsd: number;
  };
  rows: ProjectionRow[];
  disclaimer: string;
  assumptions?: string;
  updatedAtMs?: number;
};

export function AdminAdsPanel() {
  const [sub, setSub] = useState<'campaigns' | 'projection'>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [projection, setProjection] = useState<ProjectionRes | null>(null);
  const [customMau, setCustomMau] = useState('25000');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  async function loadCampaigns() {
    const res = await api<{ campaigns: Campaign[] }>('/api/ads/admin/campaigns');
    const rows = res.campaigns || [];
    const pending = rows
      .filter((c) => c.reviewStatus === 'pending')
      .sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0));
    setCampaigns([...pending, ...rows.filter((c) => c.reviewStatus !== 'pending')]);
  }

  const pendingCount = campaigns.filter((c) => c.reviewStatus === 'pending').length;

  async function loadProjection(mau?: number) {
    const q = mau ? `?mau=${encodeURIComponent(String(mau))}` : '';
    const res = await api<ProjectionRes>(`/api/ads/admin/projection${q}`);
    setProjection(res);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        await loadCampaigns();
        try {
          await loadProjection();
        } catch {
          /* proyección opcional */
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar campañas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function decide(id: string, action: 'approve' | 'reject') {
    if (action === 'approve' && !window.confirm('¿Aprobar y publicar esta campaña? El plazo contratado empieza ahora.')) {
      return;
    }
    if (action === 'reject') {
      const reason = rejectReason.trim() || 'Rechazado por Super Admin';
      if (!window.confirm(`¿Rechazar esta campaña? Motivo: ${reason}`)) return;
    }
    setBusy(true);
    setNote(null);
    try {
      await api(`/api/ads/admin/campaigns/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          reason: action === 'reject' ? rejectReason.trim() || 'Rechazado por Super Admin' : undefined,
        }),
      });
      await loadCampaigns();
      setNote(action === 'approve' ? 'Campaña aprobada. El plazo empieza ahora.' : 'Campaña rechazada.');
      setRejectReason('');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  }

  async function saveParams() {
    if (!projection) return;
    setBusy(true);
    try {
      const res = await api<ProjectionRes>('/api/ads/admin/projection', {
        method: 'PUT',
        body: JSON.stringify({ params: projection.params }),
      });
      setProjection(res);
      setNote('Parámetros de proyección guardados. No cambian precios de venta.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSub('campaigns')}
          className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${
            sub === 'campaigns' ? 'bg-fuchsia-500/20 text-fuchsia-100 ring-1 ring-fuchsia-400/40' : 'bg-zinc-800/60 text-zinc-400'
          }`}
        >
          Campañas{pendingCount ? ` · ${pendingCount} por revisar` : ''}
        </button>
        <button
          type="button"
          onClick={() => setSub('projection')}
          className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${
            sub === 'projection' ? 'bg-fuchsia-500/20 text-fuchsia-100 ring-1 ring-fuchsia-400/40' : 'bg-zinc-800/60 text-zinc-400'
          }`}
        >
          Proyección de ingresos
        </button>
      </div>

      {note ? <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">{note}</p> : null}
      {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

      {sub === 'campaigns' ? (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">
            Cada publicidad pagada llega aquí para revisión. Al comprador se le promete respuesta en 2 a 24 horas.
            El tiempo contratado empieza al aprobar, no mientras espera revisión.
          </p>
          {loading ? <p className="text-sm text-zinc-500">Cargando campañas…</p> : null}
          {!loading && campaigns.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay campañas pendientes ni activas.</p>
          ) : (
            campaigns.map((ad) => {
              const deadline = ad.reviewStatus === 'pending' ? reviewDeadlineLabel(ad.createdAtMs) : null;
              const kindLabel = PROMO_KINDS.find((k) => k.id === ad.kind)?.label || ad.kind;
              return (
              <div
                key={ad.id}
                className={`rounded-2xl border p-3 ${
                  ad.reviewStatus === 'pending' ? 'border-amber-400/40 bg-amber-500/5' : 'border-white/10 bg-zinc-900/80'
                }`}
              >
                {deadline ? (
                  <p
                    className={`mb-2 text-xs font-bold ${deadline.late ? 'text-rose-400' : 'text-amber-300'}`}
                  >
                    Por revisar · {deadline.text}
                  </p>
                ) : null}
                <PromotionBanner ad={ad} compact preview />
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="inline text-zinc-500">Comprador: </dt>
                    <dd className="inline font-semibold text-white">
                      {ad.ownerDisplayName || ad.ownerUsername || '—'}
                      {ad.ownerUsername ? ` (@${ad.ownerUsername})` : ''}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="inline text-zinc-500">Paquete: </dt>
                    <dd className="inline text-white">
                      {campaignDuration(ad.hours)} · {ad.format === 'animated' ? 'animado / video' : 'estático'}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="inline text-zinc-500">Tipo: </dt>
                    <dd className="inline text-white">{kindLabel}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="inline text-zinc-500">Región: </dt>
                    <dd className="inline text-white">{ad.regionLabel || ad.regionId}</dd>
                  </div>
                  {ad.createdAtMs ? (
                    <div className="min-w-0">
                      <dt className="inline text-zinc-500">Pagado: </dt>
                      <dd className="inline text-white">{new Date(ad.createdAtMs).toLocaleString('es-CO')}</dd>
                    </div>
                  ) : null}
                  {ad.orderReference ? (
                    <div className="min-w-0">
                      <dt className="inline text-zinc-500">Referencia: </dt>
                      <dd className="inline break-all text-zinc-300">{ad.orderReference}</dd>
                    </div>
                  ) : null}
                  {ad.linkUrl ? (
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="inline text-zinc-500">Enlace: </dt>
                      <dd className="inline break-all text-cyan-300">{ad.linkUrl}</dd>
                    </div>
                  ) : null}
                </dl>
                {ad.mediaUrl ? (
                  <a
                    href={ad.mediaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-white/10 px-3 text-xs font-semibold text-cyan-300"
                  >
                    Ver archivo subido
                  </a>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                  <span>Pago: {ad.paymentStatus || 'histórico'}</span>
                  <span>Revisión: {ad.reviewStatus || 'histórico'}</span>
                  <span>Publicación: {ad.publishStatus || (ad.active ? 'live' : 'off')}</span>
                  <span>{formatPromoCop(Number(ad.amountPaidCop || ad.coinsPaid || 0))}</span>
                  <span>
                    CTR{' '}
                    {ad.impressions
                      ? `${((Number(ad.clicks || 0) / Number(ad.impressions)) * 100).toFixed(2)} %`
                      : 'Sin datos'}
                  </span>
                </div>
                {ad.reviewStatus === 'pending' ? (
                  <div className="mt-2 space-y-2">
                    <label className="block text-xs text-zinc-400">
                      Motivo si rechazas
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide(ad.id, 'approve')}
                        className="min-h-11 rounded-xl bg-emerald-500/20 px-3 text-xs font-semibold text-emerald-100"
                      >
                        Aprobar y publicar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide(ad.id, 'reject')}
                        className="min-h-11 rounded-xl bg-rose-500/15 px-3 text-xs font-semibold text-rose-200"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              );
            })
          )}
        </div>
      ) : null}

      {sub === 'projection' && !projection ? (
        <p className="text-sm text-zinc-500">No se pudo cargar la proyección. Revisa la red e intenta de nuevo.</p>
      ) : null}

      {sub === 'projection' && projection ? (
        <div className="space-y-4">
          <p className="text-xs text-amber-200/90">{projection.disclaimer}</p>
          <p className="text-[11px] text-zinc-500">{projection.assumptions}</p>
          <p className="text-[11px] text-zinc-500">
            Referencia no aplicada al cobro (30 días animado): {formatPromoCop(PROMO_ANIMATED_MONTHLY_REF)}. Precio de venta: $499.875 COP.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['dauShare', 'DAU / MAU', projection.params.dauShare],
                ['impressionsPerUserPerDayPerSlot', 'Impactos/día/espacio', projection.params.impressionsPerUserPerDayPerSlot],
                ['scenarioDays', 'Días escenario', projection.params.scenarioDays],
                ['slots', 'Espacios modelo', projection.params.slots],
                ['cpmUsd', 'CPM USD', projection.params.cpmUsd],
                ['occupancy', 'Ocupación', projection.params.occupancy],
                ['animatedUplift', 'Incremento animado', projection.params.animatedUplift],
                ['copPerUsd', 'COP / USD supuesto', projection.params.copPerUsd],
              ] as const
            ).map(([key, label, value]) => (
              <label key={key} className="grid gap-1 text-xs text-zinc-400">
                {label}
                <input
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) =>
                    setProjection((prev) =>
                      prev
                        ? { ...prev, params: { ...prev.params, [key]: Number(e.target.value) } }
                        : prev,
                    )
                  }
                  className="h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveParams()}
              className="min-h-11 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 text-sm font-bold text-zinc-950"
            >
              Guardar parámetros
            </button>
            <input
              value={customMau}
              onChange={(e) => setCustomMau(e.target.value)}
              className="h-11 w-32 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => void loadProjection(Number(customMau))}
              className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-white"
            >
              Proyectar MAU
            </button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-900 text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">MAU</th>
                  <th className="px-3 py-2">DAU est.</th>
                  <th className="px-3 py-2">Imp. / espacio</th>
                  <th className="px-3 py-2">Imp. totales</th>
                  <th className="px-3 py-2">Estático est.</th>
                  <th className="px-3 py-2">Animado est.</th>
                  <th className="px-3 py-2">Aviso</th>
                </tr>
              </thead>
              <tbody>
                {projection.rows.map((row) => (
                  <tr key={row.mau} className="border-t border-white/5">
                    <td className="px-3 py-2 font-semibold text-white">{row.mau.toLocaleString('es-CO')}</td>
                    <td className="px-3 py-2">{Math.round(row.dauEstimated).toLocaleString('es-CO')}</td>
                    <td className="px-3 py-2">{Math.round(row.impressionsPerSlot).toLocaleString('es-CO')}</td>
                    <td className="px-3 py-2">{Math.round(row.impressionsTotal).toLocaleString('es-CO')}</td>
                    <td className="px-3 py-2">{formatPromoCop(row.staticIncomeCopRounded)}</td>
                    <td className="px-3 py-2">{formatPromoCop(row.animatedIncomeCopRounded)}</td>
                    <td className="px-3 py-2 text-[10px] text-zinc-500">{row.guidance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
