import { useEffect, useRef, useState } from 'react';
import { openRechargeCoins } from '../../lib/giftsFirestore';
import { processCallGiftPayment } from '../../lib/callSettingsFirestore';
import { listenConversations } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';
import { VideoCallLowBalance, VideoCallNoBalance } from './VideoCallPanels';

export function PaidCallMeter() {
  const profile = useAuthStore((s) => s.profile);
  const setCoins = useAuthStore((s) => s.setCoins);
  const status = useCallStore((s) => s.status);
  const chatId = useCallStore((s) => s.chatId);
  const callId = useCallStore((s) => s.callId);
  const hangup = useCallStore((s) => s.hangup);
  const setCallBilling = useCallStore((s) => s.setCallBilling);
  const video = useCallStore((s) => s.video);
  const startedAt = useCallStore((s) => s.activeStartedAt);
  const [spent, setSpent] = useState(0);
  const [rate, setRate] = useState(0);
  const [giftId, setGiftId] = useState('');
  const [giftName, setGiftName] = useState('');
  const [payer, setPayer] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [maxBlasts, setMaxBlasts] = useState<number | null>(null);
  const [low, setLow] = useState(false);
  const [grace, setGrace] = useState(false);
  const [graceLeft, setGraceLeft] = useState(10);
  const lastBlock = useRef(-1);
  const charging = useRef(false);
  const spentRef = useRef(0);
  const maxRef = useRef<number | null>(null);

  useEffect(() => {
    spentRef.current = spent;
  }, [spent]);
  useEffect(() => {
    maxRef.current = maxBlasts;
  }, [maxBlasts]);

  useEffect(() => {
    if (!profile?.firebaseUid || !chatId) return;
    return listenConversations(profile.firebaseUid, (list) => {
      const mine = list.find((item) => item.chatId === chatId);
      const snap = mine?.call?.rateSnapshot;
      setRate(snap?.rateBlasts || 0);
      setGiftId(snap?.giftId || '');
      setGiftName(snap?.giftName || '');
      setSpent(mine?.call?.spentBlasts || 0);
      setPayer(mine?.call?.payerUid || mine?.call?.fromUid || null);
      setCreatorId(mine?.call?.toUid || null);
      setMaxBlasts(mine?.call?.maxBlasts ?? null);
      const already = Math.max(0, mine?.call?.blocksCharged || 0);
      if (already > 0) lastBlock.current = Math.max(lastBlock.current, already - 1);
      setCallBilling({
        rateBlasts: mine?.call?.rateSnapshot?.rateBlasts || 0,
        spentBlasts: mine?.call?.spentBlasts || 0,
        blocksCharged: already,
        giftName: mine?.call?.rateSnapshot?.giftName || '',
        payerUid: mine?.call?.payerUid || mine?.call?.fromUid || null,
      });
    });
  }, [profile?.firebaseUid, chatId, setCallBilling]);

  useEffect(() => {
    if (status !== 'active') {
      lastBlock.current = -1;
      setGrace(false);
      setLow(false);
    }
  }, [status]);

  useEffect(() => {
    if (!grace) {
      setGraceLeft(10);
      return;
    }
    setGraceLeft(10);
    const id = window.setInterval(() => {
      setGraceLeft((n) => Math.max(0, n - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [grace]);

  useEffect(() => {
    if (status !== 'active' || !profile || !chatId || !callId) return;
    if (!rate || !giftId) return;
    if (payer !== profile.firebaseUid || !creatorId) return;

    const payerId = profile.firebaseUid;
    const payerName = profile.displayName || profile.handle;
    const activeChatId = String(chatId);
    const activeCallId = String(callId);
    const activeCreatorId = String(creatorId);
    const activeGiftId = String(giftId);
    const origin = startedAt || Date.now();

    async function charge(block: number) {
      if (charging.current || block < 0 || block <= lastBlock.current) return;
      const cap = maxRef.current;
      if (cap != null && spentRef.current + rate > cap) {
        void hangup();
        return;
      }
      const balance = useAuthStore.getState().profile?.coinsBalance ?? 0;
      if (balance < rate * 2 && balance >= rate) setLow(true);
      if (balance < rate) {
        setGrace(true);
        window.setTimeout(() => {
          const nextBal = useAuthStore.getState().profile?.coinsBalance ?? 0;
          if (nextBal < rate) void hangup();
          else setGrace(false);
        }, 10_000);
        return;
      }
      charging.current = true;
      try {
        const result = await processCallGiftPayment({
          callId: activeCallId,
          chatId: activeChatId,
          payerId,
          payerName,
          creatorId: activeCreatorId,
          giftId: activeGiftId,
          rateBlasts: rate,
          minuteBlock: block,
        });
        lastBlock.current = Math.max(lastBlock.current, block);
        if (result.senderBalance >= 0) setCoins(result.senderBalance);
      } catch {
        setGrace(true);
        window.setTimeout(() => {
          const nextBal = useAuthStore.getState().profile?.coinsBalance ?? 0;
          if (nextBal < rate) void hangup();
          else setGrace(false);
        }, 10_000);
      } finally {
        charging.current = false;
      }
    }

    async function syncBlocks() {
      const elapsed = Math.max(0, Date.now() - origin);
      const current = Math.floor(elapsed / 60_000);
      for (let block = 0; block <= current; block += 1) {
        await charge(block);
      }
    }

    void syncBlocks();
    const id = window.setInterval(() => {
      void syncBlocks();
    }, 2_000);
    return () => window.clearInterval(id);
  }, [status, profile, chatId, callId, rate, giftId, payer, creatorId, hangup, setCoins, startedAt]);

  if (status !== 'active' || rate <= 0) return null;
  const iAmPayer = profile?.firebaseUid === payer;
  const balance = profile?.coinsBalance ?? 0;
  if (video) {
    return (
      <>
        <div className="lb-video-bill">
          <span>{rate} Blasts/min</span>
          <span>
            {iAmPayer ? 'Gastado' : 'Recibido'}: {spent} Blasts
          </span>
        </div>
        {low && !grace && iAmPayer ? (
          <VideoCallLowBalance
            balance={balance}
            rate={rate}
            minutes={1}
            onContinue={() => setLow(false)}
          />
        ) : null}
        {grace && iAmPayer ? <VideoCallNoBalance seconds={graceLeft} /> : null}
      </>
    );
  }
  return (
    <p className="lb-call-bill">
      {iAmPayer ? '' : 'Llamada paga · '}
      {giftName} · {rate} Blasts/min · {iAmPayer ? 'Gastado' : 'Recibido'} {spent} Blasts
      {low ? ' · Te queda aproximadamente 1 minuto disponible con tu saldo actual.' : ''}
      {grace ? (
        <>
          {' '}
          <button type="button" className="font-bold text-cyan-300" onClick={() => openRechargeCoins()}>
            Recargar Blasts
          </button>
        </>
      ) : null}
    </p>
  );
}
