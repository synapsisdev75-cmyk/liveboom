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
  Swords,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { VsBattleIcon } from './VsBattleIcon';

export type VerticalLiveToolId =
  | 'invite'
  | 'vs'
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
  /** Oculta Compartir pantalla (móvil / Espacio Gaming). */
  hideScreenShare?: boolean;
  /** Oculta Cámara durante Mobile Gaming Screen Share. */
  hideCamera?: boolean;
  /** Etiqueta del tool screen (ej. Presentar en Espacio Gaming). */
  screenToolLabel?: string;
  onInvite: () => void;
  onVs?: () => void;
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
  { id: 'vs', label: 'Crear VS', tone: 'fuchsia' },
  { id: 'screen', label: 'Pantalla', tone: 'cyan' },
  { id: 'mic', label: 'Micrófono', tone: 'emerald' },
  { id: 'camera', label: 'Cámara', tone: 'amber' },
  { id: 'mirror', label: 'Espejo', tone: 'lavender' },
  { id: 'notify', label: 'Avisar', tone: 'rose' },
  { id: 'wishlist', label: 'Deseos', tone: 'cyan' },
  { id: 'lock', label: 'Candado', tone: 'gold' },
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

const TOGGLE_IDS = new Set<VerticalLiveToolId>(['mic', 'camera', 'mirror', 'screen', 'lock']);
const KEEP_OPEN_IDS = new Set<VerticalLiveToolId>(['camera', 'mirror', 'screen']);
const ICON_SIZE = 22;
const TAP_GUARD_MS = 220;

function ToolIcon({
  id,
  micOn,
  cameraOn,
}: {
  id: VerticalLiveToolId;
  micOn: boolean;
  cameraOn: boolean;
}) {
  switch (id) {
    case 'invite':
      return <Users size={ICON_SIZE} />;
    case 'vs':
      return <VsBattleIcon size={ICON_SIZE} />;
    case 'screen':
      return <MonitorUp size={ICON_SIZE} />;
    case 'mic':
      return micOn ? <Mic size={ICON_SIZE} /> : <MicOff size={ICON_SIZE} />;
    case 'camera':
      return cameraOn ? <Camera size={ICON_SIZE} /> : <CameraOff size={ICON_SIZE} />;
    case 'mirror':
      return <FlipHorizontal size={ICON_SIZE} />;
    case 'notify':
      return <Megaphone size={ICON_SIZE} />;
    case 'wishlist':
      return <Gift size={ICON_SIZE} />;
    case 'lock':
      return <Lock size={ICON_SIZE} />;
    case 'reel':
      return <Clapperboard size={ICON_SIZE} />;
    case 'withdraw':
      return <Coins size={ICON_SIZE} />;
    default:
      return <Swords size={ICON_SIZE} />;
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
  hideScreenShare = false,
  hideCamera = false,
  screenToolLabel,
  onInvite,
  onVs,
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
  const lastTapRef = useRef(0);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const node = rootRef.current;
      if (!node || node.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const modal = document.querySelector('[aria-modal="true"], dialog[open]');
      if (modal && !rootRef.current?.contains(modal)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function withSingleTap(fn: () => void) {
    const now = performance.now();
    if (now - lastTapRef.current < TAP_GUARD_MS) return;
    lastTapRef.current = now;
    fn();
  }

  function run(id: VerticalLiveToolId) {
    switch (id) {
      case 'invite':
        onInvite();
        break;
      case 'vs':
        onVs?.();
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
    if (!KEEP_OPEN_IDS.has(id)) setOpen(false);
  }

  function toolOn(id: VerticalLiveToolId) {
    if (id === 'mic') return micOn;
    if (id === 'camera') return cameraOn;
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
    if (id === 'screen' && screenSharing) return screenToolLabel ? `${screenToolLabel} ON` : 'Pantalla ON';
    if (id === 'screen' && screenToolLabel) return screenToolLabel;
    return label;
  }

  const tools = [
    ...TOOLS.filter((tool) => {
      if (tool.id === 'vs') return Boolean(onVs);
      if (tool.id === 'screen') return !hideScreenShare;
      if (tool.id === 'camera') return !hideCamera;
      return true;
    }),
    ...(onReel ? [REEL_TOOL] : []),
    ...(onWithdraw ? [WITHDRAW_TOOL] : []),
  ];

  return (
    <div ref={rootRef} className={`lb-live-vtools${open ? ' is-open' : ''}`}>
      <div
        id={panelId}
        className="lb-live-vtools-panel"
        role="group"
        aria-label="Herramientas del live"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="lb-live-vtools-grid">
          {tools.map((tool) => {
            const active = toolOn(tool.id);
            const disabled = tool.id === 'notify' && notifyBusy;
            const isToggle = TOGGLE_IDS.has(tool.id);
            return (
              <button
                key={tool.id}
                type="button"
                disabled={disabled}
                tabIndex={open ? 0 : -1}
                aria-pressed={isToggle ? active : undefined}
                aria-busy={tool.id === 'notify' && notifyBusy ? true : undefined}
                onClick={() => withSingleTap(() => run(tool.id))}
                className={`lb-live-vtools-item is-${tool.tone}${active ? ' is-on' : ''}${
                  isToggle && !active ? ' is-off' : ''
                }${tool.id === 'lock' ? ' is-lock' : ''}`}
              >
                <span className="lb-live-vtools-icon" aria-hidden>
                  <ToolIcon id={tool.id} micOn={micOn} cameraOn={cameraOn} />
                </span>
                <span className="lb-live-vtools-label">{toolLabel(tool.id, tool.label)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="lb-live-vtools-fab"
        aria-label={open ? 'Cerrar herramientas' : 'Abrir herramientas'}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        onClick={() => withSingleTap(() => setOpen((v) => !v))}
      >
        <span className="lb-live-vtools-fab-glyph is-plus" aria-hidden>
          <Plus size={22} strokeWidth={2.5} />
        </span>
        <span className="lb-live-vtools-fab-glyph is-close" aria-hidden>
          <X size={22} strokeWidth={2.5} />
        </span>
      </button>
    </div>
  );
}
