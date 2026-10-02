import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Bold, ImagePlus, Italic, Loader2, Scissors, Underline, Wand2 } from 'lucide-react';
import {
  applyMask,
  maskAtPoint,
  maskCoverage,
  maskPeople,
  type AlphaMask,
} from '../../lib/stickerBackground';

const OUT = 512;
const SOURCE_MAX_EDGE = 1024;
const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Lobster&family=Pacifico&family=Permanent+Marker&display=swap';

const FONTS = [
  { id: 'clasica', label: 'Clásica', family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'comic', label: 'Cómic', family: '"Bangers", "Comic Sans MS", cursive' },
  { id: 'impacto', label: 'Impacto', family: '"Anton", Impact, "Arial Black", sans-serif' },
  { id: 'manuscrita', label: 'Manuscrita', family: '"Pacifico", "Brush Script MT", cursive' },
  { id: 'elegante', label: 'Elegante', family: '"Lobster", Georgia, serif' },
  { id: 'marcador', label: 'Marcador', family: '"Permanent Marker", "Comic Sans MS", cursive' },
  { id: 'maquina', label: 'Máquina', family: '"Courier New", ui-monospace, monospace' },
] as const;
type FontId = (typeof FONTS)[number]['id'];

const COLORS = ['#ffffff', '#111111', '#facc15', '#f472b6', '#22d3ee', '#ef4444', '#4ade80', '#a855f7'];

type BgMode = 'original' | 'auto' | 'touch';
type Box = { x: number; y: number; w: number; h: number };
type Fit = { bx: number; by: number; scale: number; dx: number; dy: number };

type TextStyle = {
  text: string;
  font: FontId;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  outline: boolean;
  color: string;
  size: number;
  x: number;
  y: number;
};

let fontsRequested = false;
function ensureStickerFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (!fontsRequested) {
    fontsRequested = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_CSS;
    document.head.appendChild(link);
  }
  const families = ['Anton', 'Bangers', 'Lobster', 'Pacifico', 'Permanent Marker'];
  return Promise.all(families.map((family) => document.fonts.load(`48px "${family}"`).catch(() => [])))
    .then(() => undefined)
    .catch(() => undefined);
}

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() =>
    createImageBitmap(file),
  );
  const scale = Math.min(1, SOURCE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite editar imágenes.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

function alphaBounds(canvas: HTMLCanvasElement): Box {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: width, h: height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function fontFamily(id: FontId) {
  return FONTS.find((font) => font.id === id)?.family ?? FONTS[0].family;
}

function isDark(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}

function renderSticker(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement | null,
  bounds: Box | null,
  border: boolean,
  style: TextStyle,
): { fit: Fit | null; textBox: Box | null } {
  ctx.clearRect(0, 0, OUT, OUT);
  let fit: Fit | null = null;

  if (image && bounds) {
    const pad = OUT * (border ? 0.07 : 0.05);
    const scale = Math.min((OUT - pad * 2) / bounds.w, (OUT - pad * 2) / bounds.h);
    const dw = bounds.w * scale;
    const dh = bounds.h * scale;
    const dx = (OUT - dw) / 2;
    const dy = (OUT - dh) / 2;
    fit = { bx: bounds.x, by: bounds.y, scale, dx, dy };

    if (border) {
      const sil = document.createElement('canvas');
      sil.width = OUT;
      sil.height = OUT;
      const sctx = sil.getContext('2d');
      if (sctx) {
        sctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h, dx, dy, dw, dh);
        sctx.globalCompositeOperation = 'source-in';
        sctx.fillStyle = '#ffffff';
        sctx.fillRect(0, 0, OUT, OUT);
        const r = OUT * 0.022;
        for (let i = 0; i < 24; i++) {
          const angle = (i / 24) * Math.PI * 2;
          ctx.drawImage(sil, Math.cos(angle) * r, Math.sin(angle) * r);
        }
      }
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h, dx, dy, dw, dh);
  }

  const lines = style.text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, i, all) => line || i < all.length - 1)
    .slice(0, 3);
  if (!lines.some(Boolean)) return { fit, textBox: null };

  const px = Math.round(OUT * style.size);
  ctx.font = `${style.italic ? 'italic ' : ''}${style.bold ? '800' : '500'} ${px}px ${fontFamily(style.font)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const lineH = px * 1.18;
  const widths = lines.map((line) => ctx.measureText(line).width);
  const blockW = Math.min(OUT, Math.max(...widths) + px * 0.4);
  const blockH = lineH * lines.length;
  const cx = Math.min(OUT - blockW / 2, Math.max(blockW / 2, style.x * OUT));
  const cy = Math.min(OUT - blockH / 2, Math.max(blockH / 2, style.y * OUT));
  const stroke = isDark(style.color) ? '#ffffff' : '#111111';

  lines.forEach((line, i) => {
    const y = cy - blockH / 2 + lineH * (i + 0.5);
    if (style.outline) {
      ctx.lineWidth = Math.max(3, px * 0.2);
      ctx.strokeStyle = stroke;
      ctx.strokeText(line, cx, y, OUT - 8);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(line, cx, y, OUT - 8);
    if (style.underline && line) {
      const w = Math.min(widths[i] ?? 0, OUT - 8);
      const uy = y + px * 0.5;
      const uh = Math.max(2, px * 0.07);
      if (style.outline) {
        ctx.fillStyle = stroke;
        ctx.fillRect(cx - w / 2 - uh, uy - uh, w + uh * 2, uh * 3);
      }
      ctx.fillStyle = style.color;
      ctx.fillRect(cx - w / 2, uy, w, uh);
    }
  });

  return { fit, textBox: { x: cx - blockW / 2, y: cy - blockH / 2, w: blockW, h: blockH } };
}

type Props = {
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void>;
};

export function StickerCreator({ onCancel, onSave }: Props) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [mask, setMask] = useState<AlphaMask | null>(null);
  const [bgMode, setBgMode] = useState<BgMode>('original');
  const [border, setBorder] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  const [style, setStyle] = useState<TextStyle>({
    text: '',
    font: 'comic',
    bold: true,
    italic: false,
    underline: false,
    outline: true,
    color: '#ffffff',
    size: 0.12,
    x: 0.5,
    y: 0.86,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<{ fit: Fit | null; textBox: Box | null }>({ fit: null, textBox: null });
  const dragRef = useRef<{ id: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void ensureStickerFonts().then(() => {
      if (alive) setFontsTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  const cutout = useMemo(() => (source && mask ? applyMask(source, mask) : source), [source, mask]);
  const bounds = useMemo(() => (cutout ? alphaBounds(cutout) : null), [cutout]);

  useEffect(() => {
    const ctx = previewRef.current?.getContext('2d');
    if (!ctx) return;
    layoutRef.current = renderSticker(ctx, cutout, bounds, border, style);
  }, [cutout, bounds, border, style, fontsTick]);

  async function pickFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Elige una foto (JPG, PNG o WebP).');
      return;
    }
    setError(null);
    setBusy('Cargando foto…');
    try {
      const canvas = await fileToCanvas(file);
      setSource(canvas);
      setMask(null);
      setBgMode('original');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la foto.');
    } finally {
      setBusy(null);
    }
  }

  async function runAuto() {
    if (!source || busy) return;
    setBgMode('auto');
    setError(null);
    setBusy('Quitando fondo…');
    try {
      const next = await maskPeople(source);
      if (maskCoverage(next) < 0.02) {
        setMask(null);
        setBgMode('touch');
        setError('No encontré una persona. Toca en la foto lo que quieres conservar.');
        return;
      }
      setMask(next);
    } catch (err) {
      setBgMode('original');
      setError(err instanceof Error ? err.message : 'No se pudo quitar el fondo.');
    } finally {
      setBusy(null);
    }
  }

  async function runTouch(nx: number, ny: number) {
    if (!source || busy) return;
    setError(null);
    setBusy('Recortando…');
    try {
      const next = await maskAtPoint(source, nx, ny);
      if (maskCoverage(next) < 0.005) {
        setError('No pude separar eso. Toca más al centro del objeto.');
        return;
      }
      setMask(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo recortar.');
    } finally {
      setBusy(null);
    }
  }

  function toCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * OUT,
      y: ((event.clientY - rect.top) / rect.height) * OUT,
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = toCanvasPoint(event);
    const box = layoutRef.current.textBox;
    const slop = 18;
    if (
      box &&
      point.x >= box.x - slop &&
      point.x <= box.x + box.w + slop &&
      point.y >= box.y - slop &&
      point.y <= box.y + box.h + slop
    ) {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        id: event.pointerId,
        ox: point.x - (box.x + box.w / 2),
        oy: point.y - (box.y + box.h / 2),
      };
      return;
    }
    const fit = layoutRef.current.fit;
    if (bgMode === 'touch' && source && fit) {
      const sx = fit.bx + (point.x - fit.dx) / fit.scale;
      const sy = fit.by + (point.y - fit.dy) / fit.scale;
      if (sx < 0 || sy < 0 || sx > source.width || sy > source.height) return;
      void runTouch(sx / source.width, sy / source.height);
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const point = toCanvasPoint(event);
    setStyle((current) => ({
      ...current,
      x: Math.min(1, Math.max(0, (point.x - drag.ox) / OUT)),
      y: Math.min(1, Math.max(0, (point.y - drag.oy) / OUT)),
    }));
  }

  function endDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  }

  async function save() {
    if (busy || (!source && !style.text.trim())) return;
    setError(null);
    setBusy('Guardando sticker…');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Tu navegador no permite crear el sticker.');
      renderSticker(ctx, cutout, bounds, border, style);
      let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92));
      if (!blob || blob.type !== 'image/webp') {
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      }
      if (!blob) throw new Error('No se pudo generar el sticker.');
      await onSave(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el sticker.');
    } finally {
      setBusy(null);
    }
  }

  const patch = (next: Partial<TextStyle>) => setStyle((current) => ({ ...current, ...next }));
  const canSave = Boolean(source || style.text.trim());
  const chip = (active: boolean) =>
    `min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold transition ${
      active ? 'bg-fuchsia-500 text-white' : 'bg-white/[0.06] text-zinc-300 hover:bg-white/10'
    }`;

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void pickFile(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />

      <div className="relative mx-auto w-full max-w-[min(100%,18rem)]">
        <canvas
          ref={previewRef}
          width={OUT}
          height={OUT}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`lb-sticker-creator__canvas block aspect-square w-full touch-none rounded-2xl ${
            bgMode === 'touch' && source ? 'cursor-crosshair' : ''
          }`}
          aria-label="Vista previa del sticker"
        />
        {!source && !style.text ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-fuchsia-400/45 text-center text-sm text-zinc-300"
          >
            <ImagePlus size={30} className="text-fuchsia-300" />
            <span className="font-semibold text-white">Sube una foto</span>
            <span className="px-6 text-xs text-zinc-400">o escribe un texto abajo para un sticker solo de letras</span>
          </button>
        ) : null}
        {busy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/55 text-xs font-semibold text-white">
            <Loader2 size={22} className="animate-spin" />
            {busy}
          </div>
        ) : null}
      </div>

      {bgMode === 'touch' && source && !busy ? (
        <p className="text-center text-[11px] font-semibold text-cyan-300">
          Toca en la foto la persona, mascota u objeto que quieres conservar.
        </p>
      ) : null}
      {style.text && !busy ? (
        <p className="-mt-1 text-center text-[10px] text-zinc-500">Arrastra el texto para moverlo.</p>
      ) : null}

      {source ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Fondo</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => void runAuto()} className={chip(bgMode === 'auto')}>
              <span className="inline-flex items-center gap-1">
                <Wand2 size={13} /> Quitar fondo
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setBgMode('touch');
                setError(null);
              }}
              className={chip(bgMode === 'touch')}
            >
              <span className="inline-flex items-center gap-1">
                <Scissors size={13} /> Tocar objeto
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMask(null);
                setBgMode('original');
              }}
              className={chip(bgMode === 'original')}
            >
              Original
            </button>
            <button type="button" onClick={() => setBorder((value) => !value)} className={chip(border)}>
              Borde blanco
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} className={chip(false)}>
              Cambiar foto
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Texto</p>
        <textarea
          value={style.text}
          onChange={(event) => patch({ text: event.target.value.slice(0, 60) })}
          rows={2}
          maxLength={60}
          placeholder="Escribe algo (opcional)"
          className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-fuchsia-400/60"
        />
        <div className="mt-2 flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FONTS.map((font) => (
            <button
              key={font.id}
              type="button"
              onClick={() => patch({ font: font.id })}
              className={chip(style.font === font.id)}
              style={{ fontFamily: font.family }}
            >
              {font.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => patch({ bold: !style.bold })}
            className={`${chip(style.bold)} w-11 px-0`}
            aria-label="Negrita"
            aria-pressed={style.bold}
          >
            <Bold size={15} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => patch({ italic: !style.italic })}
            className={`${chip(style.italic)} w-11 px-0`}
            aria-label="Cursiva"
            aria-pressed={style.italic}
          >
            <Italic size={15} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => patch({ underline: !style.underline })}
            className={`${chip(style.underline)} w-11 px-0`}
            aria-label="Subrayado"
            aria-pressed={style.underline}
          >
            <Underline size={15} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => patch({ outline: !style.outline })}
            className={chip(style.outline)}
            aria-pressed={style.outline}
          >
            Contorno
          </button>
          <label className="ml-auto flex min-h-11 min-w-[8rem] flex-1 items-center gap-2 text-[11px] text-zinc-400">
            Tamaño
            <input
              type="range"
              min={0.06}
              max={0.22}
              step={0.01}
              value={style.size}
              onChange={(event) => patch({ size: Number(event.target.value) })}
              className="min-w-0 flex-1 accent-fuchsia-500"
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => patch({ color })}
              className={`h-9 w-9 rounded-full border-2 transition ${
                style.color === color ? 'scale-110 border-fuchsia-400' : 'border-white/20'
              }`}
              style={{ background: color }}
              aria-label={`Color ${color}`}
              aria-pressed={style.color === color}
            />
          ))}
        </div>
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={Boolean(busy)}
          className="min-h-11 flex-1 rounded-xl bg-white/[0.08] text-sm font-semibold text-zinc-200 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={Boolean(busy) || !canSave}
          className="min-h-11 flex-[2] rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-sm font-bold text-white disabled:opacity-50"
        >
          Guardar sticker
        </button>
      </div>
    </div>
  );
}
