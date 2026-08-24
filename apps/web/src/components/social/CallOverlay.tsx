import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useTracks, type TrackReference } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { playCallRing } from '../../lib/alertSound';
import { api } from '../../lib/api';
import {
  answerPrivateCall,
  beatPresence,
  callRoomName,
  listenConversations,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';

function CallStage({ video }: { video: boolean }) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const cameras = tracks.filter((track): track is TrackReference => Boolean(track.publication));
  return (
    <>
      <RoomAudioRenderer />
      {video ? (
        <div className="grid h-full min-h-[12rem] grid-cols-2 gap-1">
          {cameras.length === 0 ? (
            <p className="col-span-2 grid place-items-center text-xs text-zinc-400">Cámara…</p>
          ) : (
            cameras.map((track) => (
              <VideoTrack
                key={track.participant.identity}
                trackRef={track}
                className="h-full w-full object-cover"
              />
            ))
          )}
        </div>
      ) : null}
    </>
  );
}

export function CallOverlay() {
  const profile = useAuthStore((state) => state.profile);
  const status = useCallStore((state) => state.status);
  const peer = useCallStore((state) => state.peer);
  const video = useCallStore((state) => state.video);
  const token = useCallStore((state) => state.token);
  const serverUrl = useCallStore((state) => state.serverUrl);
  const incoming = useCallStore((state) => state.incoming);
  const setIncoming = useCallStore((state) => state.setIncoming);
  const beginIncomingAccepted = useCallStore((state) => state.beginIncomingAccepted);
  const markActive = useCallStore((state) => state.markActive);
  const hangup = useCallStore((state) => state.hangup);
  const cooldownRef = useRef<Record<string, number>>({});

  function hangupWithCooldown() {
    const store = useCallStore.getState();
    const id = store.chatId || store.incoming?.chatId;
    if (id) cooldownRef.current[id] = Date.now();
    void hangup();
  }

  useEffect(() => {
    if (!profile) return;
    void beatPresence(profile.firebaseUid);
    const timer = window.setInterval(() => {
      void beatPresence(profile.firebaseUid);
    }, 25_000);
    return () => window.clearInterval(timer);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile) return;
    return listenConversations(profile.firebaseUid, (list) => {
      const store = useCallStore.getState();
      if (store.chatId) {
        const mine = list.find((item) => item.chatId === store.chatId);
        if (mine?.call?.status === 'active' && store.status === 'ringing-out') {
          markActive();
        }
        if (mine && mine.call == null && (store.status === 'ringing-out' || store.status === 'active')) {
          void hangup();
          return;
        }
      }
      if (store.status === 'active' || store.status === 'ringing-out') return;

      const ringing = list
        .filter((item) => {
          const call = item.call;
          if (!call || call.status !== 'ringing' || call.fromUid === profile.firebaseUid) return false;
          if (Date.now() - (cooldownRef.current[item.chatId] || 0) < 2500) return false;
          const age = Date.now() - new Date(call.createdAt).getTime();
          return age < 50_000;
        })
        .sort((a, b) => String(b.call?.createdAt || '').localeCompare(String(a.call?.createdAt || '')))[0];

      if (!ringing?.call) {
        if (store.incoming) setIncoming(null);
        return;
      }
      setIncoming({
        chatId: ringing.chatId,
        callId: ringing.call.id,
        video: ringing.call.video,
        peer: {
          uid: ringing.call.fromUid,
          username: ringing.call.fromHandle || ringing.username,
          displayName: ringing.call.fromName || ringing.displayName,
          avatarUrl: ringing.call.fromAvatar || ringing.avatarUrl,
        },
      });
    });
  }, [profile?.firebaseUid, hangup, markActive, setIncoming]);

  useEffect(() => {
    if (status !== 'ringing-in') return;
    playCallRing();
    const timer = window.setInterval(() => playCallRing(), 2000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== 'ringing-out') return;
    const timer = window.setTimeout(() => {
      hangupWithCooldown();
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [status, hangup]);

  async function accept() {
    if (!incoming || !profile) return;
    try {
      await answerPrivateCall(incoming.chatId);
      const session = await api<{ token: string; serverUrl: string }>(
        `/api/stream/token/${encodeURIComponent(callRoomName(incoming.chatId))}`,
      );
      beginIncomingAccepted({
        chatId: incoming.chatId,
        peer: incoming.peer,
        video: incoming.video,
        token: session.token,
        serverUrl: session.serverUrl,
      });
    } catch {
      hangupWithCooldown();
    }
  }

  if (!profile) return null;

  const showIncoming = status === 'ringing-in' && incoming;
  const showCall = (status === 'ringing-out' || status === 'active') && token && serverUrl && peer;

  if (!showIncoming && !showCall) return null;

  const name = (showIncoming ? incoming?.peer.displayName : peer?.displayName) || '';
  const handle = (showIncoming ? incoming?.peer.username : peer?.username) || '';
  const avatar = (showIncoming ? incoming?.peer.avatarUrl : peer?.avatarUrl) || null;
  const isVideo = showIncoming ? Boolean(incoming?.video) : video;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="px-5 pt-6 text-center">
          {avatar ? (
            <img src={avatar} alt="" className="mx-auto h-20 w-20 rounded-full object-cover ring-2 ring-emerald-400/40" />
          ) : (
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-zinc-800 text-2xl font-black text-emerald-300">
              {(name || handle || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <p className="mt-3 text-lg font-bold text-white">{name || `@${handle}`}</p>
          {handle ? <p className="text-xs text-zinc-400">@{handle}</p> : null}
          <p className="mt-2 text-sm font-semibold text-emerald-300">
            {showIncoming
              ? `${name || `@${handle}`} te está llamando${isVideo ? ' (video)' : ''}`
              : status === 'ringing-out'
                ? `Llamando${isVideo ? ' por video' : ''}…`
                : `En llamada${isVideo ? ' de video' : ''}`}
          </p>
        </div>

        {showCall ? (
          <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect
            audio
            video={video}
            className={video ? 'mx-4 mt-4 h-48 overflow-hidden rounded-2xl bg-black' : 'h-0 overflow-hidden'}
          >
            <CallStage video={video} />
          </LiveKitRoom>
        ) : null}

        <div className="flex justify-center gap-3 px-5 py-6">
          {showIncoming ? (
            <>
              <button
                type="button"
                onClick={() => hangupWithCooldown()}
                className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-3 text-sm font-bold text-white"
              >
                <PhoneOff size={16} /> Rechazar
              </button>
              <button
                type="button"
                onClick={() => void accept()}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-zinc-950"
              >
                {isVideo ? <Video size={16} /> : <Phone size={16} />} Aceptar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => hangupWithCooldown()}
              className="inline-flex items-center gap-2 rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white"
            >
              <PhoneOff size={16} /> Colgar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
