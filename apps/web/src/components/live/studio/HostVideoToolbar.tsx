import { Camera, Clapperboard, Mic, MicOff, MonitorUp, MoreHorizontal, Users } from 'lucide-react';

type Props = {
  micOn: boolean;
  screenSharing: boolean;
  onInvite: () => void;
  onReel: () => void;
  onScreen: () => void;
  onMic: () => void;
  onCamera: () => void;
  onMore: () => void;
};

/** Barra inferior sobre el video del host (mockup transmitir). */
export function HostVideoToolbar({
  micOn,
  screenSharing,
  onInvite,
  onReel,
  onScreen,
  onMic,
  onCamera,
  onMore,
}: Props) {
  const btn =
    'inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-black/65 px-2.5 py-2 text-[11px] font-semibold text-white backdrop-blur ring-1 ring-white/10 hover:bg-black/80 sm:px-3';
  const active =
    'inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600/90 px-2.5 py-2 text-[11px] font-semibold text-white ring-1 ring-violet-300/50 sm:px-3';

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-3 z-20 hidden justify-center px-3 lg:flex">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-zinc-950/75 p-1.5 shadow-xl backdrop-blur-md">
        <button type="button" onClick={onInvite} className={btn}>
          <Users size={14} /> + Invitar
        </button>
        <button type="button" onClick={onReel} className={btn}>
          <Clapperboard size={14} /> Reel
        </button>
        <button type="button" onClick={onScreen} className={screenSharing ? active : btn}>
          <MonitorUp size={14} /> Pantalla
        </button>
        <button type="button" onClick={onMic} className={!micOn ? active : btn}>
          {micOn ? <Mic size={14} /> : <MicOff size={14} />} Micrófono
        </button>
        <button type="button" onClick={onCamera} className={btn}>
          <Camera size={14} /> Cámara
        </button>
        <button type="button" onClick={onMore} className={btn}>
          <MoreHorizontal size={14} /> Más
        </button>
      </div>
    </div>
  );
}
