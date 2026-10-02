import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Bold,
  Clapperboard,
  ImagePlus,
  Italic,
  Loader2,
  Scissors,
  Smile,
  Sticker,
  Trash2,
  Underline,
  Wand2,
} from 'lucide-react';
import {
  applyMask,
  maskAtPoint,
  maskCentroid,
  maskCoverage,
  maskPeople,
  type AlphaMask,
} from '../../lib/stickerBackground';
import { COMPOSER_STICKERS, COMPOSER_STICKER_PACKS, type ComposerStickerPack } from '../../lib/composerStickers';
import { resolveEmoji } from '../../lib/liveboomEmojis';
import { resolveFlagIcon } from '../../lib/circleFlags';
import {
  ANIM_FPS,
  ANIM_MAX_SECONDS,
  ANIM_MIN_SECONDS,
  encodeTransparentGif,
  extractVideoFrames,
  frameSequence,
} from '../../lib/stickerVideo';
import { EmojiPickerButton } from './EmojiPicker';

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

/** Emoji o sticker encima del sticker. `src` = imagen same-origin; `char` = emoji unicode. */
type Deco = { id: string; src?: string; char?: string; x: number; y: number; size: number };

const DECO_MAX = 12;
const ANIM_OUT_SIZES = [320, 256, 200];
const ANIM_MAX_BYTES = 4.5 * 1024 * 1024;
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';
const DECO_PACKS = COMPOSER_STICKER_PACKS.filter((pack) =>
  COMPOSER_STICKERS.some((item) => item.pack === pack.id && item.kind === 'sticker' && item.src),
);

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

function drawDecos(
  ctx: CanvasRenderingContext2D,
  decos: Deco[],
  images: Map<string, HTMLImageElement>,
  selectedId: string | null,
): Map<string, Box> {
  const boxes = new Map<string, Box>();
  for (const deco of decos) {
    const side = OUT * deco.size;
    const cx = deco.x * OUT;
    const cy = deco.y * OUT;
    let box: Box | null = null;
    if (deco.src) {
      const img = images.get(deco.src);
      if (!img || !img.complete || !img.naturalWidth) continue;
      const ratio = img.naturalWidth / img.naturalHeight;
      const w = ratio >= 1 ? side : side * ratio;
      const h = ratio >= 1 ? side / ratio : side;
      box = { x: cx - w / 2, y: cy - h / 2, w, h };
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, box.x, box.y, w, h);
    } else if (deco.char) {
      ctx.font = `${Math.round(side * 0.86)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(deco.char, cx, cy);
      box = { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
    }
    if (!box) continue;
    boxes.set(deco.id, box);
    if (deco.id === selectedId) {
      ctx.save();
      ctx.setLineDash([10, 7]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#e879f9';
      ctx.strokeRect(box.x - 6, box.y - 6, box.w + 12, box.h + 12);
      ctx.restore();
    }
  }
  return boxes;
}

function renderSticker(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement | null,
  bounds: Box | null,
  border: boolean,
  style: TextStyle,
  decos: Deco[] = [],
  images: Map<string, HTMLImageElement> = new Map(),
  selectedId: string | null = null,
): { fit: Fit | null; textBox: Box | null; decoBoxes: Map<string, Box> } {
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

  const decoBoxes = drawDecos(ctx, decos, images, selectedId);

  const lines = style.text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, i, all) => line || i < all.length - 1)
    .slice(0, 3);
  if (!lines.some(Boolean)) return { fit, textBox: null, decoBoxes };

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

  return { fit, textBox: { x: cx - blockW / 2, y: cy - blockH / 2, w: blockW, h: blockH }, decoBoxes };
}

function unionBounds(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

type VideoDraft = { url: string; duration: number; start: number; length: number };

type Props = {
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void>;
  /** `video` = sticker con movimiento (recorte de video → GIF animado). */
  initialKind?: 'photo' | 'video';
};

export function StickerCreator({ onCancel, onSave, initialKind = 'photo' }: Props) {
  const [frames, setFrames] = useState<HTMLCanvasElement[]>([]);
  const [masks, setMasks] = useState<(AlphaMask | null)[] | null>(null);
  const [videoDraft, setVideoDraft] = useState<VideoDraft | null>(null);
  const [bounce, setBounce] = useState(false);
  const [frameTick, setFrameTick] = useState(0);
  const source = frames[0] ?? null;
  const animated = frames.length > 1;
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
  const [decos, setDecos] = useState<Deco[]>([]);
  const [selectedDeco, setSelectedDeco] = useState<string | null>(null);
  const [imagesTick, setImagesTick] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [decoPack, setDecoPack] = useState<ComposerStickerPack>(DECO_PACKS[0]?.id ?? 'clasicos');
  const decoPackItems = useMemo(
    () => COMPOSER_STICKERS.filter((item) => item.pack === decoPack && item.kind === 'sticker' && item.src),
    [decoPack],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const layoutRef = useRef<{ fit: Fit | null; textBox: Box | null; decoBoxes: Map<string, Box> }>({
    fit: null,
    textBox: null,
    decoBoxes: new Map(),
  });
  const dragRef = useRef<{ id: number; target: string; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void ensureStickerFonts().then(() => {
      if (alive) setFontsTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  const cutouts = useMemo(
    () =>
      frames.map((frame, i) => {
        const frameMask = masks?.[i];
        return frameMask ? applyMask(frame, frameMask) : frame;
      }),
    [frames, masks],
  );
  const bounds = useMemo(() => unionBounds(cutouts.map((canvas) => alphaBounds(canvas))), [cutouts]);
  const sequence = useMemo(() => frameSequence(cutouts.length, bounce), [cutouts.length, bounce]);
  const pickingObject = bgMode === 'touch' && !masks;
  const currentFrame = pickingObject
    ? (cutouts[0] ?? null)
    : (cutouts[sequence[frameTick % Math.max(1, sequence.length)] ?? 0] ?? null);

  useEffect(() => {
    if (!animated || busy || pickingObject) return;
    const timer = window.setInterval(() => setFrameTick((n) => n + 1), 1000 / ANIM_FPS);
    return () => window.clearInterval(timer);
  }, [animated, busy, pickingObject]);

  useEffect(() => {
    const ctx = previewRef.current?.getContext('2d');
    if (!ctx) return;
    layoutRef.current = renderSticker(
      ctx,
      currentFrame,
      bounds,
      border,
      style,
      decos,
      imagesRef.current,
      selectedDeco,
    );
  }, [currentFrame, bounds, border, style, fontsTick, decos, selectedDeco, imagesTick]);

  const draftUrl = videoDraft?.url ?? null;
  useEffect(() => {
    return () => {
      if (draftUrl) URL.revokeObjectURL(draftUrl);
    };
  }, [draftUrl]);

  function addDeco(next: Pick<Deco, 'src' | 'char'>) {
    if (decos.length >= DECO_MAX) {
      setError(`Máximo ${DECO_MAX} emojis o stickers por sticker.`);
      return;
    }
    if (next.src && !imagesRef.current.has(next.src)) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => setImagesTick((n) => n + 1);
      img.src = next.src;
      imagesRef.current.set(next.src, img);
    }
    const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const offset = (decos.length % 5) * 0.06;
    setDecos((current) => [
      ...current,
      { id, ...next, x: 0.3 + offset, y: 0.28 + offset, size: next.src ? 0.34 : 0.24 },
    ]);
    setSelectedDeco(id);
    setError(null);
  }

  function addEmoji(id: string) {
    const liveboom = resolveEmoji(id);
    if (liveboom) {
      addDeco({ src: liveboom.file });
      return;
    }
    const flag = resolveFlagIcon(id);
    addDeco(flag ? { src: flag.file } : { char: id });
  }

  function patchDeco(id: string, next: Partial<Deco>) {
    setDecos((current) => current.map((deco) => (deco.id === id ? { ...deco, ...next } : deco)));
  }

  function removeDeco(id: string) {
    setDecos((current) => current.filter((deco) => deco.id !== id));
    setSelectedDeco(null);
  }

  function openPicker(kind: 'photo' | 'video') {
    const input = inputRef.current;
    if (!input) return;
    input.accept = kind === 'video' ? 'video/*' : 'image/*';
    input.click();
  }

  async function pickFile(file: File | null) {
    if (!file) return;
    if (file.type.startsWith('video/')) {
      setError(null);
      setBusy('Cargando video…');
      const url = URL.createObjectURL(file);
      try {
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.muted = true;
        probe.playsInline = true;
        probe.src = url;
        await new Promise<void>((resolve, reject) => {
          probe.onloadedmetadata = () => resolve();
          probe.onerror = () => reject(new Error('No se pudo abrir este video. Prueba con MP4 o WebM.'));
        });
        const duration = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : ANIM_MAX_SECONDS;
        probe.removeAttribute('src');
        setVideoDraft({
          url,
          duration,
          start: 0,
          length: Math.max(Math.min(ANIM_MIN_SECONDS, duration), Math.min(3, duration)),
        });
      } catch (err) {
        URL.revokeObjectURL(url);
        setError(err instanceof Error ? err.message : 'No se pudo abrir el video.');
      } finally {
        setBusy(null);
      }
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Elige una foto (JPG, PNG o WebP) o un video.');
      return;
    }
    setError(null);
    setBusy('Cargando foto…');
    try {
      const canvas = await fileToCanvas(file);
      setFrames([canvas]);
      setMasks(null);
      setBgMode('original');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la foto.');
    } finally {
      setBusy(null);
    }
  }

  async function confirmClip() {
    const video = videoRef.current;
    if (!video || !videoDraft || busy) return;
    setError(null);
    setBusy('Preparando clip…');
    try {
      const next = await extractVideoFrames(video, videoDraft.start, videoDraft.length, ANIM_FPS, (done, total) =>
        setBusy(`Preparando clip ${done}/${total}…`),
      );
      setFrames(next);
      setMasks(null);
      setBgMode('original');
      setFrameTick(0);
      setVideoDraft(null);
    } catch (err) {
      setError(err instanceof Error && err.message !== 'timeout' ? err.message : 'No se pudo leer el video.');
    } finally {
      setBusy(null);
    }
  }

  async function maskAllFrames(
    label: string,
    run: (frame: HTMLCanvasElement) => Promise<AlphaMask>,
  ): Promise<AlphaMask[]> {
    const out: AlphaMask[] = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame) continue;
      if (frames.length > 1) setBusy(`${label} ${i + 1}/${frames.length}…`);
      out.push(await run(frame));
    }
    return out;
  }

  const averageCoverage = (list: AlphaMask[]) =>
    list.reduce((sum, item) => sum + maskCoverage(item), 0) / Math.max(1, list.length);

  async function runAuto() {
    if (!source || busy) return;
    setBgMode('auto');
    setError(null);
    setBusy('Quitando fondo…');
    try {
      const next = await maskAllFrames('Quitando fondo', (frame) => maskPeople(frame));
      if (averageCoverage(next) < 0.02) {
        setMasks(null);
        setBgMode('touch');
        setError(`No encontré una persona. Toca en ${animated ? 'el video' : 'la foto'} lo que quieres conservar.`);
        return;
      }
      setMasks(next);
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
      let point = { x: nx, y: ny };
      const next = await maskAllFrames('Recortando', async (frame) => {
        const frameMask = await maskAtPoint(frame, point.x, point.y);
        if (maskCoverage(frameMask) >= 0.005) point = maskCentroid(frameMask) ?? point;
        return frameMask;
      });
      if (averageCoverage(next) < 0.005) {
        setError('No pude separar eso. Toca más al centro del objeto.');
        return;
      }
      setMasks(next);
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
    const slop = 18;
    const hit = (box: Box | null | undefined) =>
      Boolean(
        box &&
          point.x >= box.x - slop &&
          point.x <= box.x + box.w + slop &&
          point.y >= box.y - slop &&
          point.y <= box.y + box.h + slop,
      );
    const startDrag = (target: string, box: Box) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        id: event.pointerId,
        target,
        ox: point.x - (box.x + box.w / 2),
        oy: point.y - (box.y + box.h / 2),
      };
    };
    const textBox = layoutRef.current.textBox;
    if (textBox && hit(textBox)) {
      setSelectedDeco(null);
      startDrag('text', textBox);
      return;
    }
    for (let i = decos.length - 1; i >= 0; i--) {
      const deco = decos[i];
      const box = deco ? layoutRef.current.decoBoxes.get(deco.id) : undefined;
      if (deco && box && hit(box)) {
        setSelectedDeco(deco.id);
        startDrag(deco.id, box);
        return;
      }
    }
    setSelectedDeco(null);
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
    const x = Math.min(1, Math.max(0, (point.x - drag.ox) / OUT));
    const y = Math.min(1, Math.max(0, (point.y - drag.oy) / OUT));
    if (drag.target === 'text') setStyle((current) => ({ ...current, x, y }));
    else patchDeco(drag.target, { x, y });
  }

  function endDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  }

  async function encodeAnimated(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<Blob> {
    const order = frameSequence(cutouts.length, bounce);
    let blob: Blob | null = null;
    for (const size of ANIM_OUT_SIZES) {
      const small = document.createElement('canvas');
      small.width = size;
      small.height = size;
      const sctx = small.getContext('2d', { willReadFrequently: true });
      if (!sctx) throw new Error('Tu navegador no permite crear el sticker.');
      const images: ImageData[] = [];
      for (let i = 0; i < order.length; i++) {
        setBusy(`Creando animación ${i + 1}/${order.length}…`);
        renderSticker(ctx, cutouts[order[i] ?? 0] ?? null, bounds, border, style, decos, imagesRef.current, null);
        sctx.clearRect(0, 0, size, size);
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(canvas, 0, 0, size, size);
        images.push(sctx.getImageData(0, 0, size, size));
        if (i % 6 === 5) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      blob = encodeTransparentGif(images, Math.round(1000 / ANIM_FPS));
      if (blob.size <= ANIM_MAX_BYTES) return blob;
    }
    throw new Error('La animación quedó muy pesada. Acorta el clip o quita el rebote.');
  }

  async function save() {
    if (busy || (!source && !style.text.trim() && decos.length === 0)) return;
    setError(null);
    setBusy('Guardando sticker…');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Tu navegador no permite crear el sticker.');
      if (animated) {
        await onSave(await encodeAnimated(canvas, ctx));
        return;
      }
      renderSticker(ctx, cutouts[0] ?? null, bounds, border, style, decos, imagesRef.current, null);
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
  const canSave = Boolean(source || style.text.trim() || decos.length > 0);
  const selected = decos.find((deco) => deco.id === selectedDeco) ?? null;
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

      {videoDraft ? (
        <div className="flex flex-col gap-2">
          <div className="relative mx-auto w-full max-w-[min(100%,18rem)] overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              src={videoDraft.url}
              muted
              playsInline
              autoPlay
              loop
              preload="auto"
              className="block aspect-square w-full object-contain"
              onLoadedData={(event) => {
                event.currentTarget.currentTime = videoDraft.start;
              }}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                if (busy) return;
                if (video.currentTime < videoDraft.start || video.currentTime > videoDraft.start + videoDraft.length) {
                  video.currentTime = videoDraft.start;
                }
              }}
            />
            {busy ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-xs font-semibold text-white">
                <Loader2 size={22} className="animate-spin" />
                {busy}
              </div>
            ) : null}
          </div>
          <p className="text-center text-[11px] font-semibold text-cyan-300">
            Elige el momento del video ({ANIM_MIN_SECONDS}–{ANIM_MAX_SECONDS} s) para tu sticker con movimiento.
          </p>
          <label className="flex min-h-11 items-center gap-2 text-[11px] text-zinc-300">
            <span className="w-16 shrink-0">Inicio</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, videoDraft.duration - videoDraft.length)}
              step={0.1}
              value={videoDraft.start}
              disabled={Boolean(busy)}
              onChange={(event) => {
                const start = Number(event.target.value);
                setVideoDraft((current) => (current ? { ...current, start } : current));
                if (videoRef.current) videoRef.current.currentTime = start;
              }}
              className="min-w-0 flex-1 accent-fuchsia-500"
            />
            <span className="w-10 shrink-0 text-right tabular-nums">{videoDraft.start.toFixed(1)}s</span>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[11px] text-zinc-300">
            <span className="w-16 shrink-0">Duración</span>
            <input
              type="range"
              min={Math.min(ANIM_MIN_SECONDS, videoDraft.duration)}
              max={Math.min(ANIM_MAX_SECONDS, videoDraft.duration)}
              step={0.5}
              value={videoDraft.length}
              disabled={Boolean(busy)}
              onChange={(event) => {
                const length = Number(event.target.value);
                setVideoDraft((current) =>
                  current
                    ? { ...current, length, start: Math.min(current.start, Math.max(0, current.duration - length)) }
                    : current,
                );
              }}
              className="min-w-0 flex-1 accent-fuchsia-500"
            />
            <span className="w-10 shrink-0 text-right tabular-nums">{videoDraft.length.toFixed(1)}s</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVideoDraft(null)}
              disabled={Boolean(busy)}
              className="min-h-11 flex-1 rounded-xl bg-white/[0.08] text-sm font-semibold text-zinc-200 disabled:opacity-50"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={() => void confirmClip()}
              disabled={Boolean(busy)}
              className="min-h-11 flex-[2] rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-sm font-bold text-white disabled:opacity-50"
            >
              Usar este momento
            </button>
          </div>
        </div>
      ) : null}

      <div className={`relative mx-auto w-full max-w-[min(100%,18rem)] ${videoDraft ? 'hidden' : ''}`}>
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
        {!source && !style.text && decos.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-fuchsia-400/45 p-4 text-center">
            <div className={`flex w-full gap-2 ${initialKind === 'video' ? 'flex-row-reverse' : ''}`}>
              <button
                type="button"
                onClick={() => openPicker('photo')}
                className="flex min-h-20 flex-1 flex-col items-center justify-center gap-1 rounded-2xl bg-white/[0.06] text-xs font-semibold text-white hover:bg-white/10"
              >
                <ImagePlus size={24} className="text-fuchsia-300" />
                Foto
              </button>
              <button
                type="button"
                onClick={() => openPicker('video')}
                className={`flex min-h-20 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold text-white ${
                  initialKind === 'video'
                    ? 'bg-gradient-to-br from-fuchsia-500/40 to-violet-500/40 ring-1 ring-fuchsia-400/60'
                    : 'bg-white/[0.06] hover:bg-white/10'
                }`}
              >
                <Clapperboard size={24} className="text-fuchsia-300" />
                Video (con movimiento)
              </button>
            </div>
            <span className="px-2 text-xs text-zinc-400">o usa texto, emojis y stickers de abajo</span>
          </div>
        ) : null}
        {animated && !busy ? (
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-fuchsia-500/85 px-2 py-0.5 text-[10px] font-bold text-white">
            Con movimiento
          </span>
        ) : null}
        {busy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/55 text-xs font-semibold text-white">
            <Loader2 size={22} className="animate-spin" />
            {busy}
          </div>
        ) : null}
      </div>

      {bgMode === 'touch' && source && !busy && !videoDraft ? (
        <p className="text-center text-[11px] font-semibold text-cyan-300">
          Toca en {animated ? 'el video' : 'la foto'} la persona, mascota u objeto que quieres conservar.
        </p>
      ) : null}
      {(style.text || decos.length > 0) && !busy ? (
        <p className="-mt-1 text-center text-[10px] text-zinc-500">
          Arrastra el texto, emojis o stickers para moverlos. Toca uno para cambiar su tamaño.
        </p>
      ) : null}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Decorar</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            ref={emojiBtnRef}
            type="button"
            onClick={() => {
              setStickersOpen(false);
              setEmojiOpen((value) => !value);
            }}
            onMouseDown={(event) => event.preventDefault()}
            className={chip(emojiOpen)}
            aria-expanded={emojiOpen}
          >
            <span className="inline-flex items-center gap-1">
              <Smile size={14} /> Emojis
            </span>
          </button>
          <EmojiPickerButton
            hideTrigger
            triggerRef={emojiBtnRef}
            open={emojiOpen}
            onOpenChange={setEmojiOpen}
            placement="above"
            onPick={addEmoji}
          />
          <button
            type="button"
            onClick={() => {
              setEmojiOpen(false);
              setStickersOpen((value) => !value);
            }}
            className={chip(stickersOpen)}
            aria-expanded={stickersOpen}
          >
            <span className="inline-flex items-center gap-1">
              <Sticker size={14} /> Stickers
            </span>
          </button>
        </div>

        {stickersOpen ? (
          <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
            <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {DECO_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setDecoPack(pack.id)}
                  className={`min-h-9 shrink-0 rounded-full px-3 text-[11px] font-bold transition ${
                    decoPack === pack.id ? 'bg-fuchsia-500 text-white' : 'bg-white/[0.06] text-zinc-300'
                  }`}
                >
                  {pack.label}
                </button>
              ))}
            </div>
            <div className="grid max-h-[min(14rem,32dvh)] grid-cols-4 gap-1.5 overflow-y-auto overscroll-contain sm:grid-cols-6">
              {decoPackItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addDeco({ src: item.src })}
                  className="aspect-square rounded-xl p-1 transition hover:bg-white/[0.08] active:scale-95"
                  title={item.label}
                  aria-label={`Añadir ${item.label}`}
                >
                  <img
                    src={item.src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="h-full w-full select-none object-contain"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {selected ? (
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-fuchsia-500/[0.08] px-3 py-1.5">
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-[11px] text-zinc-300">
              Tamaño
              <input
                type="range"
                min={0.1}
                max={0.8}
                step={0.01}
                value={selected.size}
                onChange={(event) => patchDeco(selected.id, { size: Number(event.target.value) })}
                className="min-w-0 flex-1 accent-fuchsia-500"
              />
            </label>
            <button
              type="button"
              onClick={() => removeDeco(selected.id)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500/20 text-rose-300"
              aria-label="Quitar"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : null}
      </div>

      {source && !videoDraft ? (
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
                if (animated) setMasks(null);
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
                setMasks(null);
                setBgMode('original');
              }}
              className={chip(bgMode === 'original')}
            >
              Original
            </button>
            <button type="button" onClick={() => setBorder((value) => !value)} className={chip(border)}>
              Borde blanco
            </button>
            {animated ? (
              <button
                type="button"
                onClick={() => setBounce((value) => !value)}
                className={chip(bounce)}
                aria-pressed={bounce}
              >
                Rebote
              </button>
            ) : null}
            <button type="button" onClick={() => openPicker(animated ? 'video' : 'photo')} className={chip(false)}>
              {animated ? 'Cambiar video' : 'Cambiar foto'}
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
