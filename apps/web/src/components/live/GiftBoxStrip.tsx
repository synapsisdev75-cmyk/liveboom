import { Coins, X } from 'lucide-react';
import { GiftIcon } from './FloatingGift';
import type { LiveGift } from '../../lib/liveboomGifts';

type Props = {
  gifts: LiveGift[];
  sendingGiftId?: string | null;
  onSelect: (giftId: string) => void;
  onClose: () => void;
  error?: string | null;
  coins?: number;
  rechargeNeeded?: number | null;
  onRecharge?: () => void;
  compact?: boolean;
  /** Dentro de GiftCatalogLayer: llena el panel y el grid hace scroll. */
  floating?: boolean;
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
}: Props) {
  return (
    <div
      className={`gift-box-strip flex min-h-0 flex-col bg-zinc-950/95 backdrop-blur-xl ${
        floating
          ? 'h-full border-0'
          : `shrink-0 border-t border-white/10 ${compact ? 'rounded-t-xl' : 'rounded-t-2xl'}`
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 py-1.5 sm:px-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
          <Coins size={12} className="text-amber-400" />
          Regalos
          {typeof coins === 'number' ? (
            <span className="text-amber-300">{coins.toLocaleString('es-CO')}</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="grid h-11 w-11 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          aria-label="Cerrar regalos"
        >
          <X size={16} />
        </button>
      </div>
      <p className="shrink-0 px-3 pb-1 text-[10px] text-zinc-500">
        {compact ? 'Desliza o desplázate para ver todos los regalos' : 'Desplázate para ver todos los regalos'}
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
              onClick={() => onSelect(gift.id)}
              className={`gift-box-item flex shrink-0 flex-col items-center justify-end rounded-xl border border-white/5 bg-zinc-900/90 px-1 pb-1.5 pt-2 transition active:scale-95 disabled:opacity-50 ${
                compact
                  ? 'w-full snap-none'
                  : 'w-[4.35rem] snap-start sm:w-[4.85rem]'
              } ${busy ? 'ring-2 ring-cyan-400/60' : 'hover:border-cyan-400/40 hover:bg-zinc-800'}`}
            >
              <GiftIcon giftId={gift.id} size={compact ? 30 : 36} />
              <span className="mt-1 w-full truncate px-0.5 text-center text-[8px] font-medium leading-tight text-zinc-400">
                {gift.name}
              </span>
              <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-400">
                <Coins size={9} className="shrink-0" />
                {gift.coins.toLocaleString('es-CO')}
              </span>
            </button>
          );
        })}
      </div>

      {error ? <p className="shrink-0 px-3 pb-2 text-[11px] text-fuchsia-400">{error}</p> : null}
      {rechargeNeeded != null && typeof coins === 'number' && coins < rechargeNeeded && onRecharge ? (
        <button
          type="button"
          onClick={onRecharge}
          className="mx-2.5 mb-2 min-h-11 w-[calc(100%-1.25rem)] shrink-0 rounded-lg bg-gradient-to-r from-fuchsia-500 to-cyan-400 py-1.5 text-xs font-bold text-zinc-950 sm:mx-3 sm:w-[calc(100%-1.5rem)]"
        >
          Recargar Coins
        </button>
      ) : null}
    </div>
  );
}
