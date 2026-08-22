import { Eye, Lock, Radio, Share2, Unlock, X } from 'lucide-react';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useUiStore, type Donor } from '../../store/uiStore';
import { FloatingGift } from './FloatingGift';
import { LivePlayer } from './LivePlayer';

export function LiveRoom() {
  const stream = useUiStore((s) => s.activeStream);
  const bursts = useUiStore((s) => s.bursts);
  const dismissBurst = useUiStore((s) => s.dismissBurst);
  const pushBurst = useUiStore((s) => s.pushBurst);
  const pushMessage = useUiStore((s) => s.pushMessage);
  const setDonors = useUiStore((s) => s.setDonors);
  const backToFeed = useUiStore((s) => s.backToFeed);

  useEffect(() => {
    if (!stream) return;
    let active = true;

    const onGift = (payload: {
      id: string;
      emoji: string;
      name: string;
      senderName: string;
    }) => {
      pushBurst({
        id: payload.id,
        emoji: payload.emoji,
        label: `${payload.senderName} envió ${payload.name}`,
        left: 18 + Math.random() * 52,
      });
    };

    const onChat = (payload: {
      id: string;
      author: string;
      avatar: string | null;
      text: string;
      donation?: number;
    }) => {
      pushMessage(payload);
    };

    void (async () => {
      const socket = await getSocket();
      if (!active) return;
      socket.emit('room:join', stream.id);
      socket.on('gift:sent', onGift);
      socket.on('chat:message', onChat);
      const detail = await api<{ donors: Donor[] }>(`/api/streams/${stream.id}`);
      if (active) {
        setDonors(detail.donors);
      }
    })();

    return () => {
      active = false;
      void getSocket().then((socket) => {
        socket.off('gift:sent', onGift);
        socket.off('chat:message', onChat);
      });
    };
  }, [pushBurst, pushMessage, setDonors, stream]);

  if (!stream) return null;

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col">
      <div className="relative h-full overflow-hidden rounded-2xl border border-white/5 bg-black shadow-[0_0_80px_rgba(0,240,255,0.08)]">
        <LivePlayer streamId={stream.id} fallbackUrl={stream.previewUrl} coverUrl={stream.coverUrl} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/35" />

        <div className="absolute left-4 top-4 flex items-center gap-3">
          <span className="live-dot flex items-center gap-1.5 rounded-md bg-boom-fuchsia px-2 py-1 text-[11px] font-bold text-white">
            <Radio size={11} /> EN VIVO
          </span>
          <div className="flex items-center gap-2 rounded-full bg-black/50 px-2 py-1 backdrop-blur-md">
            <img src={stream.creator.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
            <div className="pr-2">
              <p className="text-sm font-semibold leading-tight text-white">{stream.creator.name}</p>
              <p className="text-[11px] text-zinc-400">{stream.creator.handle}</p>
            </div>
            <button type="button" className="rounded-full bg-boom-cyan px-3 py-1 text-xs font-bold text-zinc-950">
              Seguir
            </button>
          </div>
        </div>

        <div className="absolute right-4 top-4 flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
            <Eye size={13} /> {stream.creator.viewers} VIENDO
          </span>
          <span
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-md ${
              stream.isPrivate ? 'bg-boom-gold/20 text-boom-gold' : 'bg-emerald-500/15 text-emerald-300'
            }`}
          >
            {stream.isPrivate ? <Lock size={12} /> : <Unlock size={12} />}
            {stream.isPrivate ? `Privado · ${stream.lockPrice}` : 'Público'}
          </span>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-zinc-200 backdrop-blur-md"
            aria-label="Compartir"
          >
            <Share2 size={14} />
          </button>
          <button
            type="button"
            onClick={backToFeed}
            className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-zinc-200 backdrop-blur-md"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>

        {bursts.map((burst) => (
          <FloatingGift
            key={burst.id}
            giftId={burst.emoji === '💎' || burst.emoji === '⭐' || burst.emoji === '👑' ? 'diamond' : 'heart'}
            left={burst.left}
            onComplete={() => dismissBurst(burst.id)}
          />
        ))}
      </div>
    </section>
  );
}
