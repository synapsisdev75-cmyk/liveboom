import {
  FlipHorizontal,
  MonitorUp,
  Mic,
  MicOff,
  Settings,
  Square,
  Video,
  VideoOff,
} from 'lucide-react';

type Props = {
  micOn?: boolean;
  cameraHidden?: boolean;
  screenSharing?: boolean;
  mirrorOn?: boolean;
  onToggleMic?: () => void;
  onToggleCamera?: () => void;
  onToggleScreen?: () => void;
  onToggleMirror?: () => void;
  onSettings?: () => void;
  onEnd?: () => void;
  compact?: boolean;
};

function ToolBtn({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-10 w-10 place-items-center rounded-xl border transition duration-200 sm:h-9 sm:w-9 ${
        active
          ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
          : 'border-white/10 bg-[#0f1016] text-zinc-200 hover:border-white/25 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function BroadcastControlsBar({
  micOn = true,
  cameraHidden = false,
  screenSharing = false,
  mirrorOn = false,
  onToggleMic,
  onToggleCamera,
  onToggleScreen,
  onToggleMirror,
  onSettings,
  onEnd,
  compact,
}: Props) {
  return (
    <div
      className={`lb-live-studio-controls flex flex-wrap items-center gap-2 ${
        compact ? 'justify-center' : 'justify-between'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {onToggleCamera ? (
          <ToolBtn
            label={cameraHidden ? 'Mostrar cámara' : 'Ocultar cámara'}
            onClick={onToggleCamera}
            active={!cameraHidden}
          >
            {cameraHidden ? <VideoOff size={18} /> : <Video size={18} />}
          </ToolBtn>
        ) : null}
        {onToggleScreen ? (
          <ToolBtn label="Pantalla" onClick={onToggleScreen} active={screenSharing}>
            <MonitorUp size={18} />
          </ToolBtn>
        ) : null}
        {onToggleMic ? (
          <ToolBtn label="Micrófono" onClick={onToggleMic} active={micOn}>
            {micOn ? <Mic size={18} /> : <MicOff size={18} />}
          </ToolBtn>
        ) : null}
        {onToggleMirror ? (
          <ToolBtn label="Espejo" onClick={onToggleMirror} active={mirrorOn}>
            <FlipHorizontal size={18} />
          </ToolBtn>
        ) : null}
        {onSettings ? (
          <ToolBtn label="Configuración" onClick={onSettings}>
            <Settings size={18} />
          </ToolBtn>
        ) : null}
      </div>
      {onEnd ? (
        <button
          type="button"
          onClick={onEnd}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-600/90 px-4 text-xs font-bold text-white transition hover:bg-rose-500"
        >
          <Square size={14} fill="currentColor" />
          Finalizar LIVE
        </button>
      ) : null}
    </div>
  );
}
