import '@livekit/components-styles';
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Gift, Radio, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { FloatingGift, GiftIcon } from '../components/live/FloatingGift';
import { CoinModal, RechargeButton } from '../components/wallet/CoinModal';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';

const GIFT_CATALOG = [
  { id: 'heart', name: 'Corazón', emoji: '❤️', coins: 10 },
  { id: 'rose', name: 'Rosa', emoji: '🌹', coins: 50 },
  { id: 'star', name: 'Estrella', emoji: '⭐', coins: 100 },
  { id: 'diamond', name: 'Diamante', emoji: '💎', coins: 200 },
  { id: 'crown', name: 'Corona', emoji: '👑', coins: 500 },
  { id: 'lion', name: 'León', emoji: '🦁', coins: 1000 },
];

type ChatMessage = {
  id: string;
  author: string;
  text: string;
  gift?: { giftId: string; emoji: string; name: string };
};

type FloatingGiftItem = { id: string; giftId: string; left: number };

type GiftPayload = {
  id: string;
  giftId: string;
  senderName: string;
  giftName: string;
  emoji: string;
};

export function LiveRoom() {
  const { username } = useParams();
  const ready = useAuthStore((state) => state.ready);
  const profile = useAuthStore((state) => state.profile);
  const [session, setSession] = useState<{
    token: string;
    serverUrl: string;
    canPublish: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username || !profile) return;
    let cancelled = false;
    let announced = false;
    void api<{ token: string; serverUrl: string; canPublish: boolean }>(
      `/api/stream/token/${encodeURIComponent(username)}`,
    )
      .then(async (data) => {
        if (cancelled) return;
        setSession(data);
        if (data.canPublish) {
          try {
            await api('/api/stream/live/start', {
              method: 'POST',
              body: JSON.stringify({
                username,
                title: `Live de ${profile.displayName || profile.handle}`,
              }),
            });
            announced = true;
          } catch {
            // La presencia es best-effort; el live igual puede continuar.
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo entrar a la sala');
        }
      });

    return () => {
      cancelled = true;
      if (announced) {
        void api('/api/stream/live/stop', {
          method: 'POST',
          body: JSON.stringify({ username }),
        }).catch(() => undefined);
      }
    };
  }, [profile, username]);

  if (!ready) {
    return <div className="grid h-screen place-items-center bg-zinc-950 text-sm text-zinc-400">Cargando sala…</div>;
  }
  if (!profile) {
    return <Navigate to="/login" replace />;
  }
  if (!username) {
    return <Navigate to="/" replace />;
  }
  if (error) {
    return (
      <div className="grid h-screen place-items-center bg-zinc-950 px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-fuchsia-400">{error}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Revisa tu conexión e inténtalo de nuevo.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-5 py-2 text-sm font-bold text-zinc-950"
          >
            Reintentar
          </button>
          <Link to="/" className="mt-3 block text-xs text-cyan-400">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }
  if (!session) {
    return <div className="grid h-screen place-items-center bg-zinc-950 text-sm text-zinc-400">Conectando LiveKit…</div>;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 p-3">
      <LiveKitRoom
        token={session.token}
        serverUrl={session.serverUrl}
        connect
        video={session.canPublish}
        audio={session.canPublish}
        className="flex h-full w-full gap-3"
      >
        <RoomAudioRenderer />
        <CreatorStage username={username} />
        <ChatPanel roomName={username} />
      </LiveKitRoom>
    </div>
  );
}

function CreatorStage({ username }: { username: string }) {
  const [floats, setFloats] = useState<FloatingGiftItem[]>([]);

  useEffect(() => {
    let active = true;
    let onGift: ((payload: GiftPayload) => void) | undefined;
    void getSocket().then((socket) => {
      socket.emit('join_room', username);
      onGift = (payload) => {
        if (!active) return;
        setFloats((current) => [
          ...current,
          {
            id: payload.id,
            giftId: payload.giftId,
            left: 18 + Math.random() * 64,
          },
        ]);
      };
      socket.on('gift_received', onGift);
    });
    return () => {
      active = false;
      void getSocket().then((socket) => {
        if (onGift) socket.off('gift_received', onGift);
      });
    };
  }, [username]);

  return (
    <section className="relative w-[70%] min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_0_48px_rgba(0,240,255,0.12)]">
      <CreatorVideo />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
        <span className="live-dot rounded-md bg-fuchsia-600 px-2 py-1 text-[11px] font-bold text-white">
          <Radio className="mr-1 inline" size={11} /> EN VIVO
        </span>
        <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur">@{username}</span>
      </div>
      <Link
        to="/"
        className="absolute right-4 top-4 rounded-full bg-black/50 px-3 py-1 text-xs text-zinc-200 backdrop-blur hover:text-white"
      >
        Salir
      </Link>
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

  if (!camera || !camera.publication) {
    return (
      <div className="grid h-full place-items-center text-sm text-zinc-500">
        Esperando la cámara del creador…
      </div>
    );
  }

  return <VideoTrack trackRef={camera} className="h-full w-full rounded-2xl object-cover" />;
}

function ChatPanel({ roomName }: { roomName: string }) {
  const coins = useAuthStore((state) => state.profile?.coinsBalance ?? 0);
  const setCoins = useAuthStore((state) => state.setCoins);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [openGifts, setOpenGifts] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void getSocket().then((socket) => {
      socket.emit('join_room', roomName);
      const onMessage = (payload: ChatMessage) => {
        setMessages((current) => [...current, payload]);
      };
      const onGift = (payload: GiftPayload) => {
        setMessages((current) => [
          ...current,
          {
            id: `gift-${payload.id}`,
            author: payload.senderName,
            text: `envió ${payload.giftName}`,
            gift: { giftId: payload.giftId, emoji: payload.emoji, name: payload.giftName },
          },
        ]);
      };
      socket.on('new_message', onMessage);
      socket.on('gift_received', onGift);
      cleanup = () => {
        socket.off('new_message', onMessage);
        socket.off('gift_received', onGift);
      };
    });
    return () => cleanup?.();
  }, [roomName]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const value = text.trim();
    if (!value) return;
    const socket = await getSocket();
    socket.emit('send_message', { roomName, text: value });
    setText('');
  }

  async function sendGift(giftId: string) {
    setGiftError(null);
    try {
      const result = await api<{ senderBalance: number }>('/api/gifts/send', {
        method: 'POST',
        body: JSON.stringify({ giftId, roomName }),
      });
      setCoins(result.senderBalance);
      setOpenGifts(false);
    } catch (err) {
      setGiftError(err instanceof Error ? err.message : 'No se pudo enviar el regalo');
    }
  }

  return (
    <aside className="flex w-[30%] min-w-[260px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-800/45 backdrop-blur-xl">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-bold text-white">Chat en vivo</h2>
        <p className="text-[11px] text-zinc-400">Saldo: {coins.toLocaleString('es-CO')} coins</p>
      </div>
      <div ref={listRef} className="chat-scroll flex-1 space-y-2 overflow-y-auto px-3 py-3">
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
            <p key={message.id} className="text-sm text-white">
              <span className="font-medium text-cyan-300">{message.author}: </span>
              {message.text}
            </p>
          ),
        )}
      </div>
      <div className="relative space-y-2 border-t border-white/10 p-3">
        {openGifts ? (
          <div className="absolute bottom-[7.5rem] left-3 right-3 rounded-2xl border border-white/10 bg-zinc-950/95 p-3 shadow-[0_0_28px_rgba(255,0,85,0.2)]">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Caja de regalos
            </p>
            <div className="grid grid-cols-2 gap-2">
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
        <RechargeButton onClick={() => setRechargeOpen(true)} className="w-full" />
      </div>
      {rechargeOpen ? <CoinModal onClose={() => setRechargeOpen(false)} /> : null}
    </aside>
  );
}
