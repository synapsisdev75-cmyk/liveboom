import { Phone, PhoneOff, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CallBusySheet, type CallBusyKind } from './CallBusySheet';
import { CallRateConfirmModal } from './CallRateConfirmModal';
import { VideoCallRequestSheet, VideoCallWaitingSheet } from './VideoCallPanels';
import type { CallRateSnapshot } from '../../lib/callPricing';
import {
  cancelCallRequest,
  createCallRequest,
  getCallAccess,
  isFreeCallContact,
  listenCallRequest,
  listenCreatorCallSettings,
  type CallAccess,
  type CreatorCallSettings,
  DEFAULT_CALL_SETTINGS,
} from '../../lib/callSettingsFirestore';
import { assertCanStartCall, CallBusyError, claimOwnCallBusy, releaseOwnCallPresence } from '../../lib/callAvailability';
import { formatCallApiError, createCall, readCallBusyCode, releaseCallSession } from '../../lib/liveKitCallService';
import { ensureCallMediaPermission } from '../../lib/callMedia';
import { startPrivateCall, type FriendChip } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';

export function CallChatActions({
  chatId,
  peer,
  inThisCall,
  busy,
  callStatus,
  onBusy,
  onError,
  onStopCall,
}: {
  chatId: string | null;
  peer: FriendChip;
  inThisCall: boolean;
  busy: boolean;
  callStatus: string;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onStopCall: () => void;
}) {
  const profile = useAuthStore((s) => s.profile);
  const beginOutgoing = useCallStore((s) => s.beginOutgoing);
  const navigate = useNavigate();
  const coins = profile?.coinsBalance ?? 0;
  const [settings, setSettings] = useState<CreatorCallSettings>(DEFAULT_CALL_SETTINGS);
  const [free, setFree] = useState(false);
  const [voiceAccess, setVoiceAccess] = useState<CallAccess | null>(null);
  const [videoAccess, setVideoAccess] = useState<CallAccess | null>(null);
  const [confirm, setConfirm] = useState<{ video: boolean; pricing: CallRateSnapshot | null } | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{ id: string; video: boolean } | null>(null);
  const [authId, setAuthId] = useState<string | null>(null);
  const [askVideo, setAskVideo] = useState(false);
  const [busyNotice, setBusyNotice] = useState<{ kind: CallBusyKind; handle: string } | null>(null);

  function showBusy(error: unknown, asCreator: boolean) {
    const code = readCallBusyCode(error);
    if (!code) return false;
    const kind: CallBusyKind = code === 'USER_ALREADY_IN_CALL' ? 'self' : asCreator ? 'creator' : 'peer';
    setBusyNotice({ kind, handle: peer.username });
    onError(null);
    return true;
  }

  useEffect(() => {
    return listenCreatorCallSettings(peer.uid, setSettings);
  }, [peer.uid]);

  useEffect(() => {
    if (!profile) return;
    void isFreeCallContact(peer.uid, profile.firebaseUid, chatId).then(setFree);
  }, [peer.uid, profile?.firebaseUid, chatId]);

  useEffect(() => {
    if (!profile) return;
    void getCallAccess(profile.firebaseUid, peer.uid, 'audio', settings, free).then(setVoiceAccess);
    void getCallAccess(profile.firebaseUid, peer.uid, 'video', settings, free).then(setVideoAccess);
  }, [profile?.firebaseUid, peer.uid, settings, free]);

  useEffect(() => {
    if (!pendingRequest || !profile) return;
    return listenCallRequest(peer.uid, pendingRequest.id, (req) => {
      if (!req) return;
      if (req.status === 'rejected') {
        onError(
          pendingRequest.video
            ? 'El creador no está disponible para esta videollamada.'
            : 'El creador no está disponible para esta llamada.',
        );
        setPendingRequest(null);
      }
      if (req.status === 'cancelled') {
        setPendingRequest(null);
      }
      if (req.status === 'accepted' && req.authorizationId) {
        setAuthId(req.authorizationId);
        setPendingRequest(null);
        const pricing =
          req.rateBlasts > 0 && req.giftId
            ? {
                giftId: req.giftId,
                giftName: req.giftName || '',
                giftEmoji: req.giftEmoji || '',
                rateBlasts: req.rateBlasts,
              }
            : null;
        setConfirm({ video: req.callType === 'video', pricing });
      }
    }, chatId);
  }, [pendingRequest, peer.uid, profile, onError, chatId]);

  async function actuallyStart(video: boolean, pricing: CallRateSnapshot | null, maxBlasts: number | null) {
    if (!chatId || !profile) return;
    const localStatus = useCallStore.getState().status;
    onBusy(true);
    onError(null);
    if (video) console.info('[VIDEO CALL] start clicked');
    let startedCallId: string | null = null;
    try {
      await assertCanStartCall(profile.firebaseUid, peer.uid, {
        localInCall: localStatus !== 'idle' || useCallStore.getState().recovering,
        handle: peer.username,
      });
      if (localStatus === 'idle') {
        await releaseOwnCallPresence(profile.firebaseUid);
      }
      const session = await createCall(peer.uid, video ? 'video' : 'audio', {
        authorizationId: authId,
        giftId: pricing?.giftId || null,
        chatId,
      });
      startedCallId = session.callId;
      await claimOwnCallBusy(profile.firebaseUid, { callId: session.callId, chatId, peerUid: peer.uid });
      const denied = await ensureCallMediaPermission(video);
      if (denied) {
        await releaseOwnCallPresence(profile.firebaseUid, session.callId);
        await releaseCallSession(session.callId);
        onError(denied);
        return;
      }
      const callId = await startPrivateCall(
        chatId,
        {
          firebaseUid: profile.firebaseUid,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        peer,
        video,
        session.callId,
        { rateSnapshot: pricing, authorizationId: authId, maxBlasts },
      );
      await claimOwnCallBusy(profile.firebaseUid, { callId, chatId, peerUid: peer.uid });
      beginOutgoing({
        chatId,
        callId,
        peer,
        video,
        token: session.token,
        serverUrl: session.serverUrl,
      });
      setAuthId(null);
    } catch (err) {
      if (startedCallId) {
        await releaseOwnCallPresence(profile.firebaseUid, startedCallId);
        await releaseCallSession(startedCallId);
      } else {
        await releaseOwnCallPresence(profile.firebaseUid).catch(() => undefined);
      }
      if (!showBusy(err, false)) {
        onError(formatCallApiError(err, { handle: peer.username }));
      }
    } finally {
      onBusy(false);
    }
  }

  async function onCall(video: boolean) {
    if (video) console.info('[VIDEO CALL] start clicked');
    const access = video ? videoAccess : voiceAccess;
    if (!access || !profile) return;
    const asCreatorRequest = Boolean(access.canRequestCall && !access.canDirectCall);
    try {
      await assertCanStartCall(profile.firebaseUid, peer.uid, {
        localInCall: useCallStore.getState().status !== 'idle' || useCallStore.getState().recovering,
        handle: peer.username,
      });
    } catch (err) {
      if (showBusy(err, asCreatorRequest)) return;
      onError(formatCallApiError(err, { handle: peer.username }));
      return;
    }
    if (access.canRequestCall && !access.canDirectCall) {
      if (!chatId) {
        onError('Abre el chat para solicitar la llamada.');
        return;
      }
      try {
        const id = await createCallRequest(
          peer.uid,
          {
            uid: profile.firebaseUid,
            username: profile.handle,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
          video ? 'video' : 'audio',
          access.pricing,
          chatId,
        );
        setPendingRequest({ id, video });
        onError(null);
      } catch (err) {
        if (!showBusy(err, true)) {
          onError(err instanceof CallBusyError ? err.message : err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
        }
      }
      return;
    }
    if (!access.canDirectCall) {
      onError(video ? 'Las videollamadas están disponibles solo entre amigos.' : 'Las llamadas de voz solo están disponibles entre amigos.');
      return;
    }
    if (access.pricing && access.pricing.rateBlasts > 0) {
      setConfirm({ video, pricing: access.pricing });
      return;
    }
    await actuallyStart(video, null, null);
  }

  if (inThisCall) {
    return (
      <button
        type="button"
        onClick={onStopCall}
        className="inline-flex h-9 items-center gap-1 rounded-lg bg-red-500/20 px-2.5 text-xs font-bold text-red-300"
      >
        <PhoneOff size={14} /> Colgar
      </button>
    );
  }

  const showVideo = Boolean(videoAccess?.canDirectCall || videoAccess?.canRequestCall);
  const showVoice = Boolean(voiceAccess?.canDirectCall || voiceAccess?.canRequestCall);
  if (!showVideo && !showVoice) return null;

  const requestVideo = Boolean(videoAccess?.canRequestCall && !videoAccess.canDirectCall);
  const requestVoice = Boolean(voiceAccess?.canRequestCall && !voiceAccess.canDirectCall);
  const rateHint = videoAccess?.label || voiceAccess?.label || '';

  return (
    <>
      <div className="lb-call-header-actions">
        {showVideo && !requestVideo ? (
          <button
            type="button"
            disabled={busy || callStatus !== 'idle' || Boolean(pendingRequest)}
            onClick={() => void onCall(true)}
            className="lb-call-header-btn lb-call-header-btn--video"
            aria-label="Videollamada"
            title={videoAccess?.label || 'Videollamada'}
          >
            <Video size={16} />
          </button>
        ) : null}
        {requestVideo ? (
          <button
            type="button"
            disabled={busy || callStatus !== 'idle' || Boolean(pendingRequest)}
            onClick={() => setAskVideo(true)}
            className="lb-call-header-btn lb-call-header-btn--request"
            aria-label="Solicitar videollamada"
          >
            Solicitar videollamada
          </button>
        ) : null}
        {showVoice ? (
          <button
            type="button"
            disabled={busy || callStatus !== 'idle' || Boolean(pendingRequest)}
            onClick={() => void onCall(false)}
            className="lb-call-header-btn lb-call-header-btn--voice"
            aria-label={requestVoice ? 'Solicitar llamada' : 'Llamada'}
            title={voiceAccess?.label || 'Llamada'}
          >
            <Phone size={16} />
          </button>
        ) : null}
        {rateHint ? <span className="lb-call-rate-hint">{rateHint}</span> : null}
      </div>
      {askVideo ? (
        <VideoCallRequestSheet
          handle={peer.username}
          busy={busy}
          onCancel={() => setAskVideo(false)}
          onRequest={() => {
            setAskVideo(false);
            void onCall(true);
          }}
        />
      ) : null}
      {pendingRequest?.video ? (
        <VideoCallWaitingSheet
          person={{
            name: peer.displayName,
            handle: peer.username,
            avatar: peer.avatarUrl,
            uid: peer.uid,
          }}
          onCancel={() => {
            if (!chatId) return;
            void cancelCallRequest(peer.uid, { id: pendingRequest.id, chatId }).finally(() => setPendingRequest(null));
          }}
        />
      ) : pendingRequest ? (
        <p className="lb-call-request-wait">Solicitud enviada. Esperando al creador…</p>
      ) : null}
      <CallRateConfirmModal
        open={Boolean(confirm)}
        handle={peer.username}
        video={Boolean(confirm?.video)}
        pricing={confirm?.pricing || null}
        balance={coins}
        onCancel={() => setConfirm(null)}
        onConfirm={(maxBlasts) => {
          const next = confirm;
          setConfirm(null);
          if (next) void actuallyStart(next.video, next.pricing, maxBlasts);
        }}
      />
      {busyNotice ? (
        <CallBusySheet
          kind={busyNotice.kind}
          handle={busyNotice.handle}
          onDismiss={() => setBusyNotice(null)}
          onMessage={
            busyNotice.kind === 'self'
              ? undefined
              : () => {
                  setBusyNotice(null);
                  navigate(`/mensajes?con=${encodeURIComponent(busyNotice.handle)}`);
                }
          }
          onReturn={() => setBusyNotice(null)}
        />
      ) : null}
    </>
  );
}
