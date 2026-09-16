import { Mic, MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { useState } from 'react';

export type ScreenShareTarget = 'full_display' | 'single_app';

export type ScreenShareWizardResult = {
  /** Android decide app vs pantalla en el diálogo del sistema. */
  target: ScreenShareTarget;
  microphoneEnabled: boolean;
  deviceAudioEnabled: boolean;
};

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: ScreenShareWizardResult) => void;
};

/**
 * Solo audio antes de MediaProjection.
 * No duplicar “pantalla vs app”: Android lo pregunta en su diálogo nativo.
 */
export function LiveScreenShareWizard({ open, onCancel, onConfirm }: Props) {
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [deviceAudioEnabled, setDeviceAudioEnabled] = useState(true);

  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[80] flex items-end justify-center bg-black/55 sm:items-center sm:px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-ss-wizard-title"
        className="flex max-h-[min(92dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/12 bg-[#0c0d12] shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full text-zinc-300 hover:bg-white/5"
            aria-label="Cerrar"
            onClick={onCancel}
          >
            <X size={18} />
          </button>
          <h2 id="lb-ss-wizard-title" className="text-sm font-bold text-white">
            Configurar audio
          </h2>
          <span className="w-11" aria-hidden />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-violet-500/20 text-violet-300">
            <Mic size={26} />
          </div>
          <p className="text-center text-sm font-semibold text-white">¿Cómo quieres el audio?</p>
          <p className="mt-1 text-center text-[11px] text-zinc-400">
            Luego Android te pedirá permiso y podrás elegir una app o toda la pantalla.
          </p>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => setMicrophoneEnabled((v) => !v)}
              className={`flex w-full min-h-14 items-start gap-3 rounded-2xl border px-3 py-3 text-left ${
                microphoneEnabled
                  ? 'border-emerald-400/50 bg-emerald-500/10'
                  : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              {microphoneEnabled ? (
                <Mic className="mt-0.5 shrink-0 text-emerald-300" size={18} />
              ) : (
                <MicOff className="mt-0.5 shrink-0 text-zinc-400" size={18} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">Micrófono</span>
                <span className="mt-0.5 block text-[11px] text-zinc-400">
                  Tu voz se transmitirá en el LIVE.
                </span>
              </span>
              <span className="text-[11px] font-bold text-zinc-300">
                {microphoneEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDeviceAudioEnabled((v) => !v)}
              className={`flex w-full min-h-14 items-start gap-3 rounded-2xl border px-3 py-3 text-left ${
                deviceAudioEnabled
                  ? 'border-cyan-400/50 bg-cyan-500/10'
                  : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              {deviceAudioEnabled ? (
                <Volume2 className="mt-0.5 shrink-0 text-cyan-300" size={18} />
              ) : (
                <VolumeX className="mt-0.5 shrink-0 text-zinc-400" size={18} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">Audio del dispositivo</span>
                <span className="mt-0.5 block text-[11px] text-zinc-400">
                  Comparte el audio del juego o app cuando Android lo permita.
                </span>
              </span>
              <span className="text-[11px] font-bold text-zinc-300">
                {deviceAudioEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] leading-snug text-zinc-400">
            Tu voz tiene prioridad: el audio del juego se baja un poco al hablar y vuelve solo.
          </p>
        </div>

        <div className="border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-violet-500 text-sm font-bold text-white"
            onClick={() =>
              onConfirm({
                target: 'full_display',
                microphoneEnabled,
                deviceAudioEnabled,
              })
            }
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
