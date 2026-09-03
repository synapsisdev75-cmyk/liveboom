import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

type ChannelProps = {
  label: string;
  icon: 'mic' | 'game';
  level: number;
  volume: number;
  muted: boolean;
  onVolumeChange?: (value: number) => void;
  onToggleMute?: () => void;
};

function Channel({
  label,
  icon,
  level,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: ChannelProps) {
  const Icon = icon === 'mic' ? (muted ? MicOff : Mic) : muted ? VolumeX : Volume2;
  const pct = Math.min(100, Math.max(0, Math.round(level * 100)));

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0f1016] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <Icon size={14} className={muted ? 'text-rose-300' : 'text-cyan-300'} />
          {label}
        </span>
        {onToggleMute ? (
          <button
            type="button"
            onClick={onToggleMute}
            className="rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            {muted ? 'OFF' : 'ON'}
          </button>
        ) : null}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-150 ${
            muted ? 'bg-zinc-600' : 'bg-gradient-to-r from-cyan-500 to-violet-500'
          }`}
          style={{ width: `${muted ? 0 : pct}%` }}
        />
      </div>
      {onVolumeChange ? (
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
          className="mt-2 w-full accent-cyan-400"
          aria-label={`Volumen ${label}`}
        />
      ) : null}
    </div>
  );
}

type Props = {
  micLevel?: number;
  gameLevel?: number;
  micVolume?: number;
  gameVolume?: number;
  micMuted?: boolean;
  gameMuted?: boolean;
  onMicVolumeChange?: (v: number) => void;
  onGameVolumeChange?: (v: number) => void;
  onToggleMic?: () => void;
  onToggleGame?: () => void;
};

export function AudioMixer({
  micLevel = 0,
  gameLevel = 0,
  micVolume = 1,
  gameVolume = 1,
  micMuted = false,
  gameMuted = true,
  onMicVolumeChange,
  onGameVolumeChange,
  onToggleMic,
  onToggleGame,
}: Props) {
  return (
    <div className="lb-live-studio-mixer rounded-2xl border border-white/[0.08] bg-[#12131a] p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Audio</p>
      <div className="mt-3 space-y-2">
        <Channel
          label="MIC"
          icon="mic"
          level={micLevel}
          volume={micVolume}
          muted={micMuted}
          onVolumeChange={onMicVolumeChange}
          onToggleMute={onToggleMic}
        />
        <Channel
          label="GAME"
          icon="game"
          level={gameLevel}
          volume={gameVolume}
          muted={gameMuted}
          onVolumeChange={onGameVolumeChange}
          onToggleMute={onToggleGame}
        />
      </div>
    </div>
  );
}
