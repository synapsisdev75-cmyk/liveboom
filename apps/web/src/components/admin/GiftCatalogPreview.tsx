import { useState, type CSSProperties } from 'react';
import type { EditableGift, GiftPlacement } from '../../lib/catalogConfigFirestore';
import { clampGiftAnimScale } from '../../lib/liveboomGifts';

const PLACEMENT_SHORT: Record<GiftPlacement, string> = {
  live: 'LIVE',
  post: 'Post',
  boom_clip: 'Clip',
  flashboom: 'Flash',
  call: 'Call',
  chat: 'Chat',
};

export type PreviewDevice = 'mobile' | 'tablet' | 'desktop';
export type PreviewBackdrop = 'checker' | 'light' | 'dark';

const DEVICE_META: Record<
  PreviewDevice,
  { label: string; frameW: number; frameH: number; scale: number }
> = {
  mobile: { label: 'Móvil', frameW: 390, frameH: 720, scale: 0.58 },
  tablet: { label: 'Tablet', frameW: 768, frameH: 900, scale: 0.42 },
  desktop: { label: 'Escritorio', frameW: 1280, frameH: 720, scale: 0.36 },
};

const BACKDROP_META: Record<PreviewBackdrop, { label: string; style: CSSProperties }> = {
  checker: {
    label: 'Cuadriculado',
    style: {
      backgroundColor: '#d4d4d8',
      backgroundImage:
        'linear-gradient(45deg, #a1a1aa 25%, transparent 25%), linear-gradient(-45deg, #a1a1aa 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #a1a1aa 75%), linear-gradient(-45deg, transparent 75%, #a1a1aa 75%)',
      backgroundSize: '16px 16px',
      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
    },
  },
  light: { label: 'Claro', style: { background: '#f4f4f5' } },
  dark: { label: 'Oscuro', style: { background: '#09090b' } },
};

type Props = {
  gift: EditableGift;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  onAnimScaleChange?: (scale: number) => void;
};

function faceTopPercent(gift: EditableGift): number {
  if (!gift.face) return 42;
  const base: Record<NonNullable<EditableGift['face']>['anchor'], number> = {
    hat: 18,
    crown: 12,
    glasses: 32,
    mask: 36,
    kiss: 52,
  };
  const raw = base[gift.face.anchor] + gift.face.offsetY * 18;
  return Math.min(78, Math.max(8, raw));
}

function faceSizeRem(gift: EditableGift): number {
  const scale = gift.face?.scale ?? 1;
  return Math.min(5.5, Math.max(1.4, 2.2 * scale));
}

/** Previsualización del regalo en marcos móvil / tablet / escritorio. */
export function GiftCatalogPreview({
  gift,
  device,
  onDeviceChange,
  onAnimScaleChange,
}: Props) {
  const meta = DEVICE_META[device];
  const displayW = Math.round(meta.frameW * meta.scale);
  const displayH = Math.round(meta.frameH * meta.scale);
  const mediaSrc = gift.video || gift.image;
  const isVideo = Boolean(gift.video);
  const faceTop = faceTopPercent(gift);
  const faceSize = faceSizeRem(gift);
  const [backdrop, setBackdrop] = useState<PreviewBackdrop>('checker');
  const animScale = clampGiftAnimScale(gift.animScale, gift.level);
  const mediaBox = {
    width: `${animScale * 100}%`,
    height: `${animScale * 100}%`,
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Previsualización
        </p>
        <div className="ml-auto flex flex-wrap gap-1">
          {(Object.keys(BACKDROP_META) as PreviewBackdrop[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setBackdrop(key)}
              className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold ${
                backdrop === key
                  ? 'bg-zinc-100 text-zinc-900 ring-1 ring-white/40'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {BACKDROP_META[key].label}
            </button>
          ))}
          {(Object.keys(DEVICE_META) as PreviewDevice[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onDeviceChange(key)}
              className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold ${
                device === key
                  ? 'bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {DEVICE_META[key].label}
            </button>
          ))}
        </div>
      </div>

      {onAnimScaleChange ? (
        <label className="block space-y-1 text-xs text-zinc-400">
          Escala animación en pantalla ({Math.round(animScale * 100)}%)
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.01}
            value={animScale}
            onChange={(e) =>
              onAnimScaleChange(clampGiftAnimScale(Number(e.target.value), gift.level))
            }
            className="w-full accent-fuchsia-400"
          />
          <span className="block text-[10px] text-zinc-500">
            Aplica en móvil, tablet y escritorio al publicar. 20% = pequeño · 100% = casi pantalla
            completa.
          </span>
        </label>
      ) : null}

      <div className="flex justify-center overflow-x-auto py-2">
        <div
          className="relative shrink-0 overflow-hidden rounded-[1.25rem] border border-zinc-600 bg-zinc-950 shadow-2xl shadow-black/50"
          style={{ width: displayW, height: displayH }}
        >
          <div className="absolute inset-0" style={BACKDROP_META[backdrop].style} />
          {backdrop === 'checker' ? (
            <div className="absolute inset-0 opacity-35">
              <div className="absolute left-1/2 top-[28%] h-[42%] w-[55%] -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-3xl" />
            </div>
          ) : null}

          <div className="absolute left-1/2 top-[22%] flex w-[42%] -translate-x-1/2 flex-col items-center">
            <div className="aspect-square w-full rounded-full bg-gradient-to-b from-zinc-600 to-zinc-800 ring-2 ring-white/10" />
            <div className="mt-2 h-16 w-[70%] rounded-2xl bg-zinc-800/80" />
          </div>

          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
            <div
              className="relative flex items-center justify-center"
              style={mediaBox}
            >
              <div className="pointer-events-none absolute inset-0 rounded-xl border border-dashed border-fuchsia-400/50" />
              {mediaSrc ? (
                isVideo ? (
                  <video
                    key={mediaSrc}
                    src={mediaSrc}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-contain drop-shadow-lg"
                  />
                ) : (
                  <img
                    src={mediaSrc}
                    alt=""
                    className="h-full w-full object-contain drop-shadow-lg"
                  />
                )
              ) : (
                <span className="text-5xl drop-shadow-lg" style={{ fontSize: Math.max(36, displayW * 0.14) }}>
                  {gift.emoji}
                </span>
              )}
            </div>
            <span className="mt-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              {gift.name} · {gift.coins} Blast
            </span>
          </div>

          {gift.face ? (
            <div
              className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${faceTop}%`, fontSize: `${faceSize * meta.scale * 1.6}rem` }}
              title={`Ancla: ${gift.face.anchor}`}
            >
              {gift.face.emoji || gift.emoji}
            </div>
          ) : null}

          <div className="absolute left-2 top-2 z-30 flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2 py-0.5 text-[9px] font-bold text-white">
            ● LIVE
          </div>
          <div className="absolute bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-black/55 p-2 backdrop-blur-md">
            <div className="mb-1 flex gap-1 overflow-hidden">
              {gift.placements.slice(0, 4).map((p) => (
                <span
                  key={p}
                  className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[8px] font-semibold text-cyan-100"
                >
                  {PLACEMENT_SHORT[p]}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-500/30 text-lg ring-1 ring-fuchsia-400/40">
                {gift.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold text-white">{gift.name}</p>
                <p className="truncate text-[9px] text-zinc-400">Nivel {gift.level} · catálogo</p>
              </div>
              <span className="rounded-lg bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-2 py-1 text-[9px] font-bold text-white">
                Enviar
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-zinc-500">
        Vista aproximada en {meta.label.toLowerCase()} ({meta.frameW}×{meta.frameH}). Publica para
        aplicar en la app.
      </p>
    </div>
  );
}
