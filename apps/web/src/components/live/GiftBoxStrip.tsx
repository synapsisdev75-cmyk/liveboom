import { Coins, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LiveGift } from '../../lib/liveboomGifts';
import { findLiveGift } from '../../lib/liveboomGifts';
import { GiftIcon } from './FloatingGift';
import {
  GiftSendConfirm,
  normalizeGiftMultiplier,
  type GiftMultiplier,
} from './GiftSendConfirm';

type Props = {
  gifts: LiveGift[];
  sendingGiftId?: string | null;
  /** Tras confirmar (nombre, coins, multiplicador). El 2.º arg es el multiplicador. */
  onSelect: (giftId: string, multiplier?: GiftMultiplier) => void;
  onClose: () => void;
  error?: string | null;
  coins?: number;
  rechargeNeeded?: number | null;
  onRecharge?: () => void;
  compact?: boolean;
  /** Dentro de GiftCatalogLayer: llena el panel y el grid hace scroll. */
  floating?: boolean;
  /** Abre directo en la tarjeta de confirmación (p. ej. regalos populares del LIVE). */
  preselectGiftId?: string | null;
  onCancelConfirm?: () => void;
};

export function GiftBoxStrip({
  gifts,
  sendingGiftId,
  onSelect,
  onClose,
  error,
  coins,
  rechargeNeeded,
  onRecharge,
  compact,
  floating,
  preselectGiftId,
  onCancelConfirm,
}: Props) {
  const [pendingId, setPendingId] = useState<string | null>(preselectGiftId ?? null);
  const [multiplier, setMultiplier] = useState<GiftMultiplier>(1);

  useEffect(() => {
    if (!preselectGiftId) return;
    setPendingId(preselectGiftId);
    setMultiplier(1);
  }, [preselectGiftId]);

  const pendingGift = pendingId
    ? findLiveGift(pendingId) ?? gifts.find((g) => g.id === pendingId) ?? null
    : null;

  function closeAll() {
    setPendingId(null);
    setMultiplier(1);
    onCancelConfirm?.();
    onClose();
  }

  function backToGrid() {
    setPendingId(null);
    setMultiplier(1);
    onCancelConfirm?.();
  }

  return (
    <div
      className={`gift-box-strip flex min-h-0 flex-col ${
        floating
          ? 'h-full border-0'
          : `shrink-0 border-t ${compact ? 'rounded-t-xl' : 'rounded-t-2xl'}`
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 py-1.5 sm:px-3">
        <p className="gift-box-strip__title inline-flex items-center gap-1.5 text-[11px] font-semibold">
          <Coins size={12} className="text-amber-400" />
          Regalos
          {typeof coins === 'number' ? (
            <span className="gift-box-strip__coins">{coins.toLocaleString('es-CO')}</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={closeAll}
          className="gift-box-strip__close grid h-11 w-11 place-items-center rounded-full"
          aria-label="Cerrar regalos"
        >
          <X size={16} />
        </button>
      </div>

      {pendingGift ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 sm:px-3">
          <GiftSendConfirm
            gift={pendingGift}
            coins={coins}
            multiplier={normalizeGiftMultiplier(multiplier)}
            sending={Boolean(sendingGiftId)}
            error={error}
            rechargeNeeded={rechargeNeeded}
            onMultiplierChange={setMultiplier}
            onCancel={backToGrid}
            onConfirm={() => {
              if (sendingGiftId) return;
              onSelect(pendingGift.id, multiplier);
            }}
            onRecharge={onRecharge}
          />
        </div>
      ) : (
        <>
          <p className="gift-box-strip__hint shrink-0 px-3 pb-1 text-[10px]">
            {compact
              ? 'Desliza o desplázate para ver todos los regalos'
              : 'Desplázate para ver todos los regalos'}
          </p>

          <div
            className={`min-h-0 gap-1.5 px-2.5 pt-0.5 sm:gap-2 sm:px-3 ${
              floating
                ? 'gift-catalog-scroll grid flex-1 grid-cols-4 content-start overflow-x-hidden overflow-y-auto overscroll-contain pb-2 touch-pan-y min-[420px]:grid-cols-5 sm:pb-3'
                : compact
                  ? 'gift-row gift-box-row chat-scroll grid max-h-[min(44dvh,22rem)] grid-cols-4 overflow-x-hidden overflow-y-auto pb-[max(0.65rem,env(safe-area-inset-bottom))] sm:grid-cols-5'
                  : 'gift-row gift-box-row chat-scroll flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden pb-[max(0.65rem,env(safe-area-inset-bottom))] sm:pb-3 lg:grid lg:max-h-[min(52dvh,26rem)] lg:grid-cols-4 lg:overflow-x-hidden lg:overflow-y-auto lg:snap-none xl:grid-cols-5'
            }`}
          >
            {gifts.map((gift) => {
              const busy = sendingGiftId === gift.id;
              return (
                <button
                  key={gift.id}
                  type="button"
                  disabled={Boolean(sendingGiftId)}
                  onClick={() => {
                    setMultiplier(1);
                    setPendingId(gift.id);
                  }}
                  className={`gift-box-item flex shrink-0 flex-col items-center justify-end rounded-xl border px-1 pb-1.5 pt-2 transition active:scale-95 disabled:opacity-50 ${
                    compact ? 'w-full snap-none' : 'w-[4.35rem] snap-start sm:w-[4.85rem]'
                  } ${busy ? 'is-busy' : ''}`}
                >
                  <GiftIcon giftId={gift.id} size={compact || floating ? 42 : 40} animated />
                  <span className="gift-box-item__name mt-1 w-full truncate px-0.5 text-center text-[8px] font-medium leading-tight">
                    {gift.name}
                  </span>
                  <span className="gift-box-item__coins mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold">
                    <Coins size={9} className="shrink-0" />
                    {gift.coins.toLocaleString('es-CO')}
                  </span>
                </button>
              );
            })}
          </div>

          {error ? <p className="gift-box-strip__error shrink-0 px-3 pb-2 text-[11px]">{error}</p> : null}
          {rechargeNeeded != null && typeof coins === 'number' && coins < rechargeNeeded && onRecharge ? (
            <button
              type="button"
              onClick={onRecharge}
              className="lb-gift-confirm__recharge mx-2.5 mb-2 min-h-11 w-[calc(100%-1.25rem)] shrink-0 rounded-lg py-1.5 text-xs font-bold sm:mx-3 sm:w-[calc(100%-1.5rem)]"
            >
              Recargar Coins
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
