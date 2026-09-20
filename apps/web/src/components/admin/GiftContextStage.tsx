import type { CSSProperties, ReactNode } from 'react';
import {
  Gift,
  Heart,
  MessageCircle,
  Mic,
  PhoneOff,
  Share2,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import type { GiftPlacement } from '../../lib/catalogConfigFirestore';
import type { GiftLayoutDevice, GiftLiveFormat } from '../../lib/giftLayout';

const SAMPLE = {
  name: 'Luna',
  handle: 'luna',
  caption: 'Ensayo de muestra · LiveBoom',
  peer: 'Marcos',
  peerHandle: 'marcos',
};

function liveVideoBox(device: GiftLayoutDevice, is916: boolean): CSSProperties {
  if (device !== 'desktop') return { width: '100%', height: '100%' };
  return {
    aspectRatio: is916 ? '9 / 16' : '16 / 9',
    width: is916 ? 'auto' : '100%',
    height: is916 ? '100%' : 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
  };
}

function DesktopNav() {
  return (
    <div className="pointer-events-none flex w-[16%] shrink-0 flex-col gap-1.5 border-r border-white/10 bg-black/40 p-1.5">
      <div className="h-2.5 w-[70%] rounded bg-fuchsia-400/50" />
      {['Inicio', 'Explorar', 'LIVE', 'Chat'].map((label) => (
        <div key={label} className="flex items-center gap-1.5 rounded-md px-1 py-1">
          <span className="h-2 w-2 rounded-full bg-white/25" />
          <span className="truncate text-[8px] font-semibold text-white/70">{label}</span>
        </div>
      ))}
    </div>
  );
}

function DesktopRail() {
  return (
    <div className="pointer-events-none flex w-[20%] shrink-0 flex-col gap-1.5 border-l border-white/10 bg-black/40 p-1.5">
      <div className="h-2 rounded bg-white/20" />
      <div className="h-10 rounded-lg bg-white/10" />
      <div className="h-10 rounded-lg bg-white/10" />
      <div className="mt-auto h-8 rounded-lg bg-fuchsia-500/25" />
    </div>
  );
}

function LiveChrome({
  device,
  is916,
  contentGift,
}: {
  device: GiftLayoutDevice;
  is916: boolean;
  contentGift: ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex min-h-0">
      {device === 'desktop' ? <DesktopNav /> : null}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="absolute left-2 top-2 z-30 flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2 py-0.5 text-[9px] font-bold text-white">
          ● LIVE
        </div>
        <div className="absolute left-2 top-8 z-30 flex items-center gap-1.5">
          <span className="h-6 w-6 rounded-full bg-gradient-to-b from-zinc-500 to-zinc-800 ring-1 ring-white/30" />
          <span className="text-[9px] font-semibold text-white drop-shadow">@{SAMPLE.handle}</span>
        </div>
        <div className={`absolute inset-0 flex items-center justify-center ${device === 'desktop' ? '' : 'p-[3%]'}`}>
          <div className="relative overflow-hidden" style={liveVideoBox(device, is916)}>
            <div className="absolute inset-0 bg-black/25" />
            <div className="absolute left-1/2 top-[22%] z-0 flex w-[42%] -translate-x-1/2 flex-col items-center">
              <div className="aspect-square w-full rounded-full bg-gradient-to-b from-zinc-600 to-zinc-800 ring-2 ring-white/10" />
              <div className="mt-2 h-10 w-[70%] rounded-2xl bg-zinc-800/80" />
            </div>
            <div className="absolute bottom-3 left-3 right-16 space-y-1">
              <div className="h-3 w-24 rounded bg-white/20" />
              <div className="h-3 w-32 rounded bg-white/10" />
            </div>
            <div className="pointer-events-auto absolute inset-0 z-10" data-gift-content-area="live">
              {contentGift}
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/55 p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-fuchsia-500/30 text-sm ring-1 ring-fuchsia-400/40">
              🎁
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[9px] font-semibold text-white">Enviar regalo</p>
              <p className="truncate text-[8px] text-zinc-400">Chat · combos · catálogo</p>
            </div>
            <span className="rounded-lg bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-2 py-1 text-[8px] font-bold text-white">
              Enviar
            </span>
          </div>
        </div>
      </div>
      {device === 'desktop' ? <DesktopRail /> : null}
    </div>
  );
}

function PostChrome({ device, contentGift }: { device: GiftLayoutDevice; contentGift: ReactNode }) {
  const card = (
    <article className="lb-pub-card pointer-events-none mx-auto flex h-full max-h-full w-full max-w-[22rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90">
      <header className="flex shrink-0 items-center gap-2 px-3 py-2">
        <span className="h-8 w-8 rounded-full bg-gradient-to-b from-zinc-500 to-zinc-800 ring-1 ring-white/20" />
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold text-white">{SAMPLE.name}</p>
          <p className="truncate text-[8px] text-zinc-400">@{SAMPLE.handle}</p>
        </div>
      </header>
      <div className="pointer-events-auto relative min-h-0 flex-1 bg-black" data-gift-content-area="post">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-700 to-zinc-950" />
        <div className="pointer-events-none absolute left-1/2 top-[28%] h-[38%] w-[46%] -translate-x-1/2 rounded-full bg-zinc-600/80" />
        {contentGift}
      </div>
      <p className="shrink-0 px-3 py-1.5 text-[9px] text-zinc-200">{SAMPLE.caption}</p>
      <div className="flex shrink-0 items-center gap-3 px-3 pb-2 text-white">
        <Heart size={12} />
        <MessageCircle size={12} />
        <Gift size={12} />
        <Share2 size={12} className="ml-auto" />
      </div>
    </article>
  );

  if (device !== 'desktop') {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col bg-[#0a0a0b] p-2">
        <div className="mb-2 h-3 w-24 rounded bg-fuchsia-400/40" />
        <div className="min-h-0 flex-1">{card}</div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex min-h-0">
      <DesktopNav />
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#0a0a0b] p-3">{card}</div>
      <DesktopRail />
    </div>
  );
}

function ClipChrome({
  kind,
  contentGift,
}: {
  kind: 'boom_clip' | 'flashboom';
  contentGift: ReactNode;
}) {
  const flash = kind === 'flashboom';
  return (
    <div className="pointer-events-none absolute inset-0 z-10 bg-black">
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-700 via-zinc-900 to-black" />
      <div className="absolute left-1/2 top-[24%] h-[40%] w-[48%] -translate-x-1/2 rounded-full bg-zinc-600/80" />
      {flash ? (
        <div className="absolute left-3 right-3 top-3 flex gap-1">
          <div className="h-0.5 flex-1 rounded-full bg-white" />
          <div className="h-0.5 flex-1 rounded-full bg-white/30" />
          <div className="h-0.5 flex-1 rounded-full bg-white/30" />
        </div>
      ) : (
        <div className="absolute left-3 top-3 rounded-full bg-fuchsia-500/80 px-2 py-0.5 text-[8px] font-bold text-white">
          Boom Clip
        </div>
      )}
      <div className="absolute left-3 top-8 flex items-center gap-1.5">
        <span className="h-6 w-6 rounded-full bg-zinc-500" />
        <span className="text-[9px] font-semibold text-white">@{SAMPLE.handle}</span>
      </div>
      <div className="absolute bottom-16 left-3 right-16 space-y-1">
        <p className="text-[10px] font-semibold text-white">{flash ? 'Flash Boom' : 'Clip de muestra'}</p>
        <p className="text-[8px] text-white/70">{SAMPLE.caption}</p>
      </div>
      <div className="absolute bottom-16 right-2 flex flex-col items-center gap-3 text-white">
        <Heart size={16} />
        <MessageCircle size={16} />
        <Gift size={16} />
        <Share2 size={16} />
      </div>
      <div className="pointer-events-auto absolute inset-0 z-10" data-gift-content-area={kind}>
        {contentGift}
      </div>
    </div>
  );
}

function CallChrome({
  kind,
  contentGift,
}: {
  kind: 'voice' | 'video';
  contentGift: ReactNode;
}) {
  if (kind === 'voice') {
    return (
      <article className="lb-voice-connected-screen pointer-events-none absolute inset-0 z-10 flex flex-col bg-[#0a0a0b]">
        <header className="lb-video-connected-head shrink-0 px-3 py-2">
          <p className="text-[10px] font-semibold text-white">{SAMPLE.peer}</p>
          <p className="text-[8px] text-zinc-400">@{SAMPLE.peerHandle} · En llamada de voz</p>
        </header>
        <div className="pointer-events-auto relative min-h-0 flex-1" data-gift-content-area="call_voice">
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
            <span className="h-24 w-24 rounded-full bg-gradient-to-b from-zinc-500 to-zinc-800 ring-4 ring-fuchsia-400/20" />
            <p className="text-[10px] text-white/80">Las mejores conexiones se viven en voz</p>
          </div>
          {contentGift}
        </div>
        <div className="flex shrink-0 justify-center gap-4 px-3 py-3 text-white">
          <Mic size={14} />
          <Gift size={14} />
          <PhoneOff size={14} className="text-rose-400" />
          <Volume2 size={14} />
        </div>
      </article>
    );
  }

  return (
    <article className="pointer-events-none absolute inset-0 z-10 flex flex-col bg-black">
      <header className="absolute left-3 top-3 z-20 text-white">
        <p className="text-[10px] font-semibold">{SAMPLE.peer}</p>
        <p className="text-[8px] text-white/70">Videollamada · 04:12</p>
      </header>
      <div className="pointer-events-auto relative min-h-0 flex-1" data-gift-content-area="call_video">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-700 to-zinc-950" />
        <div className="pointer-events-none absolute left-1/2 top-[30%] h-[36%] w-[42%] -translate-x-1/2 rounded-full bg-zinc-600/80" />
        <div className="pointer-events-none absolute bottom-16 right-3 h-[22%] w-[28%] overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/20">
          <div className="flex h-full items-center justify-center">
            <Video size={16} className="text-white/50" />
          </div>
        </div>
        {contentGift}
      </div>
      <div className="absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-4 text-white">
        <Mic size={14} />
        <VideoOff size={14} />
        <Gift size={14} />
        <PhoneOff size={14} className="text-rose-400" />
      </div>
    </article>
  );
}

function ChatChrome({ device, contentGift }: { device: GiftLayoutDevice; contentGift: ReactNode }) {
  const thread = (
    <div className="lb-chat-pane flex h-full min-h-0 flex-col bg-[#0a0a0b]">
      <div className="lb-chat-thread-head shrink-0 border-b border-white/10 px-3 py-2">
        <p className="text-[10px] font-semibold text-white">{SAMPLE.peer}</p>
        <p className="text-[8px] text-zinc-400">@{SAMPLE.peerHandle} · en línea</p>
      </div>
      <div className="pointer-events-auto relative min-h-0 flex-1 px-3 py-2" data-gift-content-area="chat">
        <div className="pointer-events-none mb-2 max-w-[70%] rounded-2xl bg-white/10 px-2 py-1.5 text-[9px] text-white">
          Hola, ¿cómo va el ensayo?
        </div>
        <div className="pointer-events-none ml-auto mb-2 max-w-[70%] rounded-2xl bg-fuchsia-500/30 px-2 py-1.5 text-[9px] text-white">
          Todo bien, es solo una vista de muestra.
        </div>
        {contentGift}
      </div>
      <div className="shrink-0 border-t border-white/10 px-3 py-2">
        <div className="h-8 rounded-full bg-white/10" />
      </div>
    </div>
  );

  if (device !== 'desktop') {
    return <div className="pointer-events-none absolute inset-0 z-10">{thread}</div>;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex min-h-0">
      <DesktopNav />
      <div className="flex w-[28%] shrink-0 flex-col gap-2 border-r border-white/10 bg-black/35 p-2">
        <div className="h-3 w-16 rounded bg-white/20" />
        <div className="h-8 rounded-lg bg-white/10" />
        <div className="h-8 rounded-lg bg-fuchsia-500/20 ring-1 ring-fuchsia-400/30" />
        <div className="h-8 rounded-lg bg-white/10" />
      </div>
      <div className="relative min-h-0 min-w-0 flex-1">{thread}</div>
    </div>
  );
}

export function GiftContextStage({
  placement,
  device,
  liveFormat,
  callKind,
  contentGift,
}: {
  placement: GiftPlacement;
  device: GiftLayoutDevice;
  liveFormat: GiftLiveFormat;
  callKind: 'voice' | 'video';
  contentGift: ReactNode;
}) {
  if (placement === 'live') {
    return <LiveChrome device={device} is916={liveFormat === 'portrait916'} contentGift={contentGift} />;
  }
  if (placement === 'post') return <PostChrome device={device} contentGift={contentGift} />;
  if (placement === 'boom_clip') return <ClipChrome kind="boom_clip" contentGift={contentGift} />;
  if (placement === 'flashboom') return <ClipChrome kind="flashboom" contentGift={contentGift} />;
  if (placement === 'call') return <CallChrome kind={callKind} contentGift={contentGift} />;
  return <ChatChrome device={device} contentGift={contentGift} />;
}
