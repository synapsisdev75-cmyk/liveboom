import { Camera, Loader2, RotateCcw, Settings } from 'lucide-react';
import { LIVE_CAMERA_STATUS_LABEL, type LiveCameraStatus } from '../../lib/liveMediaDevices';

type Props = {
  status: LiveCameraStatus;
  message?: string | null;
  onRetry?: () => void;
  /** Solo si el sistema permite abrir los ajustes de la app (APK). */
  onOpenSettings?: (() => void) | null;
};

/** Estado de la cámara sobre la vista previa: por qué se necesita y cómo resolverlo. */
export function CameraStatusPanel({ status, message, onRetry, onOpenSettings }: Props) {
  const requesting = status === 'requesting';
  const canRetry = status === 'available' || status === 'denied' || status === 'busy' || status === 'hardware';
  return (
    <div className="lb-camera-status px-4 text-center" role="status" aria-live="polite">
      {requesting ? (
        <Loader2 className="mx-auto animate-spin text-zinc-400" size={32} />
      ) : (
        <Camera className="mx-auto text-zinc-500" size={32} />
      )}
      <p className="mt-2 text-sm font-semibold text-zinc-200">{LIVE_CAMERA_STATUS_LABEL[status]}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-400">
        {message ||
          (requesting
            ? 'Acepta el permiso de cámara para ver tu vista previa.'
            : 'LiveBoom usa la cámara solo para mostrar tu video en el directo.')}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {status === 'blocked' && onOpenSettings ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-cyan-500 px-4 text-sm font-bold text-zinc-950"
          >
            <Settings size={16} /> Abrir configuración
          </button>
        ) : null}
        {(canRetry || status === 'blocked') && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 px-4 text-sm font-semibold text-white"
          >
            <RotateCcw size={16} /> {status === 'available' ? 'Activar cámara' : 'Reintentar'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
