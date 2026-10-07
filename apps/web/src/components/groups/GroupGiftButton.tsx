import { Gift } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sendLiveboomGift, validateCoinsBalance } from '../../lib/giftsFirestore';
import type { GroupGift, GroupMember } from '../../lib/groupsFirestore';
import { findLiveGift, sortedPrivateGiftCatalog } from '../../lib/liveboomGifts';
import { addLevelXp } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';
import { useCatalogConfigStore } from '../../store/catalogConfigStore';
import { FloatingGift } from '../live/FloatingGift';
import { GiftBoxStrip } from '../live/GiftBoxStrip';
import { GiftCatalogLayer } from '../live/GiftCatalogLayer';
import type { GiftMultiplier } from '../live/GiftSendConfirm';
import { UserAvatar } from '../profile/UserAvatar';
import { CoinModal } from '../wallet/CoinModal';

type FloatItem = { id: string; giftId: string; left: number; senderName: string; combo: number };

type Props = {
  groupId: string;
  members: GroupMember[];
  buttonClassName: string;
  /** Publica el regalo en el chat del grupo (el cobro ya se hizo). */
  onSent: (gift: GroupGift, giftName: string) => Promise<void>;
};

/** Caja de regalos del chat del grupo: se elige a qué miembro va y se cobra como regalo privado. */
export function GroupGiftButton({ groupId, members, buttonClassName, onSent }: Props) {
  const profile = useAuthStore((state) => state.profile);
  const setCoins = useAuthStore((state) => state.setCoins);
  const coins = profile?.coinsBalance ?? 0;
  const giftsVersion = useCatalogConfigStore((state) => state.giftsVersion);
  const giftCatalog = useMemo(() => sortedPrivateGiftCatalog(), [giftsVersion]);

  const [open, setOpen] = useState(false);
  const [toUid, setToUid] = useState<string | null>(null);
  const [sendingGift, setSendingGift] = useState<string | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [rechargeNeeded, setRechargeNeeded] = useState<number | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const others = useMemo(
    () => members.filter((member) => member.uid && member.uid !== profile?.firebaseUid),
    [members, profile?.firebaseUid],
  );
  const recipient = others.find((member) => member.uid === toUid) ?? null;

  const close = useCallback(() => {
    setOpen(false);
    setGiftError(null);
    setRechargeNeeded(null);
  }, []);

  function toggle() {
    if (open) {
      close();
      return;
    }
    setToUid((current) =>
      others.some((member) => member.uid === current) ? current : others.length === 1 ? (others[0]?.uid ?? null) : null,
    );
    setGiftError(null);
    setRechargeNeeded(null);
    setOpen(true);
  }

  async function sendGift(giftId: string, multiplier: GiftMultiplier = 1) {
    if (sendingGift || !profile) return;
    if (!recipient) {
      setGiftError('Elige a quién le envías el regalo');
      return;
    }
    const catalog = findLiveGift(giftId);
    if (!catalog) {
      setGiftError('Regalo no válido');
      return;
    }
    const mult = ([1, 2, 4, 8] as const).includes(multiplier) ? multiplier : 1;
    const totalCoins = catalog.coins * mult;
    if (!validateCoinsBalance(coins, totalCoins)) {
      setGiftError('No tienes Blast suficientes');
      setRechargeNeeded(totalCoins);
      return;
    }
    setGiftError(null);
    setRechargeNeeded(null);
    setSendingGift(giftId);
    const senderName = profile.displayName || profile.handle || 'Liveboomer';
    try {
      const result = await sendLiveboomGift({
        giftId: catalog.id,
        senderUid: profile.firebaseUid,
        senderName,
        senderBalance: coins,
        recipientUsername: recipient.username,
        recipientUid: recipient.uid,
        clientId: `group-${groupId}-${Date.now()}`,
        roomName: `chat:${recipient.username || recipient.uid}`,
        multiplier: mult,
      });
      setCoins(result.senderBalance);
      void addLevelXp(profile.firebaseUid, totalCoins).catch(() => undefined);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setFloats((current) => [
        ...current.slice(-2),
        { id, giftId: catalog.id, left: 22 + Math.random() * 56, senderName, combo: mult },
      ]);
      setOpen(false);
      void onSent(
        { giftId: catalog.id, toUid: recipient.uid, toUsername: recipient.username, multiplier: mult },
        catalog.name,
      ).catch(() => undefined);
    } catch (error) {
      setGiftError(error instanceof Error ? error.message : 'No se pudo enviar el regalo');
    } finally {
      setSendingGift(null);
    }
  }

  const noOne = others.length === 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={noOne}
        onClick={toggle}
        className={`${buttonClassName} ${open ? 'text-amber-300' : 'text-amber-300/90'} disabled:opacity-40`}
        aria-label="Regalos"
        title={noOne ? 'Aún no hay otros miembros a quien regalar' : 'Enviar regalo'}
      >
        <Gift size={18} />
      </button>

      {open ? (
        <GiftCatalogLayer open={open} triggerRef={triggerRef} onClose={close}>
          <div className="shrink-0 border-b px-3 pb-2 pt-2.5" style={{ borderColor: 'var(--lb-line)' }}>
            <p className="mb-1.5 text-[11px] font-semibold" style={{ color: 'var(--lb-text-muted)' }}>
              {recipient ? `Para @${recipient.username}` : 'Elige a quién le envías el regalo'}
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {others.map((member) => {
                const selected = member.uid === toUid;
                return (
                  <button
                    key={member.uid}
                    type="button"
                    onClick={() => {
                      setToUid(member.uid);
                      setGiftError(null);
                    }}
                    aria-pressed={selected}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition ${
                      selected ? 'border-amber-400 bg-amber-400/15' : 'border-[var(--lb-line)] hover:bg-white/5'
                    }`}
                  >
                    <UserAvatar
                      src={member.avatarUrl}
                      uid={member.uid}
                      username={member.username}
                      displayName={member.displayName}
                      size="xs"
                    />
                    <span className="max-w-[8rem] truncate">@{member.username}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
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
              onClose={close}
            />
          </div>
        </GiftCatalogLayer>
      ) : null}

      {floats.length > 0 && typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[112] overflow-hidden">
              {floats.map((item) => (
                <FloatingGift
                  key={item.id}
                  giftId={item.giftId}
                  senderName={item.senderName}
                  left={item.left}
                  combo={item.combo}
                  lite
                  layoutContext="chat"
                  onComplete={() => setFloats((current) => current.filter((row) => row.id !== item.id))}
                />
              ))}
            </div>,
            document.body,
          )
        : null}

      {rechargeOpen && typeof document !== 'undefined'
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
