import '@livekit/components-styles';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import { createLocalVideoTrack, RoomEvent, Track, type LocalVideoTrack } from 'livekit-client';
import {
  Circle,
  Eye,
  Gift,
  Lock,
  Radio,
  Send,
  SwitchCamera,
  UserPlus,
  Video,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { FloatingGift, GiftIcon } from '../components/live/FloatingGift';
import { CoinModal, RechargeButton } from '../components/wallet/CoinModal';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

const GIFT_CATALOG = [
  { id: 'heart', name: 'Corazón', emoji: '❤️', coins: 10 },
  { id: 'rose', name: 'Rosa', emoji: '🌹', coins: 50 },
  { id: 'star', name: 'Estrella', emoji: '⭐', coins: 100 },
  { id: 'diamond', name: 'Diamante', emoji: '💎', coins: 200 },
  { id: 'crown', name: 'Corona', emoji: '👑', coins: 500 },
  { id: 'lion', name: 'León', emoji: '🦁', coins: 1000 },
];

const REEL_SECONDS = 15;

type LiveLaunchState = {
  goLive?: boolean;
  title?: string;
  isPrivate?: boolean;
  category?: string;
};

type ChatMessage = {
  id: string;
  author: string;
  text: string;
  gift?: { giftId: string; emoji: string; name: string };
};

type FloatingGiftItem = { id: string; giftId: string; left: number };

type RoomPayload =
  | { type: 'chat'; id: string; author: string; text: string }
  | {
      type: 'gift';
      id: string;
      giftId: string;
      senderName: string;
      giftName: string;
      emoji: string;
    }
  | { type: 'invite'; guestHandle: string; hostName: string };

function publishRoomData(room: ReturnType<typeof useRoomContext>, payload: RoomPayload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return room.localParticipant.publishData(bytes, { reliable: true });
}

function parseRoomData(payload: Uint8Array): RoomPayload | null {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as RoomPayload;
  } catch {
    return null;
  }
}

function useViewerCount() {
  const room = useRoomContext();
  const [connected, setConnected] = useState(1);

  useEffect(() => {
    const refresh = () => {
      setConnected(Math.max(1, room.remoteParticipants.size + 1));
    };
    refresh();
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.Connected, refresh);
    return () => {
      room.off(RoomEvent.ParticipantConnected, refresh);
      room.off(RoomEvent.ParticipantDisconnected, refresh);
      room.off(RoomEvent.Connected, refresh);
    };
  }, [room]);

  return {
    connected,
    viewers: Math.max(0, connected - 1),
  };
}

export function LiveRoom() {
  const { username } = useParams();
  const location = useLocation();
  const launch = (location.state as LiveLaunchState | null) || {};
  const ready = useAuthStore((state) => state.ready);
  const profile = useAuthStore((state) => state.profile);
  const [session, setSession] = useState<{
    token: string;
    serverUrl: string;
    canPublish: boolean;
    isHost?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveStarted, setLiveStarted] = useState(false);
  const [isPrivate, setIsPrivate] = useState(Boolean(launch.isPrivate));

  const isOwnRoom =
    profile?.handle && username
      ? profile.handle.toLowerCase() === username.toLowerCase()
      : false;
  const needsLaunchConfirm = isOwnRoom && !launch.goLive && !liveStarted;

  useEffect(() => {
    if (!username || !profile) return;
    let cancelled = false;
    void api<{
      token: string;
      serverUrl: string;
      canPublish: boolean;
      isHost?: boolean;
    }>(`/api/stream/token/${encodeURIComponent(username)}`)
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo entrar a la sala');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profile, username]);

  useEffect(() => {
    if (!username || !profile || !session?.canPublish || !session.isHost) return;
    if (!launch.goLive || liveStarted) return;

    let cancelled = false;
    void api('/api/stream/live/start', {
      method: 'POST',
      body: JSON.stringify({
        username,
        title: launch.title || `Live de ${profile.displayName || profile.handle}`,
        isPrivate: Boolean(launch.isPrivate),
        category: launch.category || profile.category || 'otro',
      }),
    })
      .then(() => {
        if (!cancelled) {
          setLiveStarted(true);
          setIsPrivate(Boolean(launch.isPrivate));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [username, profile, session, launch.goLive, launch.title, launch.isPrivate, launch.category, liveStarted]);

  useEffect(() => {
    return () => {
      if (liveStarted && username) {
        void api('/api/stream/live/stop', {
          method: 'POST',
          body: JSON.stringify({ username }),
        }).catch(() => undefined);
      }
    };
  }, [liveStarted, username]);

  if (!ready) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 text-sm text-zinc-400">
        Cargando sala…
      </div>
    );
  }
  if (!profile) {
    return <Navigate to="/login" replace />;
  }
  if (!username) {
    return <Navigate to="/" replace />;
  }
  if (needsLaunchConfirm) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 px-6 text-center">
        <div className="max-w-sm space-y-4">
          <p className="text-lg font-bold text-white">¿Listo para transmitir?</p>
          <p className="text-sm text-zinc-400">
            Configura si tu live será público o privado antes de abrir la cámara.
          </p>
          <Link
            to="/transmitir"
            className="inline-block rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-6 py-3 text-sm font-bold text-zinc-950"
          >
            Configurar transmisión
          </Link>
          <Link to="/" className="block text-xs text-cyan-400">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-fuchsia-400">{error}</p>
          <Link to="/" className="mt-3 block text-xs text-cyan-400">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 text-sm text-zinc-400">
        Conectando LiveKit…
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-zinc-950 p-0 sm:p-3">
      <LiveKitRoom
        token={session.token}
        serverUrl={session.serverUrl}
        connect
        video={session.canPublish}
        audio={session.canPublish}
        className="relative flex h-full w-full min-h-0 flex-col lg:flex-row lg:gap-3"
      >
        <RoomAudioRenderer />
        <CreatorStage
          username={username}
          canPublish={session.canPublish}
          isHost={Boolean(session.isHost ?? (session.canPublish && isOwnRoom))}
          isPrivate={isPrivate}
        />
        <ChatPanel
          roomName={username}
          canPublish={session.canPublish}
          isHost={Boolean(session.isHost ?? (session.canPublish && isOwnRoom))}
        />
      </LiveKitRoom>
    </div>
  );
}

function CreatorStage({
  username,
  canPublish,
  isHost,
  isPrivate,
}: {
  username: string;
  canPublish: boolean;
  isHost: boolean;
  isPrivate: boolean;
}) {
  const room = useRoomContext();
  const profile = useAuthStore((state) => state.profile);
  const { connected, viewers } = useViewerCount();
  const [floats, setFloats] = useState<FloatingGiftItem[]>([]);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [flipping, setFlipping] = useState(false);
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [reelNote, setReelNote] = useState<string | null>(null);
  const cameraTrackRef = useRef<LocalVideoTrack | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const localTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const localCamera = localTracks.find((track) => track.participant.isLocal);

  useEffect(() => {
    const pub = localCamera?.publication?.track;
    if (pub && 'mediaStreamTrack' in pub) {
      cameraTrackRef.current = pub as LocalVideoTrack;
    }
  }, [localCamera]);

  useEffect(() => {
    const onData = (payload: Uint8Array) => {
      const data = parseRoomData(payload);
      if (!data) return;
      if (data.type === 'gift') {
        setFloats((current) => [
          ...current,
          { id: data.id, giftId: data.giftId, left: 18 + Math.random() * 64 },
        ]);
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  const flipCamera = useCallback(async () => {
    if (!canPublish || flipping) return;
    setFlipping(true);
    const nextFacing = facing === 'user' ? 'environment' : 'user';
    try {
      const nextTrack = await createLocalVideoTrack({
        facingMode: nextFacing,
      });
      const publications = Array.from(room.localParticipant.videoTrackPublications.values());
      for (const publication of publications) {
        if (publication.source === Track.Source.Camera && publication.track) {
          await room.localParticipant.unpublishTrack(publication.track);
          publication.track.stop();
        }
      }
      if (cameraTrackRef.current) {
        cameraTrackRef.current.stop();
      }
      await room.localParticipant.publishTrack(nextTrack, {
        source: Track.Source.Camera,
        name: 'camera',
      });
      cameraTrackRef.current = nextTrack;
      setFacing(nextFacing);
    } catch (error) {
      console.error('[live] flip camera', error);
    } finally {
      setFlipping(false);
    }
  }, [canPublish, flipping, facing, room]);

  async function inviteGuest() {
    const guestHandle = inviteHandle.trim().replace(/^@/, '');
    if (!guestHandle) return;
    setInviteNote(null);
    try {
      await api('/api/stream/invite', {
        method: 'POST',
        body: JSON.stringify({ roomName: username, guestHandle }),
      });
      await publishRoomData(room, {
        type: 'invite',
        guestHandle,
        hostName: profile?.displayName || profile?.handle || username,
      });
      setInviteNote(`Invitación enviada a @${guestHandle}`);
      setInviteHandle('');
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo invitar');
    }
  }

  async function recordReel() {
    if (recording || !isHost) return;
    const track = cameraTrackRef.current?.mediaStreamTrack;
    if (!track) {
      setReelNote('Espera a que la cámara esté lista');
      return;
    }
    setRecording(true);
    setReelNote(`Grabando reel (${REEL_SECONDS}s)…`);
    try {
      const stream = new MediaStream([track]);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          recorder.stop();
          resolve();
        }, REEL_SECONDS * 1000);
      });
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      const blob = new Blob(chunks, { type: mimeType });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer el video'));
        reader.readAsDataURL(blob);
      });
      await api('/api/stream/reels', {
        method: 'POST',
        body: JSON.stringify({
          username,
          dataUrl,
          title: `Reel · ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`,
          shared: false,
        }),
      });
      setReelNote('Reel guardado. Puedes compartirlo desde tu perfil.');
    } catch (err) {
      setReelNote(err instanceof Error ? err.message : 'No se pudo grabar el reel');
    } finally {
      setRecording(false);
      recorderRef.current = null;
    }
  }

  return (
    <section className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black lg:w-[70%] lg:rounded-2xl lg:border lg:border-white/10 lg:shadow-[0_0_48px_rgba(0,240,255,0.12)]">
      <div className="relative h-full w-full max-w-full lg:max-h-full">
        <div className="mx-auto flex h-full w-full max-w-[min(100%,calc(100dvh*9/16))] items-center justify-center">
          <div className="relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden bg-black lg:rounded-2xl">
            <CreatorVideo />
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex max-w-[78%] flex-wrap items-center gap-2">
            <span className="live-dot rounded-md bg-fuchsia-600 px-2 py-1 text-[11px] font-bold text-white">
              <Radio className="mr-1 inline" size={11} /> EN VIVO
            </span>
            {isPrivate ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] text-amber-300 backdrop-blur">
                <Lock size={11} /> Privado
              </span>
            ) : null}
            <span className="truncate rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur">
              @{username}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-cyan-300 backdrop-blur">
              <Eye size={12} />
              {viewers} viendo · {connected} conectados
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {canPublish ? (
              <button
                type="button"
                onClick={() => void flipCamera()}
                disabled={flipping}
                className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 disabled:opacity-60"
                aria-label="Cambiar cámara"
              >
                <SwitchCamera size={16} />
              </button>
            ) : null}
            <Link
              to="/"
              className="rounded-full bg-black/55 px-3 py-2 text-xs text-zinc-200 backdrop-blur hover:text-white"
            >
              Salir
            </Link>
          </div>
        </div>
      </div>
      {isHost ? (
        <div className="pointer-events-auto absolute left-3 right-3 top-[4.5rem] z-10 flex flex-wrap gap-2 sm:left-4 sm:right-auto">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-black/55 p-2 backdrop-blur sm:max-w-xs">
            <UserPlus size={16} className="shrink-0 text-cyan-300" />
            <input
              value={inviteHandle}
              onChange={(event) => setInviteHandle(event.target.value)}
              placeholder="Invitar @usuario"
              className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none"
            />
            <button
              type="button"
              onClick={() => void inviteGuest()}
              className="shrink-0 rounded-lg bg-cyan-500/20 px-2 py-1 text-[10px] font-bold text-cyan-300"
            >
              Invitar
            </button>
          </div>
          <button
            type="button"
            disabled={recording}
            onClick={() => void recordReel()}
            className="inline-flex items-center gap-1 rounded-xl bg-black/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur disabled:opacity-60"
          >
            {recording ? <Circle className="animate-pulse text-red-400" size={12} /> : <Video size={14} />}
            {recording ? 'Grabando…' : 'Reel 15s'}
          </button>
        </div>
      ) : null}
      {(inviteNote || reelNote) && isHost ? (
        <p className="pointer-events-none absolute left-3 right-3 top-[8.5rem] z-10 text-[11px] text-cyan-200 sm:left-4 sm:max-w-md">
          {inviteNote || reelNote}
        </p>
      ) : null}
      {floats.map((item) => (
        <FloatingGift
          key={item.id}
          giftId={item.giftId}
          left={item.left}
          onComplete={() => setFloats((current) => current.filter((gift) => gift.id !== item.id))}
        />
      ))}
    </section>
  );
}

function CreatorVideo() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const camera = tracks.find((track) => Boolean(track.publication));

  if (!camera?.publication) {
    return (
      <div className="grid h-full w-full place-items-center text-sm text-zinc-500">
        Esperando la cámara del creador…
      </div>
    );
  }

  return (
    <VideoTrack
      trackRef={camera}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

function ChatPanel({
  roomName,
  canPublish,
  isHost,
}: {
  roomName: string;
  canPublish: boolean;
  isHost: boolean;
}) {
  const room = useRoomContext();
  const profile = useAuthStore((state) => state.profile);
  const coins = profile?.coinsBalance ?? 0;
  const setCoins = useAuthStore((state) => state.setCoins);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [openGifts, setOpenGifts] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());

  function pushMessage(message: ChatMessage) {
    if (seen.current.has(message.id)) return;
    seen.current.add(message.id);
    setMessages((current) => [...current.slice(-80), message]);
  }

  useEffect(() => {
    const onData = (payload: Uint8Array) => {
      const data = parseRoomData(payload);
      if (!data) return;
      if (data.type === 'chat') {
        pushMessage({ id: data.id, author: data.author, text: data.text });
        return;
      }
      if (data.type === 'gift') {
        pushMessage({
          id: `gift-${data.id}`,
          author: data.senderName,
          text: `envió ${data.giftName}`,
          gift: { giftId: data.giftId, emoji: data.emoji, name: data.giftName },
        });
        return;
      }
      if (data.type === 'invite') {
        const myHandle = profile?.handle?.toLowerCase();
        if (myHandle && data.guestHandle.toLowerCase() === myHandle) {
          setInviteBanner(`${data.hostName} te invitó a unirte con cámara. Recarga la sala.`);
        }
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, profile?.handle]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const value = text.trim();
    if (!value) return;
    const author = profile?.displayName || profile?.handle || 'Liveboomer';
    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author,
      text: value,
    };
    pushMessage(message);
    setText('');
    try {
      await publishRoomData(room, { type: 'chat', ...message });
    } catch (error) {
      console.error('[chat] publishData', error);
    }
  }

  async function sendGift(giftId: string) {
    setGiftError(null);
    try {
      const result = await api<{
        senderBalance: number;
        gift: {
          id: string;
          giftId: string;
          giftName: string;
          emoji: string;
          senderName: string;
        };
      }>('/api/gifts/send', {
        method: 'POST',
        body: JSON.stringify({ giftId, roomName }),
      });
      setCoins(result.senderBalance);
      setOpenGifts(false);
      const gift = result.gift;
      pushMessage({
        id: `gift-${gift.id}`,
        author: gift.senderName,
        text: `envió ${gift.giftName}`,
        gift: { giftId: gift.giftId, emoji: gift.emoji, name: gift.giftName },
      });
      await publishRoomData(room, {
        type: 'gift',
        id: gift.id,
        giftId: gift.giftId,
        senderName: gift.senderName,
        giftName: gift.giftName,
        emoji: gift.emoji,
      });
    } catch (err) {
      setGiftError(err instanceof Error ? err.message : 'No se pudo enviar el regalo');
    }
  }

  return (
    <aside
      className={`z-20 flex min-w-0 flex-col overflow-hidden border-white/10 lg:static lg:max-h-none lg:w-[30%] lg:min-w-[260px] lg:rounded-2xl lg:border lg:bg-zinc-800/45 lg:backdrop-blur-xl ${
        canPublish
          ? 'absolute inset-x-0 bottom-0 max-h-[46dvh] border-t bg-gradient-to-t from-black via-black/85 to-black/20 lg:relative lg:inset-auto lg:max-h-none lg:border-t-0 lg:bg-zinc-800/45 lg:from-transparent lg:via-transparent lg:to-transparent'
          : 'relative max-h-[42dvh] border-t bg-zinc-900/95 lg:max-h-none lg:border-t-0 lg:bg-zinc-800/45'
      }`}
    >
      <div className="border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">Chat en vivo</h2>
          {canPublish && isHost ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
              Visible en tu live
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-zinc-400">Saldo: {coins.toLocaleString('es-CO')} coins</p>
        {inviteBanner ? (
          <p className="mt-1 rounded-lg bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-200">{inviteBanner}</p>
        ) : null}
      </div>
      <div ref={listRef} className="chat-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="text-xs text-zinc-500">Sé el primero en saludar.</p>
        ) : null}
        {messages.map((message) =>
          message.gift ? (
            <div
              key={message.id}
              className="flex items-center gap-2 rounded-xl border border-yellow-500/50 bg-gradient-to-r from-yellow-500/20 to-fuchsia-500/20 px-3 py-2"
            >
              <GiftIcon giftId={message.gift.giftId} size={16} />
              <p className="text-sm text-white">
                <span className="font-semibold text-cyan-300">{message.author} </span>
                {message.text}
              </p>
            </div>
          ) : (
            <p key={message.id} className="text-sm text-white drop-shadow">
              <span className="font-medium text-cyan-300">{message.author}: </span>
              {message.text}
            </p>
          ),
        )}
      </div>
      <div className="relative space-y-2 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {openGifts ? (
          <div className="absolute bottom-[7.5rem] left-2 right-2 z-10 max-h-[36dvh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-3 shadow-[0_0_28px_rgba(255,0,85,0.2)] sm:left-3 sm:right-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Caja de regalos
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GIFT_CATALOG.map((gift) => (
                <button
                  key={gift.id}
                  type="button"
                  onClick={() => void sendGift(gift.id)}
                  className="rounded-xl border border-zinc-800 px-2 py-2 text-left text-xs text-white hover:border-cyan-400"
                >
                  <span className="text-lg">{gift.emoji}</span> {gift.name}
                  <span className="mt-1 block text-cyan-400">{gift.coins} coins</span>
                </button>
              ))}
            </div>
            {giftError ? <p className="mt-2 text-xs text-fuchsia-400">{giftError}</p> : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpenGifts((value) => !value)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-zinc-950 shadow-[0_0_18px_rgba(255,0,85,0.35)]"
            aria-label="Caja de regalos"
          >
            <Gift size={18} />
          </button>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void sendMessage();
            }}
            placeholder="Escribe un mensaje"
            className="h-11 flex-1 rounded-xl bg-black/40 px-3 text-sm text-white outline-none ring-1 ring-white/10"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            className="grid h-11 w-11 place-items-center rounded-xl bg-zinc-800 text-cyan-400"
            aria-label="Enviar"
          >
            <Send size={16} />
          </button>
        </div>
        {!canPublish ? (
          <RechargeButton onClick={() => setRechargeOpen(true)} className="w-full" />
        ) : null}
      </div>
      {rechargeOpen ? <CoinModal onClose={() => setRechargeOpen(false)} /> : null}
    </aside>
  );
}
