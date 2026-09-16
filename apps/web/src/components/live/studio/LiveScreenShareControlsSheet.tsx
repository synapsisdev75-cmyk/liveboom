import type { ReactNode } from 'react';
import { MessageCircle, Mic, MicOff, MonitorOff, Volume2, VolumeX, X } from 'lucide-react';

type Props = {
  open: boolean;
  microphoneEnabled: boolean;
  deviceAudioEnabled: boolean;
  floatingChatEnabled: boolean;
  qualityLabel?: string;
  onClose: () => void;
  onToggleMic: () => void;
  onToggleDeviceAudio: () => void;
  onToggleChat: () => void;
  onStopShare: () => void;
};

/** Controles mínimos de Screen Share. Sin cámara PiP durante el juego. */
export function LiveScreenShareControlsSheet({
  open,
  microphoneEnabled,
  deviceAudioEnabled,
  floatingChatEnabled,
  qualityLabel = '720p',
  onClose,
  onToggleMic,
  onToggleDeviceAudio,
  onToggleChat,
  onStopShare,
}: Props) {
  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[78] flex items-end justify-center bg-black/50 sm:items-center sm:px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-ss-controls-title"
        className="w-full max-w-md rounded-t-3xl border border-violet-400/35 bg-[#0c0d12] p-4 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="lb-ss-controls-title" className="text-sm font-bold text-white">
            Controles de transmisión
          </h2>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full text-zinc-300 hover:bg-white/5"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2">
          <ToggleRow
            icon={microphoneEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            title="Micrófono"
            desc="Tu voz se transmite en el live."
            on={microphoneEnabled}
            onToggle={onToggleMic}
          />
          <ToggleRow
            icon={deviceAudioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            title="Audio del juego"
            desc="Audio del dispositivo cuando Android lo permita."
            on={deviceAudioEnabled}
            onToggle={onToggleDeviceAudio}
          />
          <ToggleRow
            icon={<MessageCircle size={16} />}
            title="Chat flotante"
            desc="Ver mensajes sobre el juego."
            on={floatingChatEnabled}
            onToggle={onToggleChat}
          />
          <div className="flex min-h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <span className="text-sm font-semibold text-white">Calidad</span>
            <span className="text-sm font-bold text-violet-300">{qualityLabel}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onStopShare}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 text-sm font-bold text-white"
        >
          <MonitorOff size={16} />
          Dejar de compartir pantalla
        </button>
        <p className="mt-2 text-center text-[10px] text-zinc-500">
          El LIVE continúa. Solo se detiene la presentación de pantalla.
        </p>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  desc,
  on,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left"
    >
      <span className={on ? 'text-violet-300' : 'text-zinc-500'}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-[10px] text-zinc-400">{desc}</span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          on ? 'bg-violet-500' : 'bg-zinc-700'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${
            on ? 'left-5' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
