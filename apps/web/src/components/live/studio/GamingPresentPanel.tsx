import { AudioMixer } from './AudioMixer';
import { StreamHealth } from './StreamHealth';
import type { ConnectionQuality } from './liveStudioTypes';

type Props = {
  micLevel: number;
  gameLevel: number;
  micVolume: number;
  gameVolume: number;
  micMuted: boolean;
  gameMuted: boolean;
  quality: ConnectionQuality;
  bitrateKbps?: number | null;
  rttMs?: number | null;
  onMicVolumeChange: (v: number) => void;
  onGameVolumeChange: (v: number) => void;
  onToggleMic: () => void;
  onToggleGame: () => void;
  onStopPresent: () => void;
};

/** Panel in-app Espacio Gaming: mixer + salud de stream (Fase 3). */
export function GamingPresentPanel({
  micLevel,
  gameLevel,
  micVolume,
  gameVolume,
  micMuted,
  gameMuted,
  quality,
  bitrateKbps,
  rttMs,
  onMicVolumeChange,
  onGameVolumeChange,
  onToggleMic,
  onToggleGame,
  onStopPresent,
}: Props) {
  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-[max(5.5rem,calc(var(--lb-safe-bottom)+4.5rem))] z-[47] mx-auto flex w-full max-w-[min(100%,22rem)] flex-col gap-2 sm:inset-x-auto sm:left-3 sm:right-auto sm:mx-0 md:max-w-[min(100%,28rem)] lg:max-w-[min(100%,32rem)]">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-950/90 px-3 py-2 text-white shadow-lg backdrop-blur-md">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wide text-emerald-200">
            Espacio Gaming · en vivo
          </p>
          <p className="truncate text-[10px] text-emerald-100/80">
            Mixer + HUD · deja de presentar sin cerrar el LIVE
          </p>
        </div>
        <button
          type="button"
          onClick={onStopPresent}
          className="min-h-11 shrink-0 rounded-full bg-red-500 px-3 py-2 text-[11px] font-bold text-white"
        >
          Dejar de presentar
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <AudioMixer
          micLevel={micLevel}
          gameLevel={gameLevel}
          micVolume={micVolume}
          gameVolume={gameVolume}
          micMuted={micMuted}
          gameMuted={gameMuted}
          onMicVolumeChange={onMicVolumeChange}
          onGameVolumeChange={onGameVolumeChange}
          onToggleMic={onToggleMic}
          onToggleGame={onToggleGame}
        />
        <StreamHealth quality={quality} bitrateKbps={bitrateKbps} rttMs={rttMs} />
      </div>
    </div>
  );
}
