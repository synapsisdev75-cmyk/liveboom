import { useEffect, useMemo, useState } from 'react';
import { estimateCallMinutes, spendingLimitOptions, type CallRateSnapshot } from '../../lib/callPricing';
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
  const limits = useMemo(() => spendingLimitOptions(rate), [rate]);
  const [maxBlasts, setMaxBlasts] = useState<number | null>(null);

  useEffect(() => {
    if (open) setMaxBlasts(null);
  }, [open, pricing?.giftId, pricing?.rateBlasts]);

  if (!open) return null;

  const enough = !pricing || balance >= rate;

  return (
    <div className="lb-call-confirm-backdrop" role="dialog" aria-modal="true">
      <div className="lb-call-confirm">
        <p className="text-sm font-bold text-white">
          {video ? 'Videollamada' : 'Llamada de voz'} con @{handle}
        </p>
        {pricing && rate > 0 ? (
          <>
            <p className="mt-2 flex items-center gap-2 text-sm text-zinc-200">
              {pricing.giftImage ? (
                <img src={pricing.giftImage} alt="" className="h-8 w-8 object-contain" />
              ) : (
                <span>{pricing.giftEmoji}</span>
              )}
              {pricing.giftName} · {rate} Blasts/min
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Saldo actual: {balance.toLocaleString('es-CO')} Blasts
              {Number.isFinite(mins) ? ` · tiempo máx. aprox. ${mins} min` : ''}
            </p>
            <p className="mt-2 text-xs text-zinc-300">
              Cada bloque iniciado de 60 segundos consume {rate} Blasts.
            </p>
            {video ? (
              <div className="mt-3">
                <p className="text-xs text-zinc-500">Límite de gasto</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={`lb-video-limit${maxBlasts == null ? ' is-on' : ''}`}
                    onClick={() => setMaxBlasts(null)}
                  >
                    Sin límite
                  </button>
                  {limits.map((item) => (
                    <button
                      key={item.blasts}
                      type="button"
                      className={`lb-video-limit${maxBlasts === item.blasts ? ' is-on' : ''}`}
                      onClick={() => setMaxBlasts(item.blasts)}
                    >
                      {item.blocks} bloque{item.blocks === 1 ? '' : 's'}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
            <label className="mt-3 block text-xs text-zinc-500">
              Límite para esta llamada
              <select
                className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-zinc-950 text-sm text-white"
                value={maxBlasts ?? ''}
                onChange={(e) => setMaxBlasts(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Sin límite</option>
                {limits.map((item) => (
                  <option key={item.blasts} value={item.blasts}>
                    {item.blasts} Blasts ({item.blocks} min)
                  </option>
                ))}
              </select>
            </label>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-300">{video ? 'Videollamada gratuita' : 'Llamada gratuita'}</p>
        )}
        {!enough ? (
          <div className="mt-3">
            <p className="text-xs text-amber-300">
              Necesitas al menos {rate} Blasts para iniciar esta llamada.
            </p>
            <button type="button" className="mt-2 text-sm font-bold text-cyan-300" onClick={() => openRechargeCoins()}>
              Recargar Blasts
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
            {video ? 'Aceptar y llamar' : 'Aceptar y continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
