import { Gift } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { findLiveGift, sortedLiveboomGiftCatalog } from '../../lib/liveboomGifts';
import { sendLiveboomGift } from '../../lib/giftsFirestore';
import { addLevelXp } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';
import { FloatingGift } from '../live/FloatingGift';
import { GiftBoxStrip } from '../live/GiftBoxStrip';
import { GiftCatalogLayer } from '../live/GiftCatalogLayer';
import type { GiftMultiplier } from '../live/GiftSendConfirm';
import { CoinModal } from '../wallet/CoinModal';
import { useT } from '../../i18n';
import type { GiftLayoutVariantId } from '../../lib/giftLayout';

type FloatItem = { id: string; giftId: string; left: number; senderName?: string };

type Props = {
  authorUsername: string;
  authorUid?: string;
  postId: string;
  /** Fila compacta del feed (sin etiqueta debajo). */
  inline?: boolean;
  /** Flash Boom / Boom Clip: el visor congela la barra de tiempo. */
  onOpenChange?: (open: boolean) => void;
  /** Variante de colocación del regalo (Publicaciones / Clip / Flash). */
  layoutContext?: GiftLayoutVariantId;
};

export function ReelGiftControls({
  authorUsername,
  authorUid,
  postId,
  inline = false,
  onOpenChange,
  layoutContext = 'publicaciones',
}: Props) {
  const t = useT();
  const profile = useAuthStore((state) => state.profile);
  const setCoins = useAuthStore((state) => state.setCoins);
  const coins = profile?.coinsBalance ?? 0;

  const [openGifts, setOpenGifts] = useState(false);
  const [sendingGift, setSendingGift] = useState<string | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [rechargeNeeded, setRechargeNeeded] = useState<number | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const giftCatalog = useMemo(() => sortedLiveboomGiftCatalog(), []);

  const isSelf =
    Boolean(profile?.firebaseUid && authorUid && profile.firebaseUid === authorUid);

  useEffect(() => {
    setOpenGifts(false);
    setGiftError(null);
    setRechargeNeeded(null);
  }, [postId]);

  useEffect(() => {
    onOpenChange?.(openGifts || rechargeOpen);
  }, [openGifts, rechargeOpen, onOpenChange]);

  useEffect(() => {
    return () => onOpenChange?.(false);
    // Solo al desmontar el control de regalos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeGifts = useCallback(() => {
    setOpenGifts(false);
    setGiftError(null);
    setRechargeNeeded(null);
  }, []);

  function pushFloat(giftId: string, senderName: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const left = 22 + Math.random() * 56;
    setFloats((current) => [...current.slice(-2), { id, giftId, left, senderName }]);
  }

  async function sendGift(giftId: string, multiplier: GiftMultiplier = 1) {
    if (sendingGift || isSelf) return;
    const catalog = findLiveGift(giftId);
    if (!catalog || !profile) {
      setGiftError('Inicia sesión para enviar regalos');
      return;
    }
    const mult = [1, 2, 4, 8].includes(multiplier) ? multiplier : 1;
    const totalCoins = catalog.coins * mult;
    if (coins < totalCoins) {
      setGiftError('No tienes Coins suficientes');
      setRechargeNeeded(totalCoins);
      return;
    }

    setGiftError(null);
    setRechargeNeeded(null);
    setSendingGift(giftId);
    const clientId = `reel-${postId}-${Date.now()}`;
    const senderName = profile.displayName || profile.handle || 'Liveboomer';

    try {
      const result = await sendLiveboomGift({
        giftId: catalog.id,
        senderUid: profile.firebaseUid,
        senderName,
        senderBalance: coins,
        recipientUsername: authorUsername,
        recipientUid: authorUid,
        clientId,
        postId,
        multiplier: mult,
      });
      setCoins(result.senderBalance);
      void addLevelXp(profile.firebaseUid, totalCoins).catch(() => undefined);
      pushFloat(catalog.id, senderName);
      setOpenGifts(false);
    } catch (error) {
      setGiftError(error instanceof Error ? error.message : t('live.giftFailed'));
      setOpenGifts(true);
    } finally {
      setSendingGift(null);
    }
  }

  if (isSelf) return null;

  return (
    <>
      <div className={`relative flex items-center ${inline ? 'gap-0' : 'flex-col gap-1'}`}>
        <button
          ref={triggerRef}
          type="button"
          disabled={isSelf}
          onClick={(event) => {
            event.stopPropagation();
            if (isSelf) return;
            setOpenGifts((value) => !value);
            setGiftError(null);
            setRechargeNeeded(null);
          }}
          className={
            inline
              ? `lb-gift-action inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition disabled:opacity-45 ${
                  openGifts ? 'bg-white/10 text-amber-200' : 'text-amber-200 hover:bg-white/5'
                }`
              : `grid h-12 w-12 place-items-center rounded-full shadow-lg backdrop-blur-sm transition disabled:opacity-45 ${
                  openGifts
                    ? 'bg-gradient-to-br from-amber-400 to-fuchsia-500 text-zinc-950'
                    : 'bg-black/55 text-amber-300'
                }`
          }
          aria-label={t('actions.gift')}
          title={isSelf ? t('actions.noSelfGift') : t('actions.sendGift')}
        >
          <Gift size={inline ? 15 : 20} />
          {inline ? t('actions.gift') : null}
        </button>
        {!inline ? (
          <span className="text-[11px] font-bold text-white drop-shadow">{t('actions.gift')}</span>
        ) : null}
      </div>

      {floats.length > 0 && typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[112] overflow-hidden">
              {floats.map((item) => (
                <FloatingGift
                  key={item.id}
                  giftId={item.giftId}
                  senderName={item.senderName}
                  left={item.left}
                  lite
                  layoutContext={layoutContext}
                  onComplete={() => setFloats((current) => current.filter((f) => f.id !== item.id))}
                />
              ))}
            </div>,
            document.body,
          )
        : null}

      {openGifts ? (
        <GiftCatalogLayer open={openGifts} triggerRef={triggerRef} onClose={closeGifts}>
          <GiftBoxStrip
            gifts={giftCatalog}
            sendingGiftId={sendingGift}
            coins={coins}
            error={giftError}
            rechargeNeeded={rechargeNeeded}
            onRecharge={() => setRechargeOpen(true)}
            compact
            floating
            onSelect={(id, multiplier) => void sendGift(id, multiplier ?? 1)}
            onClose={closeGifts}
          />
        </GiftCatalogLayer>
      ) : null}

      {rechargeOpen
        ? createPortal(
            <div className="pointer-events-auto fixed inset-0 z-[124]">
              <CoinModal onClose={() => setRechargeOpen(false)} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
