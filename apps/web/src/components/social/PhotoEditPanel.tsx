import { RotateCw } from 'lucide-react';
import type { PhotoCropAspect, PhotoEditValues } from '../../lib/photoEdit';

type Props = {
  value: PhotoEditValues;
  onChange: (next: PhotoEditValues) => void;
  onReset: () => void;
  onApply: () => void;
  applying?: boolean;
};

const CROPS: { id: PhotoCropAspect; label: string }[] = [
  { id: 'free', label: 'Libre' },
  { id: '1:1', label: '1:1' },
  { id: '4:5', label: '4:5' },
  { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' },
];

const SLIDERS: { key: keyof PhotoEditValues; label: string; min: number; max: number; suffix?: string }[] = [
  { key: 'zoom', label: 'Zoom', min: 100, max: 220, suffix: '%' },
  { key: 'brightness', label: 'Brillo', min: -80, max: 80 },
  { key: 'contrast', label: 'Contraste', min: -80, max: 80 },
  { key: 'saturation', label: 'Saturación', min: -80, max: 80 },
  { key: 'sharpness', label: 'Nitidez', min: 0, max: 80 },
  { key: 'warmth', label: 'Calidez', min: -80, max: 80 },
  { key: 'exposure', label: 'Exposición', min: -80, max: 80 },
  { key: 'shadows', label: 'Sombras', min: -80, max: 80 },
  { key: 'highlights', label: 'Luces', min: -80, max: 80 },
  { key: 'vignette', label: 'Viñeta', min: 0, max: 80 },
];

export function PhotoEditPanel({ value, onChange, onReset, onApply, applying }: Props) {
  function patch<K extends keyof PhotoEditValues>(key: K, next: PhotoEditValues[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <aside className="lb-photo-edit-panel flex min-h-0 w-full min-w-0 flex-col rounded-2xl border border-white/10 bg-zinc-950/90">
      <p className="shrink-0 px-3 pt-3 text-sm font-bold text-white">Editar foto</p>
      <div className="mt-2 flex shrink-0 flex-wrap gap-1.5 px-3">
        {CROPS.map((crop) => (
          <button
            key={crop.id}
            type="button"
            onClick={() => patch('crop', crop.id)}
            className={`inline-flex min-h-10 items-center rounded-full border px-2.5 text-[11px] font-semibold ${
              value.crop === crop.id
                ? 'border-fuchsia-400 bg-fuchsia-500/20 text-white'
                : 'border-white/15 text-zinc-300'
            }`}
          >
            {crop.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => patch('rotate', (value.rotate + 90) % 360)}
          className="inline-flex min-h-10 items-center gap-1 rounded-full border border-white/15 px-2.5 text-[11px] font-semibold text-zinc-200"
        >
          <RotateCw size={13} />
          Rotar
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-3">
        {SLIDERS.map((slider) => {
          const raw = value[slider.key];
          const current = typeof raw === 'number' ? raw : 0;
          return (
            <label key={slider.key} className="block">
              <span className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                {slider.label}
                <span className="tabular-nums text-zinc-300">
                  {current}
                  {slider.suffix || ''}
                </span>
              </span>
              <input
                type="range"
                min={slider.min}
                max={slider.max}
                value={current}
                onChange={(event) =>
                  patch(slider.key, Number(event.target.value) as PhotoEditValues[typeof slider.key])
                }
                className="lb-photo-slider w-full min-h-11"
              />
            </label>
          );
        })}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/15 text-xs font-semibold text-zinc-300"
        >
          Restablecer
        </button>
        <button
          type="button"
          disabled={applying}
          onClick={onApply}
          className="lb-photo-apply inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-xs font-bold text-white disabled:opacity-60"
        >
          {applying ? 'Aplicando…' : 'Aplicar'}
        </button>
      </div>
    </aside>
  );
}
