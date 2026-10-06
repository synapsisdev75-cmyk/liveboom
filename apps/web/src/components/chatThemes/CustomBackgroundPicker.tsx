import { Camera, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  CHAT_BG_ACCEPT,
  ChatBackgroundError,
  processChatBackground,
  type ProcessedBackground,
} from '../../chatThemes/backgroundImage';
import type { ChatCustomBackground } from '../../chatThemes/types';
import { FlashBoomCameraCapture } from '../social/FlashBoomCameraCapture';

type Props = {
  value: ChatCustomBackground | null;
  onPicked: (processed: ProcessedBackground) => void;
  onEdit: () => void;
  onRemove: () => void;
};

/** «Mi fondo»: galería (Android, iOS, tablet, PC), cámara frontal/trasera o quitar. */
export function CustomBackgroundPicker({ value, onPicked, onEdit, onRemove }: Props) {
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const captureRef = useRef<HTMLInputElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onPicked(await processChatBackground(file));
    } catch (err) {
      setError(err instanceof ChatBackgroundError ? err.message : 'No se pudo usar esa imagen.');
    } finally {
      setBusy(false);
    }
  }

  function openCamera() {
    if (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      setCameraOpen(true);
      return;
    }
    captureRef.current?.click();
  }

  return (
    <div>
      {value ? (
        <div className="lb-cts__bg-current">
          <img src={value.thumb} alt="" className="lb-cts__bg-thumb" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Fondo personalizado activo</p>
            <p className="lb-cts__hint lb-cts__hint--flush">Se muestra sobre los colores del tema.</p>
          </div>
        </div>
      ) : null}
      <div className="lb-cts__chips">
        <button type="button" className="lb-cts__chip" disabled={busy} onClick={() => galleryRef.current?.click()}>
          <ImagePlus size={16} />
          Elegir de galería
        </button>
        <button type="button" className="lb-cts__chip" disabled={busy} onClick={openCamera}>
          <Camera size={16} />
          Tomar foto
        </button>
        {value ? (
          <>
            <button type="button" className="lb-cts__chip" disabled={busy} onClick={onEdit}>
              <Pencil size={16} />
              Ajustar
            </button>
            <button type="button" className="lb-cts__chip" disabled={busy} onClick={onRemove}>
              <Trash2 size={16} />
              Quitar fondo personalizado
            </button>
          </>
        ) : null}
      </div>
      {busy ? <p className="lb-cts__hint">Preparando imagen…</p> : null}
      {error ? <p className="lb-cts__error">{error}</p> : null}
      <p className="lb-cts__hint">JPG, PNG, WEBP o HEIC. Se optimiza y se quitan los datos de ubicación; tu foto original no se modifica.</p>
      <input
        ref={galleryRef}
        type="file"
        accept={CHAT_BG_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void handleFile(file);
        }}
      />
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void handleFile(file);
        }}
      />
      <FlashBoomCameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        title="Foto para el fondo del chat"
        allowPhoto
        allowVideo={false}
        defaultMode="photo"
        onCapture={(file) => {
          setCameraOpen(false);
          void handleFile(file);
        }}
      />
    </div>
  );
}
