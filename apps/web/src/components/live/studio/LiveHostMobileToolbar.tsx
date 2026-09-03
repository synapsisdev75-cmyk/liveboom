import {
  Coins,
  Gift,
  Lock,
  Megaphone,
  MonitorUp,
  Unlock,
  Users,
  Video,
  Circle,
} from 'lucide-react';
import { VsBattleIcon } from './VsBattleIcon';

type LockInfo = {
  giftName: string;
  emoji: string;
};

type Props = {
  notifyBusy: boolean;
  wishlistCount: number;
  lock: LockInfo | null;
  lockBusy: boolean;
  coinsEarned: number;
  screenSharing: boolean;
  recording: boolean;
  canPublish: boolean;
  videoInputs: MediaDeviceInfo[];
  cameraDeviceId: string;
  cameraPickerOpen: boolean;
  onNotify: () => void;
  onWishlist: () => void;
  onLockToggle: () => void;
  onUnlock: () => void;
  onWithdraw: () => void;
  onSalaBoom: () => void;
  onBatalla: () => void;
  onCameraPickerToggle: () => void;
  onSelectCamera: (deviceId: string) => void;
  onRecordReel: () => void;
  onScreenShare: () => void;
};

const btn =
  'inline-flex shrink-0 items-center gap-1 rounded-xl bg-black/60 px-2.5 py-2 text-[11px] font-semibold text-white backdrop-blur min-h-9';

/** Barra horizontal de herramientas del host — solo móvil/tablet */
export function LiveHostMobileToolbar({
  notifyBusy,
  wishlistCount,
  lock,
  lockBusy,
  coinsEarned,
  screenSharing,
  recording,
  canPublish,
  videoInputs,
  cameraDeviceId,
  cameraPickerOpen,
  onNotify,
  onWishlist,
  onLockToggle,
  onUnlock,
  onWithdraw,
  onSalaBoom,
  onBatalla,
  onCameraPickerToggle,
  onSelectCamera,
  onRecordReel,
  onScreenShare,
}: Props) {
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 z-20 lg:hidden"
      style={{ top: 'calc(max(0.75rem, env(safe-area-inset-top)) + 2.35rem)' }}
    >
      <div
        className="flex items-center gap-1.5 overflow-x-auto px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          disabled={notifyBusy}
          onClick={onNotify}
          className={`${btn} text-fuchsia-200 disabled:opacity-60`}
        >
          <Megaphone size={13} />
          {notifyBusy ? '…' : 'Avisar'}
        </button>
        <button
          type="button"
          onClick={onWishlist}
          className={`${btn} ${wishlistCount ? 'bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/40' : ''}`}
        >
          <Gift size={13} />
          Deseos{wishlistCount ? ` (${wishlistCount})` : ''}
        </button>
        <button
          type="button"
          disabled={lockBusy}
          onClick={onLockToggle}
          className={`${btn} ${lock ? 'bg-amber-500/30 text-amber-200 ring-1 ring-amber-400/50' : ''}`}
        >
          <Lock size={13} />
          {lock ? 'Privado' : 'Privado'}
        </button>
        {lock ? (
          <button
            type="button"
            disabled={lockBusy}
            onClick={onUnlock}
            className={`${btn} bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/40`}
          >
            <Unlock size={13} />
            Público
          </button>
        ) : null}
        <button type="button" onClick={onWithdraw} className={`${btn} text-cyan-200`}>
          <Coins size={13} />
          {coinsEarned.toLocaleString('es-CO')}
        </button>
        <button type="button" onClick={onSalaBoom} className={`${btn} text-cyan-200`}>
          <Users size={13} />
          Sala
        </button>
        <button type="button" onClick={onBatalla} className={`${btn} text-fuchsia-200`}>
          <VsBattleIcon size={14} /> Batalla
        </button>
        {canPublish && videoInputs.length > 1 ? (
          <div className="relative shrink-0">
            <button type="button" onClick={onCameraPickerToggle} className={btn}>
              <Video size={13} />
              Cámara
            </button>
            {cameraPickerOpen ? (
              <div className="absolute left-0 top-full z-40 mt-1 min-w-[12rem] rounded-xl border border-white/10 bg-zinc-950/98 p-2 shadow-xl">
                {videoInputs.map((device, index) => (
                  <button
                    key={device.deviceId || `cam-${index}`}
                    type="button"
                    onClick={() => onSelectCamera(device.deviceId)}
                    className={`block w-full rounded-lg px-2 py-1.5 text-left text-[11px] ${
                      cameraDeviceId === device.deviceId
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-zinc-200 hover:bg-white/5'
                    }`}
                  >
                    {device.label || `Cámara ${index + 1}`}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          disabled={recording}
          onClick={onRecordReel}
          className={`${btn} disabled:opacity-60`}
        >
          {recording ? (
            <Circle className="animate-pulse text-red-400" size={12} />
          ) : (
            <Video size={13} />
          )}
          {recording ? 'Grabando' : 'Reel 15s'}
        </button>
        <button
          type="button"
          onClick={onScreenShare}
          className={`${btn} ${
            screenSharing
              ? 'bg-emerald-500/35 text-emerald-100 ring-1 ring-emerald-400/50'
              : ''
          }`}
        >
          <MonitorUp size={13} />
          {screenSharing ? 'Pantalla on' : 'Pantalla'}
        </button>
      </div>
    </div>
  );
}
