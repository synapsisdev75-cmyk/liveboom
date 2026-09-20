import { Coins } from 'lucide-react';
import type { LiveGift } from '../../lib/liveboomGifts';
import { GiftIcon } from './FloatingGift';

export const GIFT_MULTIPLIERS = [1, 2, 4, 8] as const;
export type GiftMultiplier = (typeof GIFT_MULTIPLIERS)[number];

export function normalizeGiftMultiplier(value: unknown): GiftMultiplier {
  const n = Math.floor(Number(value) || 1);
  return (GIFT_MULTIPLIERS as readonly number[]).includes(n) ? (n as GiftMultiplier) : 1;
}

type Props = {
  gift: LiveGift;
  coins?: number;
  multiplier: GiftMultiplier;
  sending?: boolean;
  error?: string | null;
  rechargeNeeded?: number | null;
  onMultiplierChange: (multiplier: GiftMultiplier) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onRecharge?: () => void;
};

/** Confirmación compartida: nombre, coins, multiplicador 1/2/4/8, Cancelar, Enviar xN. */
export function GiftSendConfirm({
  gift,
  coins,
  multiplier,
  sending,
  error,
  rechargeNeeded,
  onMultiplierChange,
  onCancel,
  onConfirm,
  onRecharge,
}: Props) {
  const total = gift.coins * multiplier;
  const canAfford = typeof coins !== 'number' || coins >= total;
  const showRecharge =
    Boolean(onRecharge) &&
    typeof coins === 'number' &&
    rechargeNeeded != null &&
    coins < rechargeNeeded;

  return (
    <div className="lb-gift-confirm">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <GiftIcon giftId={gift.id} size={40} animated />
        <div className="min-w-0 flex-1">
          <p className="lb-gift-confirm__title">¿Enviar {gift.name}?</p>
          <p className="lb-gift-confirm__cost">
            <Coins size={12} className="inline shrink-0" />
            {total.toLocaleString('es-CO')} coins
            {multiplier > 1 ? (
              <span className="lb-gift-confirm__cost-hint">
                ({gift.coins.toLocaleString('es-CO')} ×{multiplier})
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <p className="lb-gift-confirm__label">Multiplicador</p>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {GIFT_MULTIPLIERS.map((m) => {
          const cost = gift.coins * m;
          const ok = typeof coins !== 'number' || coins >= cost;
          const active = multiplier === m;
          return (
            <button
              key={m}
              type="button"
              disabled={Boolean(sending)}
              onClick={() => onMultiplierChange(m)}
              className={`lb-gift-confirm__mult min-h-10 rounded-lg text-xs font-bold transition active:scale-95 disabled:opacity-60 ${
                active ? 'is-on' : ok ? '' : 'is-off'
              }`}
            >
              x{m}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          disabled={Boolean(sending)}
          onClick={onCancel}
          className="lb-gift-confirm__cancel min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={Boolean(sending) || !canAfford}
          onClick={onConfirm}
          className="lb-gift-confirm__send min-h-11 flex-[1.4] rounded-lg px-3 text-sm font-bold disabled:opacity-60"
        >
          {sending ? '…' : `Enviar x${multiplier}`}
        </button>
      </div>
      {error ? <p className="lb-gift-confirm__error mt-2 text-center text-xs">{error}</p> : null}
      {showRecharge ? (
        <button
          type="button"
          onClick={onRecharge}
          className="lb-gift-confirm__recharge mt-2 w-full min-h-11 rounded-lg text-sm font-bold"
        >
          Recargar Coins
        </button>
      ) : null}
    </div>
  );
}
