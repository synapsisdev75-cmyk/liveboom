import { Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  acceptCallRequest,
  listenIncomingCallRequests,
  rejectCallRequest,
  type CallRequestDoc,
} from '../../lib/callSettingsFirestore';
import { useAuthStore } from '../../store/authStore';
import { VideoCallRequestReceived } from './VideoCallPanels';

export function CallRequestInbox() {
  const profile = useAuthStore((s) => s.profile);
  const [requests, setRequests] = useState<CallRequestDoc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenIncomingCallRequests(profile.firebaseUid, setRequests);
  }, [profile?.firebaseUid]);

  const first = requests[0];
  if (!profile || !first) return null;

  if (first.callType === 'video') {
    return (
      <VideoCallRequestReceived
        name={first.callerName}
        handle={first.callerHandle}
        avatar={first.callerAvatar}
        uid={first.callerId}
        rateBlasts={first.rateBlasts}
        giftId={first.giftId}
        giftName={first.giftName}
        giftEmoji={first.giftEmoji}
        busy={busy === first.id}
        onReject={() => {
          setBusy(first.id);
          void rejectCallRequest(profile.firebaseUid, first).finally(() => setBusy(null));
        }}
        onAccept={() => {
          setBusy(first.id);
          void acceptCallRequest(profile.firebaseUid, first).finally(() => setBusy(null));
        }}
      />
    );
  }

  return (
    <div className="lb-call-confirm-backdrop">
      <article className="lb-call-request-card">
        <p className="text-sm font-bold text-white">@{first.callerHandle} quiere hablar contigo</p>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-300">
          <Phone size={14} />
          Voz
        </p>
        {first.rateBlasts > 0 ? (
          <p className="mt-2 text-sm text-zinc-200">
            {first.giftEmoji} {first.giftName} · {first.rateBlasts} Blasts/min
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-200">Llamada gratuita</p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy === first.id}
            className="h-10 flex-1 rounded-xl border border-white/10 text-sm text-zinc-300"
            onClick={() => {
              setBusy(first.id);
              void rejectCallRequest(profile.firebaseUid, first).finally(() => setBusy(null));
            }}
          >
            Rechazar
          </button>
          <button
            type="button"
            disabled={busy === first.id}
            className="h-10 flex-1 rounded-xl bg-violet-600 text-sm font-bold text-white"
            onClick={() => {
              setBusy(first.id);
              void acceptCallRequest(profile.firebaseUid, first).finally(() => setBusy(null));
            }}
          >
            Aceptar
          </button>
        </div>
      </article>
    </div>
  );
}
