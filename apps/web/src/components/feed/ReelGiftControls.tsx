import { Gift } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { findLiveGift, sortedLiveboomGiftCatalog } from '../../lib/liveboomGifts';
import { sendLiveboomGift } from '../../lib/giftsFirestore';
import { addLevelXp, setFirestoreCoins } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';
import { FloatingGift } from '../live/FloatingGift';
import { GiftBoxStrip } from '../live/GiftBoxStrip';
import { CoinModal } from '../wallet/CoinModal';

type FloatItem = { id: string; giftId: string; left: number; senderName?: string };

type Props = {
  authorUsername: string;
  authorUid?: string;
  postId: string;
  /** Fila compacta del feed (sin etiqueta debajo). */
  inline?: boolean;
};

export function ReelGiftControls({ authorUsername, authorUid, postId, inline = false }: Props) {
  const profile = useAuthStore((state) => state.profile);
  const setCoins = useAuthStore((state) => state.setCoins);
  const coins = profile?.coinsBalance ?? 0;

  const [openGifts, setOpenGifts] = useState(false);
  const [sendingGift, setSendingGift] = useState<string | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [rechargeNeeded, setRechargeNeeded] = useState<number | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [floats, setFloats] = useState<FloatItem[]>([]);

  const giftCatalog = sortedLiveboomGiftCatalog();

  const isSelf =
    Boolean(profile?.firebaseUid && authorUid && profile.firebaseUid === authorUid);

  useEffect(() => {
    setOpenGifts(false);
    setGiftError(null);
    setRechargeNeeded(null);
  }, [postId]);

  function pushFloat(giftId: string, senderName: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const left = 22 + Math.random() * 56;
    setFloats((current) => [...current.slice(-2), { id, giftId, left, senderName }]);
  }

  async function sendGift(giftId: string) {
    if (sendingGift || isSelf) return;
    const catalog = findLiveGift(giftId);
    if (!catalog || !profile) {
      setGiftError('Inicia sesión para enviar regalos');
      return;
    }
    if (coins < catalog.coins) {
      setGiftError('Saldo insuficiente. Recarga coins para continuar.');
      setRechargeNeeded(catalog.coins);
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
      });
      setCoins(result.senderBalance);
      void setFirestoreCoins(profile.firebaseUid, result.senderBalance).catch(() => undefined);
      void addLevelXp(profile.firebaseUid, catalog.coins).catch(() => undefined);
      pushFloat(catalog.id, senderName);
      setOpenGifts(false);
    } catch (error) {
      setGiftError(error instanceof Error ? error.message : 'No se pudo enviar el regalo');
      setOpenGifts(true);
    } finally {
      setSendingGift(null);
    }
  }

  return (
    <>
      <div className={`relative flex items-center ${inline ? 'gap-0' : 'flex-col gap-1'}`}>
        <button
          type="button"
          disabled={isSelf}
          onClick={(event) => {
            event.stopPropagation();
            if (isSelf) return;
            setOpenGifts((value) => !value);
            setGiftError(null);
          }}
          className={`grid place-items-center rounded-full shadow-lg backdrop-blur-sm transition disabled:opacity-45 ${
            inline ? 'h-9 w-9' : 'h-12 w-12'
          } ${
            openGifts
              ? 'bg-gradient-to-br from-amber-400 to-fuchsia-500 text-zinc-950'
              : 'bg-black/55 text-amber-300'
          }`}
          aria-label="Regalos"
          title={isSelf ? 'No puedes enviarte regalos a ti mismo' : 'Enviar regalo'}
        >
          <Gift size={inline ? 16 : 20} />
        </button>
        {!inline ? (
          <span className="text-[11px] font-bold text-white drop-shadow">Regalar</span>
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
                  onComplete={() => setFloats((current) => current.filter((f) => f.id !== item.id))}
                />
              ))}
            </div>,
            document.body,
          )
        : null}

      {openGifts && typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[115]">
              <GiftBoxStrip
                gifts={giftCatalog}
                sendingGiftId={sendingGift}
                coins={coins}
                error={giftError}
                rechargeNeeded={rechargeNeeded}
                onRecharge={() => setRechargeOpen(true)}
                compact
                onSelect={(id) => void sendGift(id)}
                onClose={() => {
                  setOpenGifts(false);
                  setGiftError(null);
                  setRechargeNeeded(null);
                }}
              />
            </div>,
            document.body,
          )
        : null}

      {rechargeOpen
        ? createPortal(
            <div className="pointer-events-auto fixed inset-0 z-[120]">
              <CoinModal onClose={() => setRechargeOpen(false)} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
