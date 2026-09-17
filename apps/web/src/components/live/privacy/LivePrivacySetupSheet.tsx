import { X } from 'lucide-react';
import { GiftIcon } from '../FloatingGift';
import { findLiveGift, sortedLiveGiftCatalog } from '../../../lib/liveboomGifts';

export const PRIVACY_DELAY_OPTIONS = [
  { id: 'now', label: 'Ahora', ms: 0 },
  { id: '30s', label: '30 segundos', ms: 30_000 },
  { id: '1m', label: '1 minuto', ms: 60_000 },
  { id: '3m', label: '3 minutos', ms: 180_000 },
  { id: '5m', label: '5 minutos', ms: 300_000 },
] as const;

type Props = {
  open: boolean;
  busy?: boolean;
  draftIds: string[];
  draftQty: Record<string, number>;
  delayId: string;
  customSeconds: string;
  maxGifts?: number;
  privateActive?: boolean;
  onClose: () => void;
  onToggleGift: (giftId: string) => void;
  onSetQty: (giftId: string, qty: number) => void;
  onDelayId: (id: string) => void;
  onCustomSeconds: (value: string) => void;
  onConfirm: () => void;
  onClearPrivate?: () => void;
};

export function LivePrivacySetupSheet({
  open,
  busy,
  draftIds,
  draftQty,
  delayId,
  customSeconds,
  maxGifts = 5,
  privateActive,
  onClose,
  onToggleGift,
  onSetQty,
  onDelayId,
  onCustomSeconds,
  onConfirm,
  onClearPrivate,
}: Props) {
  if (!open) return null;
  const total = draftIds.reduce(
    (sum, id) => sum + (findLiveGift(id)?.coins || 0) * (draftQty[id] || 1),
    0,
  );

  return (
    <div className="lb-live-privacy-setup" role="dialog" aria-modal="true">
      <div className="lb-live-privacy-setup__backdrop" onClick={onClose} aria-hidden />
      <div className="lb-live-privacy-setup__panel">
        <div className="lb-live-privacy-setup__head">
          <p className="lb-live-privacy-setup__title">Candado · LIVE privado</p>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <p className="lb-live-privacy-setup__hint">
          Elige regalos y cantidades. Quien los envíe entra solo; también puedes aceptar solicitudes.
        </p>
        <p className="lb-live-privacy-setup__section">1. Requisito de acceso (máx. {maxGifts})</p>
        <div className="lb-live-privacy-setup__gifts">
          {sortedLiveGiftCatalog().map((gift) => {
            const active = draftIds.includes(gift.id);
            const qty = active ? draftQty[gift.id] || 1 : 0;
            return (
              <div
                key={gift.id}
                className={`rounded-lg px-2 py-1.5 ${active ? 'bg-amber-500/20 text-amber-100' : 'text-white'}`}
              >
                <button
                  type="button"
                  onClick={() => onToggleGift(gift.id)}
                  className="flex w-full min-w-0 items-center justify-between gap-2 text-left text-xs"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <GiftIcon giftId={gift.id} size={16} />
                    <span className="truncate">{gift.name}</span>
                  </span>
                  <span className="shrink-0 text-cyan-400">{gift.coins}</span>
                </button>
                {active ? (
                  <div className="lb-live-wish-qty mt-1.5">
                    <button type="button" aria-label="Menos" onClick={() => onSetQty(gift.id, qty - 1)}>
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={qty}
                      aria-label={`Cantidad de ${gift.name}`}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                        onSetQty(gift.id, digits ? Number(digits) : 0);
                      }}
                    />
                    <button type="button" aria-label="Más" onClick={() => onSetQty(gift.id, qty + 1)}>
                      +
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="lb-live-privacy-setup__section">
          2. ¿En cuánto tiempo quieres pasar el LIVE a privado?
        </p>
        <div className="lb-live-privacy-setup__delays">
          {PRIVACY_DELAY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`lb-live-privacy-setup__chip${delayId === opt.id ? ' is-on' : ''}`}
              onClick={() => onDelayId(opt.id)}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            className={`lb-live-privacy-setup__chip${delayId === 'custom' ? ' is-on' : ''}`}
            onClick={() => onDelayId('custom')}
          >
            Personalizado
          </button>
        </div>
        {delayId === 'custom' ? (
          <label className="lb-live-privacy-setup__custom">
            Segundos
            <input
              type="number"
              min={5}
              max={3600}
              value={customSeconds}
              onChange={(e) => onCustomSeconds(e.target.value)}
            />
          </label>
        ) : null}
        <button
          type="button"
          disabled={busy || draftIds.length === 0}
          onClick={onConfirm}
          className="lb-live-privacy-setup__confirm"
        >
          {busy
            ? 'Aplicando…'
            : delayId === 'now' || (delayId === 'custom' && Number(customSeconds) <= 0)
              ? `Activar candado (${total.toLocaleString('es-CO')} coins)`
              : `Programar privado (${total.toLocaleString('es-CO')} coins)`}
        </button>
        {privateActive && onClearPrivate ? (
          <button
            type="button"
            disabled={busy}
            onClick={onClearPrivate}
            className="lb-live-privacy-setup__clear"
          >
            Quitar candado y reabrir al público
          </button>
        ) : null}
      </div>
    </div>
  );
}
