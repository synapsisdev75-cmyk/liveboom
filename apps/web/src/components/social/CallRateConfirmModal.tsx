import { useEffect, useState } from 'react';
import { estimateCallMinutes, type CallRateSnapshot } from '../../lib/callPricing';
import { openRechargeCoins } from '../../lib/giftsFirestore';

export function CallRateConfirmModal({
  open,
  handle,
  video,
  pricing,
  balance,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  handle: string;
  video: boolean;
  pricing: CallRateSnapshot | null;
  balance: number;
  onCancel: () => void;
  onConfirm: (maxBlasts: number | null) => void;
}) {
  const rate = pricing?.rateBlasts || 0;
  const mins = estimateCallMinutes(balance, rate);
  const [maxBlasts] = useState<number | null>(null);

  useEffect(() => {
    /* reset handled by parent open cycle */
  }, [open, pricing?.giftId, pricing?.rateBlasts]);

  if (!open) return null;

  const enough = !pricing || balance >= rate;
  const title =
    pricing?.callType === 'video_1080'
      ? 'Video Premium'
      : video
        ? 'Videollamada privada'
        : 'Llamada privada';

  return (
    <div className="lb-call-confirm-backdrop" role="dialog" aria-modal="true">
      <div className="lb-call-confirm">
        <p className="text-sm font-bold text-white">
          {title}
          {handle ? ` · @${handle}` : ''}
        </p>
        {pricing && rate > 0 ? (
          <>
            <p className="mt-2 text-sm text-zinc-200">{rate} Blast/min</p>
            <p className="mt-1 text-xs text-zinc-400">
              Saldo: {balance.toLocaleString('es-CO')} Blast
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Tiempo aproximado disponible:{' '}
              {Number.isFinite(mins) ? `${mins} minutos` : '—'}
            </p>
            <p className="mt-2 text-xs text-zinc-500">Usar Blast</p>
          </>
        ) : null}
        {!enough ? (
          <div className="mt-3">
            <p className="text-sm font-semibold text-amber-300">Saldo insuficiente</p>
            <p className="mt-1 text-xs text-amber-200/90">
              Necesitas Blast para iniciar esta llamada.
            </p>
            <button type="button" className="mt-2 text-sm font-bold text-cyan-300" onClick={() => openRechargeCoins()}>
              Recargar Blast
            </button>
          </div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="h-10 flex-1 rounded-xl border border-white/10 text-sm text-zinc-300" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!enough}
            className="h-10 flex-1 rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-40"
            onClick={() => onConfirm(maxBlasts)}
          >
            {video ? 'Videollamar' : 'Llamar'}
          </button>
        </div>
      </div>
    </div>
  );
}
