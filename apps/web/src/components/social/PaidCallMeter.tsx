import { useEffect, useRef, useState } from 'react';
import { openRechargeCoins } from '../../lib/giftsFirestore';
import {
  startCallBilling,
  syncCallBilling,
  type CallBillingSession,
} from '../../lib/callBillingApi';
import {
  blastPerMinute,
  estimateRemainingSeconds,
  normalizePlatformCallType,
  platformCallTypeForMedia,
} from '../../lib/callPricing';
import { listenChatCall, listenConversations } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';
import { VideoCallLowBalance, VideoCallNoBalance } from './VideoCallPanels';

/**
 * Economía de llamada: el frontend solo dispara sync/finalización.
 * El backend calcula duración, tarifa, delta e idempotencia.
 * Blast ganados no se gastan sin confirmación de sesión.
 */
export function PaidCallMeter() {
  const profile = useAuthStore((s) => s.profile);
  const setCoins = useAuthStore((s) => s.setCoins);
  const setBlastBalances = useAuthStore((s) => s.setBlastBalances);
  const status = useCallStore((s) => s.status);
  const chatId = useCallStore((s) => s.chatId);
  const callId = useCallStore((s) => s.callId);
  const peer = useCallStore((s) => s.peer);
  const hangup = useCallStore((s) => s.hangup);
  const setCallBilling = useCallStore((s) => s.setCallBilling);
  const video = useCallStore((s) => s.video);
  const startedAt = useCallStore((s) => s.activeStartedAt);
  const [rate, setRate] = useState(0);
  const [payer, setPayer] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [callType, setCallType] = useState(platformCallTypeForMedia(video));
  const [low, setLow] = useState(false);
  const [grace, setGrace] = useState(false);
  const [graceLeft, setGraceLeft] = useState(10);
  const [earnedPrompt, setEarnedPrompt] = useState(false);
  const syncing = useRef(false);
  const started = useRef(false);
  const exhausted = useRef(false);
  const allowEarnedRef = useRef(false);
  const pauseForEarnedRef = useRef(false);

  function applyCallerBalances(session: CallBillingSession) {
    if (
      session.purchasedBlastBalance != null ||
      session.earnedBlastBalance != null
    ) {
      setBlastBalances({
        purchasedBlastBalance: session.purchasedBlastBalance ?? 0,
        earnedBlastBalance: session.earnedBlastBalance ?? 0,
        coinsBalance: session.callerBalance,
      });
      return;
    }
    if (session.callerBalance >= 0) setCoins(session.callerBalance);
  }

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
      setPayer(mine?.call?.payerUid || mine?.call?.fromUid || null);
      setCreatorId(mine?.call?.toUid || mine?.call?.receiverId || null);
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

  // Fuente directa del chat: el receptor ve spentBlasts sin depender solo del listado de conversaciones.
  useEffect(() => {
    if (!chatId) return;
    return listenChatCall(chatId, (call) => {
      if (!call) return;
      const type = normalizePlatformCallType(
        call.rateSnapshot?.callType || call.billingCallType || (call.video ? 'video_720' : 'voice'),
      );
      const rateBlasts = call.rateSnapshot?.rateBlasts || blastPerMinute(type);
      setCallType(type);
      setRate(rateBlasts);
      setPayer(call.payerUid || call.fromUid || null);
      setCreatorId(call.toUid || call.receiverId || null);
      setCallBilling({
        rateBlasts,
        spentBlasts: call.spentBlasts || call.blastAlreadyCharged || 0,
        blocksCharged: call.blocksCharged || 0,
        giftName: call.rateSnapshot?.giftName || '',
        payerUid: call.payerUid || call.fromUid || null,
        callType: type,
        creatorValueCop: Math.max(0, Math.floor(Number(call.creatorValueCop) || 0)),
        connectedSeconds: Math.max(0, Math.floor(Number(call.lastConnectedSeconds) || 0)),
      });
    });
  }, [chatId, setCallBilling]);

  useEffect(() => {
    if (status !== 'active') {
      started.current = false;
      exhausted.current = false;
      allowEarnedRef.current = false;
      pauseForEarnedRef.current = false;
      setGrace(false);
      setLow(false);
      setEarnedPrompt(false);
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
        allowEarnedBlastForCall: allowEarnedRef.current,
      });
      started.current = true;
      applyCallerBalances(session);
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
      if (session.needsEarnedAuth) {
        pauseForEarnedRef.current = true;
        setEarnedPrompt(true);
      }
    }

    async function tick() {
      if (syncing.current || exhausted.current || pauseForEarnedRef.current) return;
      syncing.current = true;
      try {
        await ensureStarted();
        if (pauseForEarnedRef.current) return;
        const seconds = connectedSecondsNow();
        const result = await syncCallBilling({
          callId: activeCallId,
          connectedSeconds: seconds,
          allowEarnedBlastForCall: allowEarnedRef.current,
        });
        applyCallerBalances(result);
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

        if (result.needsEarnedAuth) {
          pauseForEarnedRef.current = true;
          setEarnedPrompt(true);
          return;
        }

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
    setBlastBalances,
    startedAt,
    video,
    setCallBilling,
    peer?.uid,
  ]);

  async function confirmUseEarned() {
    allowEarnedRef.current = true;
    pauseForEarnedRef.current = false;
    setEarnedPrompt(false);
    if (!callId || !startedAt) return;
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    try {
      const result = await syncCallBilling({
        callId: String(callId),
        connectedSeconds: seconds,
        allowEarnedBlastForCall: true,
      });
      applyCallerBalances(result);
      if (result.shouldEnd || result.insufficient || result.exhausted) {
        exhausted.current = true;
        setGrace(true);
        window.setTimeout(() => {
          void hangup();
        }, 1_200);
      }
    } catch {
      /* el siguiente tick reintenta */
    }
  }

  function declineUseEarned() {
    pauseForEarnedRef.current = false;
    setEarnedPrompt(false);
    exhausted.current = true;
    setGrace(true);
    window.setTimeout(() => {
      void hangup();
    }, 1_200);
  }

  if (status !== 'active' || rate <= 0) return null;
  const iAmPayer = profile?.firebaseUid === payer;
  const balance = profile?.coinsBalance ?? 0;
  const earned = profile?.earnedBlastBalance ?? 0;

  const earnedGate = earnedPrompt && iAmPayer ? (
    <div className="lb-call-earned-auth fixed inset-x-3 bottom-[max(5.5rem,calc(var(--lb-safe-bottom)+4.5rem))] z-[80] mx-auto max-w-md rounded-2xl border border-amber-400/40 bg-black/90 p-4 text-sm text-white shadow-xl backdrop-blur-md sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
      <p className="font-semibold text-amber-200">¿Usar Blast ganados?</p>
      <p className="mt-1.5 text-zinc-300">
        Se agotaron los comprados. Quedan {earned.toLocaleString('es-CO')} Blast ganados.
        Confirma para seguir la llamada con ellos (solo esta sesión).
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-amber-400 px-4 text-sm font-bold text-black"
          onClick={() => void confirmUseEarned()}
        >
          Usar ganados
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/20 px-4 text-sm font-semibold text-white"
          onClick={declineUseEarned}
        >
          Colgar
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-cyan-400/40 px-4 text-sm font-semibold text-cyan-300"
          onClick={() => openRechargeCoins()}
        >
          Recargar Blast
        </button>
      </div>
    </div>
  ) : null;

  if (video) {
    return (
      <>
        {earnedGate}
        {low && !grace && !earnedPrompt && iAmPayer ? (
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
    <>
      {earnedGate}
      {low && iAmPayer && !earnedPrompt ? (
        <p className="lb-call-bill">
          Te quedan aproximadamente 2 min.{' '}
          <button type="button" className="font-bold text-cyan-300" onClick={() => openRechargeCoins()}>
            Recargar
          </button>
        </p>
      ) : null}
      {grace && iAmPayer ? (
        <p className="lb-call-bill">
          Tus Blast se agotaron.{' '}
          <button type="button" className="font-bold text-cyan-300" onClick={() => openRechargeCoins()}>
            Recargar Blast
          </button>
        </p>
      ) : null}
    </>
  );
}
