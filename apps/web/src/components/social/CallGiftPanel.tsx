import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { openRechargeCoins, validateCoinsBalance } from '../../lib/giftsFirestore';
import { findLiveGift, sortedPrivateGiftCatalog } from '../../lib/liveboomGifts';
import { sendPrivateGiftToPeer } from '../../lib/privateGiftSend';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';
import { useCatalogConfigStore } from '../../store/catalogConfigStore';
import { GiftBoxStrip } from '../live/GiftBoxStrip';
import { GiftCatalogLayer } from '../live/GiftCatalogLayer';
import { FloatingGift } from '../live/FloatingGift';
import { CoinModal } from '../wallet/CoinModal';

/**
 * Catálogo de regalos de la llamada privada.
 * El botón Regalos de la sala dispara `liveboom:open-chat-gifts`.
 * Este host queda montado aunque la página /mensajes esté oculta.
 */
export function CallGiftPanel() {
  const profile = useAuthStore((state) => state.profile);
  const setCoins = useAuthStore((state) => state.setCoins);
  const status = useCallStore((state) => state.status);
  const peer = useCallStore((state) => state.peer);
  const chatId = useCallStore((state) => state.chatId);
  const giftsVersion = useCatalogConfigStore((state) => state.giftsVersion);
  const catalog = useMemo(() => sortedPrivateGiftCatalog(), [giftsVersion]);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [sendingGift, setSendingGift] = useState<string | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [rechargeNeeded, setRechargeNeeded] = useState<number | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [layoutContext, setLayoutContext] = useState<'llamadas_video' | 'llamadas_voz'>('llamadas_video');
  const [giftFloats, setGiftFloats] = useState<
    Array<{ id: string; giftId: string; left: number; senderName?: string; combo?: number }>
  >([]);
  const giftTriggerRef = useRef<HTMLButtonElement>(null);
  const inCall = status === 'active';

  useEffect(() => {
    function openGiftsFromCall(event: Event) {
      const call = useCallStore.getState();
      if (call.status !== 'active' || !call.peer) return;
      const detail = (event as CustomEvent<{ layoutContext?: string }>).detail;
      const ctx = detail?.layoutContext;
      setLayoutContext(
        ctx === 'llamadas_voz' ? 'llamadas_voz' : 'llamadas_video',
      );
      setGiftError(null);
      setRechargeNeeded(null);
      setGiftsOpen(true);
    }
    window.addEventListener('liveboom:open-chat-gifts', openGiftsFromCall);
    return () => window.removeEventListener('liveboom:open-chat-gifts', openGiftsFromCall);
  }, []);

  useEffect(() => {
    if (!inCall) {
      setGiftsOpen(false);
      setSendingGift(null);
      setGiftError(null);
    }
  }, [inCall]);

  async function sendGift(giftId: string, multiplier: 1 | 2 | 4 | 8 = 1) {
    if (sendingGift || !profile || !peer) return;
    const catalogGift = findLiveGift(giftId);
    if (!catalogGift) {
      setGiftError('Regalo no válido');
      return;
    }
    const totalCoins = catalogGift.coins * multiplier;
    const coins = profile.coinsBalance ?? 0;
    if (!validateCoinsBalance(coins, totalCoins)) {
      setGiftError('No tienes Coins suficientes');
      setRechargeNeeded(totalCoins);
      return;
    }
    setGiftError(null);
    setRechargeNeeded(null);
    setSendingGift(giftId);
    const senderName = profile.displayName || profile.handle || 'Liveboomer';
    try {
      const result = await sendPrivateGiftToPeer({
        giftId: catalogGift.id,
        sender: profile,
        peer,
        multiplier,
        clientId: `call-${chatId || peer.uid}-${Date.now()}`,
      });
      setCoins(result.senderBalance);
      setGiftFloats((current) => [
        ...current.slice(-1),
        {
          id: `gf-${Date.now()}`,
          giftId: catalogGift.id,
          left: 28 + Math.random() * 44,
          senderName,
          combo: multiplier,
        },
      ]);
      setGiftsOpen(false);
    } catch (err) {
      setGiftError(err instanceof Error ? err.message : 'No se pudo enviar el regalo');
      setGiftsOpen(true);
    } finally {
      setSendingGift(null);
    }
  }

  if (!inCall || !peer) return null;

  return (
    <>
      {/* Ancla invisible para el portal (el layout centra el panel). */}
      <button
        ref={giftTriggerRef}
        type="button"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none fixed bottom-4 right-4 h-px w-px opacity-0"
      />
      {giftsOpen ? (
        <GiftCatalogLayer open={giftsOpen} triggerRef={giftTriggerRef} onClose={() => setGiftsOpen(false)}>
          <GiftBoxStrip
            gifts={catalog}
            sendingGiftId={sendingGift}
            coins={profile?.coinsBalance}
            error={giftError}
            rechargeNeeded={rechargeNeeded}
            onRecharge={() => {
              setRechargeOpen(true);
              openRechargeCoins();
            }}
            compact
            floating
            onSelect={(id, multiplier) => void sendGift(id, multiplier ?? 1)}
            onClose={() => setGiftsOpen(false)}
          />
        </GiftCatalogLayer>
      ) : null}
      {giftFloats.length > 0 && typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[160] overflow-visible">
              {giftFloats.map((item) => (
                <FloatingGift
                  key={item.id}
                  giftId={item.giftId}
                  senderName={item.senderName}
                  left={item.left}
                  combo={item.combo}
                  layoutContext={layoutContext}
                  onComplete={() =>
                    setGiftFloats((current) => current.filter((row) => row.id !== item.id))
                  }
                />
              ))}
            </div>,
            document.body,
          )
        : null}
      {rechargeOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-auto fixed inset-0 z-[170]">
              <CoinModal onClose={() => setRechargeOpen(false)} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
