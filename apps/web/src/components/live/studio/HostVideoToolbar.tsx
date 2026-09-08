import { Camera, Clapperboard, Mic, MicOff, MonitorUp, MoreHorizontal, Users } from 'lucide-react';

type DeviceOption = { deviceId: string; label: string };

type Props = {
  micOn: boolean;
  screenSharing: boolean;
  cameraDevices?: DeviceOption[];
  cameraDeviceId?: string;
  cameraPickerOpen?: boolean;
  audioDevices?: DeviceOption[];
  audioDeviceId?: string;
  micPickerOpen?: boolean;
  onInvite: () => void;
  onReel: () => void;
  onScreen: () => void;
  onMic: () => void;
  onMuteMic?: () => void;
  onSelectMic?: (deviceId: string) => void;
  onCamera: () => void;
  onSelectCamera?: (deviceId: string) => void;
  onMore: () => void;
};

/** Barra inferior sobre el video del host (mockup transmitir). */
export function HostVideoToolbar({
  micOn,
  screenSharing,
  cameraDevices = [],
  cameraDeviceId,
  cameraPickerOpen,
  audioDevices = [],
  audioDeviceId,
  micPickerOpen,
  onInvite,
  onReel,
  onScreen,
  onMic,
  onMuteMic,
  onSelectMic,
  onCamera,
  onSelectCamera,
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
          <MonitorUp size={14} /> {screenSharing ? 'Pantalla ON' : 'Pantalla'}
        </button>
        <div className="relative">
          <button type="button" onClick={onMic} className={!micOn ? active : btn}>
            {micOn ? <Mic size={14} /> : <MicOff size={14} />} Micrófono
          </button>
          {micPickerOpen && audioDevices.length > 0 ? (
            <div className="absolute bottom-full left-0 z-40 mb-1 min-w-[12rem] rounded-xl border border-white/10 bg-zinc-950/98 p-2 shadow-xl">
              <button
                type="button"
                onClick={onMuteMic}
                className="mb-1 block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-zinc-200 hover:bg-white/5"
              >
                {micOn ? 'Silenciar micrófono' : 'Activar micrófono'}
              </button>
              {audioDevices.map((device, index) => (
                <button
                  key={device.deviceId || `mic-${index}`}
                  type="button"
                  onClick={() => onSelectMic?.(device.deviceId)}
                  className={`block w-full rounded-lg px-2 py-1.5 text-left text-[11px] ${
                    audioDeviceId === device.deviceId
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : 'text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  {device.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="relative">
          <button type="button" onClick={onCamera} className={btn}>
            <Camera size={14} /> Cámara
          </button>
          {cameraPickerOpen && cameraDevices.length > 0 ? (
            <div className="absolute bottom-full right-0 z-40 mb-1 min-w-[12rem] rounded-xl border border-white/10 bg-zinc-950/98 p-2 shadow-xl">
              {cameraDevices.map((device, index) => (
                <button
                  key={device.deviceId || `cam-${index}`}
                  type="button"
                  onClick={() => onSelectCamera?.(device.deviceId)}
                  className={`block w-full rounded-lg px-2 py-1.5 text-left text-[11px] ${
                    cameraDeviceId === device.deviceId
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : 'text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  {device.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onMore} className={btn}>
          <MoreHorizontal size={14} /> Más
        </button>
      </div>
    </div>
  );
}
