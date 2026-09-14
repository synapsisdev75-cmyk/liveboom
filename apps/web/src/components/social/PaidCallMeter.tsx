import { useEffect, useRef, useState } from 'react';
import { openRechargeCoins } from '../../lib/giftsFirestore';
import {
  startCallBilling,
  syncCallBilling,
} from '../../lib/callBillingApi';
import {
  blastPerMinute,
  estimateRemainingSeconds,
  normalizePlatformCallType,
  platformCallTypeForMedia,
} from '../../lib/callPricing';
import { listenConversations } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';
import { VideoCallLowBalance, VideoCallNoBalance } from './VideoCallPanels';

/**
 * Economía de llamada: el frontend solo dispara sync/finalización.
 * El backend calcula duración, tarifa, delta e idempotencia.
 */
export function PaidCallMeter() {
  const profile = useAuthStore((s) => s.profile);
  const setCoins = useAuthStore((s) => s.setCoins);
  const status = useCallStore((s) => s.status);
  const chatId = useCallStore((s) => s.chatId);
  const callId = useCallStore((s) => s.callId);
  const peer = useCallStore((s) => s.peer);
  const hangup = useCallStore((s) => s.hangup);
  const setCallBilling = useCallStore((s) => s.setCallBilling);
  const video = useCallStore((s) => s.video);
  const startedAt = useCallStore((s) => s.activeStartedAt);
  const [spent, setSpent] = useState(0);
  const [rate, setRate] = useState(0);
  const [payer, setPayer] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [callType, setCallType] = useState(platformCallTypeForMedia(video));
  const [low, setLow] = useState(false);
  const [grace, setGrace] = useState(false);
  const [graceLeft, setGraceLeft] = useState(10);
  const [creatorCop, setCreatorCop] = useState(0);
  const syncing = useRef(false);
  const started = useRef(false);
  const exhausted = useRef(false);

  useEffect(() => {
    if (!profile?.firebaseUid || !chatId) return;
    return listenConversations(profile.firebaseUid, (list) => {
      const mine = list.find((item) => item.chatId === chatId);
      const snap = mine?.call?.rateSnapshot;
      const type = normalizePlatformCallType(
        snap?.callType || mine?.call?.billingCallType || (mine?.call?.video ? 'video_720' : 'voice'),
      );
      setCallType(type);
      setRate(snap?.rateBlasts || blastPerMinute(type));
      setSpent(mine?.call?.spentBlasts || mine?.call?.blastAlreadyCharged || 0);
      setPayer(mine?.call?.payerUid || mine?.call?.fromUid || null);
      setCreatorId(mine?.call?.toUid || mine?.call?.receiverId || null);
      setCreatorCop(Math.max(0, Math.floor(Number(mine?.call?.creatorValueCop) || 0)));
      setCallBilling({
        rateBlasts: snap?.rateBlasts || 0,
        spentBlasts: mine?.call?.spentBlasts || mine?.call?.blastAlreadyCharged || 0,
        blocksCharged: mine?.call?.blocksCharged || 0,
        giftName: snap?.giftName || '',
        payerUid: mine?.call?.payerUid || mine?.call?.fromUid || null,
        callType: type,
        creatorValueCop: Math.max(0, Math.floor(Number(mine?.call?.creatorValueCop) || 0)),
        connectedSeconds: Math.max(0, Math.floor(Number(mine?.call?.lastConnectedSeconds) || 0)),
      });
    });
  }, [profile?.firebaseUid, chatId, setCallBilling]);

  useEffect(() => {
    if (status !== 'active') {
      started.current = false;
      exhausted.current = false;
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
    if (!rate) return;
    if (payer !== profile.firebaseUid || !creatorId) return;

    const payerId = profile.firebaseUid;
    const activeChatId = String(chatId);
    const activeCallId = String(callId);
    const activeCreatorId = String(creatorId);
    const activeType = callType;
    const origin = startedAt || Date.now();

    function connectedSecondsNow() {
      return Math.max(0, Math.floor((Date.now() - origin) / 1000));
    }

    async function ensureStarted() {
      if (started.current) return;
      const session = await startCallBilling({
        callId: activeCallId,
        chatId: activeChatId,
        receiverId: activeCreatorId,
        video: Boolean(video),
        callType: activeType,
      });
      started.current = true;
      if (session.callerBalance >= 0) setCoins(session.callerBalance);
      setSpent(session.blastAlreadyCharged || 0);
      setCallBilling({
        rateBlasts: session.rateBlasts,
        spentBlasts: session.blastAlreadyCharged,
        blocksCharged: 0,
        giftName: session.pricingLabel || '',
        payerUid: payerId,
        callType: normalizePlatformCallType(session.callType),
        creatorValueCop: session.creatorValueCop || 0,
        connectedSeconds: session.connectedSeconds || 0,
      });
    }

    async function tick() {
      if (syncing.current || exhausted.current) return;
      syncing.current = true;
      try {
        await ensureStarted();
        const seconds = connectedSecondsNow();
        const result = await syncCallBilling({
          callId: activeCallId,
          connectedSeconds: seconds,
        });
        if (result.callerBalance >= 0) setCoins(result.callerBalance);
        setSpent(result.blastAlreadyCharged || 0);
        setCreatorCop(result.creatorValueCop || 0);
        setCallBilling({
          rateBlasts: result.rateBlasts,
          spentBlasts: result.blastAlreadyCharged,
          blocksCharged: 0,
          giftName: result.pricingLabel || '',
          payerUid: payerId,
          callType: normalizePlatformCallType(result.callType),
          creatorValueCop: result.creatorValueCop || 0,
          connectedSeconds: result.connectedSeconds || seconds,
        });
        const rem =
          result.estimatedRemainingSeconds ??
          estimateRemainingSeconds(result.callerBalance, result.callType);
        if (Number.isFinite(rem) && rem <= 120 && rem > 0) setLow(true);
        else setLow(false);

        if (result.shouldEnd || result.insufficient || result.exhausted) {
          exhausted.current = true;
          setGrace(true);
          window.setTimeout(() => {
            void hangup();
          }, 1_200);
        }
      } catch {
        const bal = useAuthStore.getState().profile?.coinsBalance ?? 0;
        if (bal < rate) {
          setGrace(true);
          window.setTimeout(() => {
            const nextBal = useAuthStore.getState().profile?.coinsBalance ?? 0;
            if (nextBal < rate) void hangup();
            else setGrace(false);
          }, 10_000);
        }
      } finally {
        syncing.current = false;
      }
    }

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 5_000);

    const onVis = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      // No llamar stop aquí: un re-render no debe cerrar el ledger.
      // hangup() finaliza el billing de forma explícita.
    };
  }, [
    status,
    profile,
    chatId,
    callId,
    rate,
    payer,
    creatorId,
    callType,
    hangup,
    setCoins,
    startedAt,
    video,
    setCallBilling,
    peer?.uid,
  ]);

  if (status !== 'active' || rate <= 0) return null;
  const iAmPayer = profile?.firebaseUid === payer;
  const balance = profile?.coinsBalance ?? 0;
  if (video) {
    return (
      <>
        <div className="lb-video-bill">
          <span>
            Saldo: 🔥 {balance.toLocaleString('es-CO')} Blast · {rate}/min
          </span>
          <span>
            {iAmPayer ? 'Usados' : 'Generados'}: {spent} Blast
            {!iAmPayer && creatorCop > 0 ? ` · $${creatorCop.toLocaleString('es-CO')} COP` : ''}
          </span>
        </div>
        {low && !grace && iAmPayer ? (
          <VideoCallLowBalance
            balance={balance}
            rate={rate}
            minutes={2}
            onContinue={() => setLow(false)}
          />
        ) : null}
        {grace && iAmPayer ? <VideoCallNoBalance seconds={graceLeft} /> : null}
      </>
    );
  }
  return (
    <p className="lb-call-bill">
      Saldo: 🔥 {balance.toLocaleString('es-CO')} Blast · {rate}/min
      {iAmPayer ? ` · Usados ${spent}` : ` · Generados ${spent}`}
      {low && iAmPayer ? ' · Te quedan aproximadamente 2 min.' : ''}
      {low && iAmPayer ? (
        <>
          {' '}
          <button type="button" className="font-bold text-cyan-300" onClick={() => openRechargeCoins()}>
            Recargar
          </button>
        </>
      ) : null}
      {grace && iAmPayer ? (
        <>
          {' '}
          Tus Blast se agotaron.{' '}
          <button type="button" className="font-bold text-cyan-300" onClick={() => openRechargeCoins()}>
            Recargar Blast
          </button>
        </>
      ) : null}
    </p>
  );
}
