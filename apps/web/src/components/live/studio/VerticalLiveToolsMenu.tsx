import {
  Camera,
  Clapperboard,
  Coins,
  FlipHorizontal,
  Gift,
  Lock,
  Megaphone,
  Mic,
  MicOff,
  MonitorUp,
  Plus,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type VerticalLiveToolId =
  | 'invite'
  | 'reel'
  | 'screen'
  | 'mic'
  | 'camera'
  | 'mirror'
  | 'notify'
  | 'wishlist'
  | 'lock'
  | 'withdraw';

type CameraDevice = {
  deviceId: string;
  label: string;
};

type Props = {
  micOn: boolean;
  screenSharing: boolean;
  mirrorOn: boolean;
  recording: boolean;
  notifyBusy: boolean;
  wishlistCount: number;
  lockActive: boolean;
  cameraDevices: CameraDevice[];
  cameraDeviceId: string;
  micDevices?: CameraDevice[];
  micDeviceId?: string;
  onInvite: () => void;
  onReel: () => void;
  onScreen: () => void;
  onMic: () => void;
  onCamera: () => void;
  onSelectCamera: (deviceId: string) => void;
  onSelectMic?: (deviceId: string) => void;
  onMirror: () => void;
  onNotify: () => void;
  onWishlist: () => void;
  onLock: () => void;
  onWithdraw: () => void;
};

const TOOLS: {
  id: VerticalLiveToolId;
  label: string;
  tone: string;
}[] = [
  { id: 'invite', label: 'Invitar', tone: 'violet' },
  { id: 'reel', label: 'Reel', tone: 'fuchsia' },
  { id: 'screen', label: 'Pantalla', tone: 'cyan' },
  { id: 'mic', label: 'Micrófono', tone: 'emerald' },
  { id: 'camera', label: 'Cámara', tone: 'amber' },
  { id: 'mirror', label: 'Espejo', tone: 'violet' },
  { id: 'notify', label: 'Avisar', tone: 'fuchsia' },
  { id: 'wishlist', label: 'Deseos', tone: 'cyan' },
  { id: 'lock', label: 'Privado', tone: 'gold' },
  { id: 'withdraw', label: 'Retirar', tone: 'rose' },
];

function ToolIcon({
  id,
  micOn,
}: {
  id: VerticalLiveToolId;
  micOn: boolean;
}) {
  const size = 18;
  switch (id) {
    case 'invite':
      return <Users size={size} />;
    case 'reel':
      return <Clapperboard size={size} />;
    case 'screen':
      return <MonitorUp size={size} />;
    case 'mic':
      return micOn ? <Mic size={size} /> : <MicOff size={size} />;
    case 'camera':
      return <Camera size={size} />;
    case 'mirror':
      return <FlipHorizontal size={size} />;
    case 'notify':
      return <Megaphone size={size} />;
    case 'wishlist':
      return <Gift size={size} />;
    case 'lock':
      return <Lock size={size} />;
    case 'withdraw':
      return <Coins size={size} />;
    default:
      return null;
  }
}

export function VerticalLiveToolsMenu({
  micOn,
  screenSharing,
  mirrorOn,
  recording,
  notifyBusy,
  wishlistCount,
  lockActive,
  cameraDevices,
  cameraDeviceId,
  micDevices = [],
  micDeviceId,
  onInvite,
  onReel,
  onScreen,
  onMic,
  onCamera,
  onSelectCamera,
  onSelectMic,
  onMirror,
  onNotify,
  onWishlist,
  onLock,
  onWithdraw,
}: Props) {
  const [open, setOpen] = useState(false);
  const [cameraList, setCameraList] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setCameraList(false);
      return;
    }
    const onPointer = (event: PointerEvent) => {
      const node = rootRef.current;
      if (!node || node.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function run(id: VerticalLiveToolId) {
    if (id === 'camera' && cameraDevices.length > 1) {
      setCameraList((v) => !v);
      return;
    }
    switch (id) {
      case 'invite':
        onInvite();
        break;
      case 'reel':
        onReel();
        break;
      case 'screen':
        onScreen();
        break;
      case 'mic':
        onMic();
        break;
      case 'camera':
        onCamera();
        break;
      case 'mirror':
        onMirror();
        break;
      case 'notify':
        onNotify();
        break;
      case 'wishlist':
        onWishlist();
        break;
      case 'lock':
        onLock();
        break;
      case 'withdraw':
        onWithdraw();
        break;
      default:
        break;
    }
    setOpen(false);
  }

  function toolActive(id: VerticalLiveToolId) {
    if (id === 'mic') return !micOn;
    if (id === 'screen') return screenSharing;
    if (id === 'mirror') return mirrorOn;
    if (id === 'reel') return recording;
    if (id === 'notify') return notifyBusy;
    if (id === 'wishlist') return wishlistCount > 0;
    if (id === 'lock') return lockActive;
    return false;
  }

  function toolLabel(id: VerticalLiveToolId, label: string) {
    if (id === 'notify' && notifyBusy) return 'Avisando';
    if (id === 'reel' && recording) return 'Grabando';
    if (id === 'wishlist' && wishlistCount) return `Deseos (${wishlistCount})`;
    return label;
  }

  return (
    <div ref={rootRef} className={`lb-live-vtools${open ? ' is-open' : ''}`}>
      {open ? (
        <div className="lb-live-vtools-panel" role="menu" aria-label="Herramientas del live">
          <div className="lb-live-vtools-grid">
            {TOOLS.map((tool) => {
              const active = toolActive(tool.id);
              const disabled = (tool.id === 'notify' && notifyBusy) || (tool.id === 'reel' && recording);
              return (
                <button
                  key={tool.id}
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => run(tool.id)}
                  className={`lb-live-vtools-item is-${tool.tone}${active ? ' is-on' : ''}`}
                >
                  <span className="lb-live-vtools-icon">
                    <ToolIcon id={tool.id} micOn={micOn} />
                  </span>
                  <span>{toolLabel(tool.id, tool.label)}</span>
                </button>
              );
            })}
          </div>
          {cameraList && cameraDevices.length > 1 ? (
            <div className="lb-live-vtools-cams">
              {cameraDevices.map((device, index) => (
                <button
                  key={device.deviceId || `cam-${index}`}
                  type="button"
                  onClick={() => {
                    onSelectCamera(device.deviceId);
                    setOpen(false);
                  }}
                  className={cameraDeviceId === device.deviceId ? 'is-on' : ''}
                >
                  {device.label || `Cámara ${index + 1}`}
                </button>
              ))}
            </div>
          ) : null}
          {micDevices.length > 1 ? (
            <div className="lb-live-vtools-cams">
              {micDevices.map((device, index) => (
                <button
                  key={device.deviceId || `mic-${index}`}
                  type="button"
                  onClick={() => {
                    onSelectMic?.(device.deviceId);
                    setOpen(false);
                  }}
                  className={micDeviceId === device.deviceId ? 'is-on' : ''}
                >
                  {device.label || `Micrófono ${index + 1}`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="lb-live-vtools-fab"
        aria-label={open ? 'Cerrar herramientas' : 'Abrir herramientas'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={22} strokeWidth={2.4} />
      </button>
    </div>
  );
}

export function VerticalLiveCompactDock({
  viewersLabel,
  onViewers,
  onEnd,
}: {
  viewersLabel: ReactNode;
  onViewers: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="lb-live-vtools-dock">
      <button type="button" className="lb-live-vtools-dock-btn" onClick={onViewers}>
        {viewersLabel}
      </button>
      <button type="button" className="lb-live-vtools-dock-end" onClick={onEnd} aria-label="Finalizar live">
        <span />
      </button>
    </div>
  );
}
