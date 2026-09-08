import {
  Camera,
  CameraOff,
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
import { useEffect, useRef, useState } from 'react';

export type VerticalLiveToolId =
  | 'invite'
  | 'screen'
  | 'mic'
  | 'camera'
  | 'mirror'
  | 'notify'
  | 'wishlist'
  | 'lock'
  | 'reel'
  | 'withdraw';

type Props = {
  micOn: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  mirrorOn: boolean;
  notifyBusy: boolean;
  wishlistCount: number;
  lockActive: boolean;
  onInvite: () => void;
  onScreen: () => void;
  onMic: () => void;
  onCamera: () => void;
  onMirror: () => void;
  onNotify: () => void;
  onWishlist: () => void;
  onLock: () => void;
  onReel?: () => void;
  onWithdraw?: () => void;
};

const TOOLS: {
  id: VerticalLiveToolId;
  label: string;
  tone: string;
}[] = [
  { id: 'invite', label: 'Invitar', tone: 'violet' },
  { id: 'screen', label: 'Pantalla', tone: 'cyan' },
  { id: 'mic', label: 'Micrófono', tone: 'emerald' },
  { id: 'camera', label: 'Cámara', tone: 'amber' },
  { id: 'mirror', label: 'Espejo', tone: 'violet' },
  { id: 'notify', label: 'Avisar', tone: 'fuchsia' },
  { id: 'wishlist', label: 'Deseos', tone: 'cyan' },
  { id: 'lock', label: 'Privado', tone: 'gold' },
];

const REEL_TOOL: { id: VerticalLiveToolId; label: string; tone: string } = {
  id: 'reel',
  label: 'Reel',
  tone: 'rose',
};

const WITHDRAW_TOOL: { id: VerticalLiveToolId; label: string; tone: string } = {
  id: 'withdraw',
  label: 'Retirar',
  tone: 'cyan',
};

function ToolIcon({
  id,
  micOn,
  cameraOn,
}: {
  id: VerticalLiveToolId;
  micOn: boolean;
  cameraOn: boolean;
}) {
  const size = 18;
  switch (id) {
    case 'invite':
      return <Users size={size} />;
    case 'screen':
      return <MonitorUp size={size} />;
    case 'mic':
      return micOn ? <Mic size={size} /> : <MicOff size={size} />;
    case 'camera':
      return cameraOn ? <Camera size={size} /> : <CameraOff size={size} />;
    case 'mirror':
      return <FlipHorizontal size={size} />;
    case 'notify':
      return <Megaphone size={size} />;
    case 'wishlist':
      return <Gift size={size} />;
    case 'lock':
      return <Lock size={size} />;
    case 'reel':
      return <Clapperboard size={size} />;
    case 'withdraw':
      return <Coins size={size} />;
    default:
      return null;
  }
}

export function VerticalLiveToolsMenu({
  micOn,
  cameraOn,
  screenSharing,
  mirrorOn,
  notifyBusy,
  wishlistCount,
  lockActive,
  onInvite,
  onScreen,
  onMic,
  onCamera,
  onMirror,
  onNotify,
  onWishlist,
  onLock,
  onReel,
  onWithdraw,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
    switch (id) {
      case 'invite':
        onInvite();
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
      case 'reel':
        onReel?.();
        break;
      case 'withdraw':
        onWithdraw?.();
        break;
      default:
        break;
    }
    if (id !== 'camera' && id !== 'mirror' && id !== 'screen') setOpen(false);
  }

  function toolActive(id: VerticalLiveToolId) {
    if (id === 'mic') return !micOn;
    if (id === 'camera') return !cameraOn;
    if (id === 'screen') return screenSharing;
    if (id === 'mirror') return mirrorOn;
    if (id === 'notify') return notifyBusy;
    if (id === 'wishlist') return wishlistCount > 0;
    if (id === 'lock') return lockActive;
    return false;
  }

  function toolLabel(id: VerticalLiveToolId, label: string) {
    if (id === 'notify' && notifyBusy) return 'Avisando';
    if (id === 'camera') return cameraOn ? 'Cámara ON' : 'Cámara OFF';
    if (id === 'mirror') return mirrorOn ? 'Espejo ON' : 'Espejo OFF';
    if (id === 'wishlist' && wishlistCount) return `Deseos (${wishlistCount})`;
    if (id === 'screen' && screenSharing) return 'Pantalla ON';
    return label;
  }

  const tools = [
    ...TOOLS,
    ...(onReel ? [REEL_TOOL] : []),
    ...(onWithdraw ? [WITHDRAW_TOOL] : []),
  ];

  return (
    <div ref={rootRef} className={`lb-live-vtools${open ? ' is-open' : ''}`}>
      {open ? (
        <div className="lb-live-vtools-panel" role="menu" aria-label="Herramientas del live">
          <div className="lb-live-vtools-grid">
            {tools.map((tool) => {
              const active = toolActive(tool.id);
              const disabled = tool.id === 'notify' && notifyBusy;
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
                    <ToolIcon id={tool.id} micOn={micOn} cameraOn={cameraOn} />
                  </span>
                  <span>{toolLabel(tool.id, tool.label)}</span>
                </button>
              );
            })}
          </div>
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
