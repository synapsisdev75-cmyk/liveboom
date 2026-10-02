import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, LayoutGrid, X } from 'lucide-react';
import { mediaKindFromFile } from '../../lib/mediaFile';

const COLLAGE_MIN = 2;
const COLLAGE_MAX = 9;
const OUT_W = 1440;

type Rect = [x: number, y: number, w: number, h: number];
type CollageLayout = { id: string; rects: Rect[] };
type Photo = { id: string; file: File; url: string };

const ASPECTS = [
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 5 / 4 },
  { id: '9:16', label: '9:16', ratio: 16 / 9 },
] as const;
type AspectId = (typeof ASPECTS)[number]['id'];

const BACKGROUNDS = ['#ffffff', '#000000', '#18181b', '#f5d0fe', '#fde68a', '#a5f3fc'];
const GAPS = [
  { id: 0, label: 'Sin' },
  { id: 12, label: 'Fino' },
  { id: 28, label: 'Medio' },
  { id: 48, label: 'Ancho' },
];

/** Filas apiladas; cada número = fotos en esa fila. */
const PRESETS: Record<number, number[][]> = {
  2: [[2], [1, 1]],
  3: [[1, 2], [2, 1], [3]],
  4: [[2, 2], [1, 3], [3, 1]],
  5: [[2, 3], [3, 2], [1, 2, 2]],
  6: [[3, 3], [2, 2, 2], [1, 2, 3]],
  7: [[2, 3, 2], [3, 4], [1, 3, 3]],
  8: [[2, 3, 3], [4, 4], [3, 2, 3]],
  9: [[3, 3, 3], [2, 3, 4], [4, 1, 4]],
};

function rowsLayout(counts: number[]): Rect[] {
  const rh = 1 / counts.length;
  return counts.flatMap((count, row) =>
    Array.from({ length: count }, (_, col): Rect => [col / count, row * rh, 1 / count, rh]),
  );
}

function layoutsFor(n: number): CollageLayout[] {
  const presets = PRESETS[n];
  if (!presets) return [];
  const seen = new Set<string>();
  const out: CollageLayout[] = [];
  const push = (id: string, rects: Rect[]) => {
    const key = rects
      .map((r) => r.map((v) => v.toFixed(3)).join(','))
      .sort()
      .join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id, rects });
  };
  presets.forEach((counts, i) => {
    const rows = rowsLayout(counts);
    push(`r${i}`, rows);
    push(`c${i}`, rows.map(([x, y, w, h]): Rect => [y, x, h, w]));
  });
  return out;
}

function cellBox(rect: Rect, width: number, height: number, gap: number) {
  const [x, y, w, h] = rect;
  const innerW = width - gap;
  const innerH = height - gap;
  return {
    left: gap / 2 + x * innerW + gap / 2,
    top: gap / 2 + y * innerH + gap / 2,
    width: Math.max(1, w * innerW - gap),
    height: Math.max(1, h * innerH - gap),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer una de las fotos.'));
    img.src = url;
  });
}

async function renderCollage(
  photos: Photo[],
  layout: CollageLayout,
  ratio: number,
  gap: number,
  background: string,
): Promise<File> {
  const width = OUT_W;
  const height = Math.round(OUT_W * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite crear el collage.');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  const images = await Promise.all(photos.map((photo) => loadImage(photo.url)));
  layout.rects.forEach((rect, i) => {
    const img = images[i];
    if (!img) return;
    const box = cellBox(rect, width, height, gap);
    const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const sw = box.width / scale;
    const sh = box.height / scale;
    const sx = (img.naturalWidth - sw) / 2;
    const sy = (img.naturalHeight - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, box.left, box.top, box.width, box.height);
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('No se pudo generar el collage.');
  return new File([blob], `collage-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

let photoSeq = 0;
function toPhoto(file: File): Photo {
  photoSeq += 1;
  return { id: `cp${photoSeq}`, file, url: URL.createObjectURL(file) };
}

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (file: File) => void;
  /** Fotos ya adjuntas en el compositor (se precargan). */
  initialFiles?: File[];
  defaultAspect?: AspectId;
};

export function CollageMakerSheet({ open, onClose, onApply, initialFiles, defaultAspect = '4:5' }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [layoutId, setLayoutId] = useState('r0');
  const [aspect, setAspect] = useState<AspectId>(defaultAspect);
  const [gap, setGap] = useState(12);
  const [background, setBackground] = useState<string>('#ffffff');
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<Photo[]>([]);
  photosRef.current = photos;

  useEffect(() => {
    if (!open) return;
    const seed = (initialFiles ?? [])
      .filter((file) => mediaKindFromFile(file) === 'photo')
      .slice(0, COLLAGE_MAX)
      .map(toPhoto);
    setPhotos(seed);
    setAspect(defaultAspect);
    setLayoutId('r0');
    setSelected(null);
    setError(null);
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.url);
      setPhotos([]);
    };
    // Solo al abrir: las fotos del compositor se copian una vez.
  }, [open]);

  const layouts = useMemo(() => layoutsFor(photos.length), [photos.length]);
  const layout = layouts.find((item) => item.id === layoutId) ?? layouts[0] ?? null;
  const ratio = ASPECTS.find((item) => item.id === aspect)?.ratio ?? 1;
  const outH = Math.round(OUT_W * ratio);

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).filter((file) => mediaKindFromFile(file) === 'photo');
    if (picked.length === 0) {
      setError('Elige fotos (JPG, PNG o WebP).');
      return;
    }
    const room = Math.max(0, COLLAGE_MAX - photos.length);
    setError(picked.length > room ? `Máximo ${COLLAGE_MAX} fotos por collage.` : null);
    const added = picked.slice(0, room).map(toPhoto);
    setPhotos((current) => [...current, ...added]);
    setSelected(null);
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((photo) => photo.id !== id);
    });
    setSelected(null);
  }

  function tapCell(index: number) {
    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected !== index) {
      setPhotos((current) => {
        const next = [...current];
        const a = next[selected];
        const b = next[index];
        if (a && b) {
          next[selected] = b;
          next[index] = a;
        }
        return next;
      });
    }
    setSelected(null);
  }

  async function apply() {
    if (!layout || photos.length < COLLAGE_MIN || busy) return;
    setBusy(true);
    setError(null);
    try {
      const file = await renderCollage(photos, layout, ratio, gap, background);
      onApply(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el collage.');
    } finally {
      setBusy(false);
    }
  }

  if (!open || typeof document === 'undefined') return null;

  const canAddMore = photos.length < COLLAGE_MAX;

  return createPortal(
    <div
      className="lb-msg-overlay fixed inset-0 z-[120] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[min(92dvh,48rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-amber-400/35 bg-zinc-950 pb-[max(0.75rem,var(--lb-safe-bottom))] sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-amber-200">
            <LayoutGrid size={16} />
            Collage
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white disabled:opacity-50"
            aria-label="Cerrar collage"
          >
            <X size={16} />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3 md:flex-row md:gap-4">
          <div className="flex min-w-0 flex-1 items-center justify-center rounded-2xl bg-white/[0.03] p-2">
            {layout && photos.length >= COLLAGE_MIN ? (
              <div
                className="relative w-full overflow-hidden rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
                style={{
                  aspectRatio: `${OUT_W} / ${outH}`,
                  maxWidth: `min(100%, calc(min(46dvh, 30rem) / ${ratio}))`,
                  background,
                }}
              >
                {layout.rects.map((rect, i) => {
                  const photo = photos[i];
                  if (!photo) return null;
                  const box = cellBox(rect, OUT_W, outH, gap);
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => tapCell(i)}
                      className={`absolute overflow-hidden transition ${
                        selected === i ? 'z-10 ring-4 ring-amber-400' : ''
                      }`}
                      style={{
                        left: `${(box.left / OUT_W) * 100}%`,
                        top: `${(box.top / outH) * 100}%`,
                        width: `${(box.width / OUT_W) * 100}%`,
                        height: `${(box.height / outH) * 100}%`,
                      }}
                      aria-label={`Foto ${i + 1}${selected === i ? ' (seleccionada)' : ''}`}
                    >
                      <img
                        src={photo.url}
                        alt=""
                        draggable={false}
                        className="h-full w-full select-none object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex min-h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-amber-400/40 px-4 text-center text-sm text-zinc-300"
              >
                <ImagePlus size={28} className="text-amber-300" />
                <span className="font-semibold text-white">Elige de {COLLAGE_MIN} a {COLLAGE_MAX} fotos</span>
                <span className="text-xs text-zinc-400">
                  {photos.length === 1 ? 'Añade al menos una foto más.' : 'Toca para abrir tu galería.'}
                </span>
              </button>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-3 md:w-[17rem] md:shrink-0">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Fotos ({photos.length}/{COLLAGE_MAX})
              </p>
              <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white/5">
                    <img src={photo.url} alt="" className="h-full w-full object-cover" draggable={false} />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-bl-lg bg-black/70 text-white"
                      aria-label="Quitar foto"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {canAddMore ? (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-dashed border-amber-400/50 text-amber-300"
                    aria-label="Añadir fotos"
                  >
                    <ImagePlus size={18} />
                  </button>
                ) : null}
              </div>
            </div>

            {layouts.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Diseño</p>
                <div className="grid grid-cols-6 gap-1.5 md:grid-cols-4">
                  {layouts.map((item) => {
                    const active = item.id === layout?.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setLayoutId(item.id)}
                        className={`relative aspect-square min-h-11 rounded-lg border p-1 transition ${
                          active ? 'border-amber-400 bg-amber-400/15' : 'border-white/10 bg-white/[0.04]'
                        }`}
                        aria-label="Diseño de collage"
                        aria-pressed={active}
                      >
                        <span className="relative block h-full w-full">
                          {item.rects.map((rect, i) => (
                            <span
                              key={i}
                              className={`absolute rounded-[2px] ${active ? 'bg-amber-300' : 'bg-zinc-400/70'}`}
                              style={{
                                left: `calc(${rect[0] * 100}% + 1px)`,
                                top: `calc(${rect[1] * 100}% + 1px)`,
                                width: `calc(${rect[2] * 100}% - 2px)`,
                                height: `calc(${rect[3] * 100}% - 2px)`,
                              }}
                            />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {photos.length >= COLLAGE_MIN ? (
                  <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">
                    Toca dos fotos del collage para intercambiarlas.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Formato</p>
                <div className="flex gap-1">
                  {ASPECTS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAspect(item.id)}
                      className={`min-h-11 flex-1 rounded-lg text-[11px] font-bold ${
                        aspect === item.id ? 'bg-amber-400 text-zinc-950' : 'bg-white/[0.06] text-zinc-300'
                      }`}
                      aria-pressed={aspect === item.id}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Espacio</p>
                <div className="flex gap-1">
                  {GAPS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setGap(item.id)}
                      className={`min-h-11 flex-1 rounded-lg px-0.5 text-[10px] font-bold ${
                        gap === item.id ? 'bg-amber-400 text-zinc-950' : 'bg-white/[0.06] text-zinc-300'
                      }`}
                      aria-pressed={gap === item.id}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Fondo</p>
              <div className="flex flex-wrap gap-2">
                {BACKGROUNDS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBackground(color)}
                    className={`h-11 w-11 rounded-full border-2 transition ${
                      background === color ? 'border-amber-400 scale-105' : 'border-white/15'
                    }`}
                    style={{ background: color }}
                    aria-label={`Fondo ${color}`}
                    aria-pressed={background === color}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {error ? <p className="shrink-0 px-4 pb-1 text-xs text-rose-300">{error}</p> : null}

        <div className="flex shrink-0 gap-2 border-t border-white/10 px-4 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 flex-1 rounded-xl bg-white/[0.08] text-sm font-semibold text-zinc-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy || !layout || photos.length < COLLAGE_MIN}
            className="min-h-11 flex-[2] rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-sm font-bold text-zinc-950 disabled:opacity-50"
          >
            {busy ? 'Creando…' : 'Usar collage'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
