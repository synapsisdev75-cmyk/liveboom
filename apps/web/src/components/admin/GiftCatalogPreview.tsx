import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { EditableGift, GiftPlacement } from '../../lib/catalogConfigFirestore';
import { clampGiftAnimScale } from '../../lib/liveboomGifts';
import {
  copyGiftLayoutFormat,
  copyGiftLayoutToAllDevices,
  defaultGiftLayoutSlot,
  normalizeGiftLayout,
  patchGiftLayout,
  type GiftDisplayArea,
  type GiftFitMode,
  type GiftLayoutMap,
  type GiftLiveFormat,
} from '../../lib/giftLayout';
import { GiftLayoutMedia } from '../gifts/GiftLayoutMedia';
import { clampGiftVolume, giftPlaybackSrc, type GiftMediaInfo } from '../../lib/giftMedia';

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

const DEVICE_LABEL: Record<PreviewDevice, string> = {
  mobile: 'Móvil',
  tablet: 'Tablet',
  desktop: 'Escritorio',
};

function previewFrame(device: PreviewDevice, format: GiftLiveFormat) {
  if (device === 'desktop') {
    return { frameW: 1280, frameH: 720, scale: 1 };
  }
  if (device === 'tablet' && format === 'landscape169') {
    return { frameW: 1024, frameH: 576, scale: 0.42 };
  }
  if (device === 'tablet') return { frameW: 768, frameH: 1365, scale: 0.32 };
  return { frameW: 390, frameH: 693, scale: 0.52 };
}

function desktopCanvasSize(availableWidth: number, viewportHeight: number) {
  const width = Math.max(280, Math.floor(availableWidth));
  const maxH = Math.min(Math.round(viewportHeight * 0.56), 560);
  const height = Math.max(180, Math.min(Math.round(width * (9 / 16)), maxH));
  return { width, height };
}

/** En escritorio el lienzo editable llena el centro; el video 9:16/16:9 no se deforma. */
function liveStageBoxStyle(device: PreviewDevice, is916: boolean): CSSProperties {
  if (device === 'desktop') {
    return { width: '100%', height: '100%' };
  }
  return {
    aspectRatio: is916 ? '9 / 16' : '16 / 9',
    width: is916 ? 'auto' : '100%',
    height: is916 ? '100%' : 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
  };
}

function liveVideoMockStyle(device: PreviewDevice, is916: boolean): CSSProperties {
  if (device !== 'desktop') {
    return { width: '100%', height: '100%' };
  }
  return {
    aspectRatio: is916 ? '9 / 16' : '16 / 9',
    width: is916 ? 'auto' : '100%',
    height: is916 ? '100%' : 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
  };
}

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

const FIT_LABELS: Record<GiftFitMode, string> = {
  contain: 'Contener',
  cover: 'Llenar',
  width: 'Ancho',
  height: 'Alto',
  free: 'Libre',
};

type Props = {
  gift: EditableGift;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  onAnimScaleChange?: (scale: number) => void;
  onLayoutChange?: (layout: GiftLayoutMap) => void;
  onMediaChange?: (media: GiftMediaInfo) => void;
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

function Chip({
  active,
  onClick,
  children,
  tone = 'zinc',
}: {
  active: boolean;
  onClick: () => void;
  children: string;
  tone?: 'zinc' | 'fuchsia' | 'cyan';
}) {
  const on =
    tone === 'fuchsia'
      ? 'bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
      : tone === 'cyan'
        ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40'
        : 'bg-zinc-100 text-zinc-900 ring-1 ring-white/40';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold ${
        active ? on : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
      }`}
    >
      {children}
    </button>
  );
}

/** Previsualización del regalo en marcos móvil / tablet / escritorio. */
export function GiftCatalogPreview({
  gift,
  device,
  onDeviceChange,
  onAnimScaleChange,
  onLayoutChange,
  onMediaChange,
}: Props) {
  const [liveFormat, setLiveFormat] = useState<GiftLiveFormat>(
    device === 'desktop' ? 'landscape169' : 'portrait916',
  );
  const shellRef = useRef<HTMLDivElement>(null);
  const [shellW, setShellW] = useState(0);
  const meta = previewFrame(device, liveFormat);
  const desktopSize = desktopCanvasSize(
    shellW || 720,
    typeof window === 'undefined' ? 720 : window.innerHeight,
  );
  const displayW = device === 'desktop' ? desktopSize.width : Math.round(meta.frameW * meta.scale);
  const displayH = device === 'desktop' ? desktopSize.height : Math.round(meta.frameH * meta.scale);
  const facePreviewScale = device === 'desktop' ? Math.min(1, displayH / 720) : meta.scale;
  const [compare, setCompare] = useState<'processed' | 'original'>('processed');
  const videoSrc = giftPlaybackSrc(
    gift.media,
    gift.video,
    gift.media?.backgroundRemoved && compare === 'original' ? 'original' : 'active',
  );
  const mediaSrc = videoSrc || gift.image;
  const isVideo = Boolean(videoSrc);
  const faceTop = faceTopPercent(gift);
  const faceSize = faceSizeRem(gift);
  const [backdrop, setBackdrop] = useState<PreviewBackdrop>('checker');
  const [cropMode, setCropMode] = useState(false);
  const [safeGuides, setSafeGuides] = useState(false);
  const [playToken, setPlayToken] = useState(0);
  const [previewMuted, setPreviewMuted] = useState(true);
  const layout = useMemo(
    () => normalizeGiftLayout(gift.giftLayout, gift.animScale),
    [gift.giftLayout, gift.animScale],
  );
  const slot = layout[device][liveFormat];
  const is916 = liveFormat === 'portrait916';
  const globalArea = slot.displayArea === 'global' || slot.fullscreenMode === 'global';

  useEffect(() => {
    if (device === 'mobile') setLiveFormat('portrait916');
  }, [device]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => setShellW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [device]);

  const commit = (next: GiftLayoutMap) => {
    onLayoutChange?.(next);
    const current = next[device][liveFormat];
    onAnimScaleChange?.(clampGiftAnimScale(Math.min(1, current.scale), gift.level));
  };

  const patchSlot = (partial: Partial<typeof slot>) => {
    commit(patchGiftLayout(layout, device, liveFormat, partial, gift.animScale));
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Previsualización
        </p>
        <div className="ml-auto flex flex-wrap gap-1">
          {(Object.keys(BACKDROP_META) as PreviewBackdrop[]).map((key) => (
            <Chip key={key} active={backdrop === key} onClick={() => setBackdrop(key)}>
              {BACKDROP_META[key].label}
            </Chip>
          ))}
          {(Object.keys(DEVICE_LABEL) as PreviewDevice[]).map((key) => (
            <Chip
              key={key}
              tone="fuchsia"
              active={device === key}
              onClick={() => onDeviceChange(key)}
            >
              {DEVICE_LABEL[key]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Formato del LIVE
        </p>
        {device === 'mobile' ? (
          <p className="text-xs text-zinc-400">Móvil (Android / iOS) usa 9:16.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            <Chip tone="cyan" active={is916} onClick={() => setLiveFormat('portrait916')}>
              Vertical 9:16
            </Chip>
            <Chip tone="cyan" active={!is916} onClick={() => setLiveFormat('landscape169')}>
              Horizontal 16:9
            </Chip>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Área de aparición
          </p>
          <div className="flex flex-wrap gap-1">
            <Chip
              active={!globalArea}
              onClick={() => patchSlot({ displayArea: 'live' as GiftDisplayArea, fullscreenMode: 'none' })}
            >
              Dentro del LIVE
            </Chip>
            <Chip
              active={globalArea}
              onClick={() => patchSlot({ displayArea: 'global', fullscreenMode: 'global', fit: 'cover' })}
            >
              Toda la pantalla
            </Chip>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Ajuste</p>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(FIT_LABELS) as GiftFitMode[]).map((fit) => (
              <Chip
                key={fit}
                active={slot.fit === fit && slot.fullscreenMode === 'none'}
                onClick={() =>
                  patchSlot({
                    fit,
                    fullscreenMode: fit === 'cover' ? slot.fullscreenMode : 'none',
                  })
                }
              >
                {FIT_LABELS[fit]}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <label className="block space-y-1 text-xs text-zinc-400">
        Escala: {Math.round(slot.scale * 100)}%
        <input
          type="range"
          min={0.2}
          max={2}
          step={0.01}
          value={slot.scale}
          onChange={(e) => patchSlot({ scale: Number(e.target.value) })}
          className="w-full accent-fuchsia-400"
        />
        <span className="block text-[10px] text-zinc-500">
          20%–200% en {DEVICE_LABEL[device]} · {is916 ? '9:16' : '16:9'}. Ctrl + rueda para zoom.
        </span>
      </label>

      {isVideo ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-xs text-zinc-400">
            Volumen del regalo: {Math.round((gift.media?.volume ?? 1) * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={gift.media?.volume ?? 1}
              onChange={(e) =>
                onMediaChange?.({
                  ...(gift.media || {
                    hasAudio: true,
                    duration: 0,
                    width: 0,
                    height: 0,
                    fps: 0,
                    codec: '',
                    originalAsset: gift.video || null,
                    processedAsset: null,
                    backgroundRemoved: false,
                    volume: 1,
                    processingStatus: 'ready',
                  }),
                  volume: clampGiftVolume(e.target.value),
                })
              }
              className="w-full accent-emerald-400"
            />
          </label>
          <div className="flex flex-wrap gap-1">
            <Chip
              active={!previewMuted}
              onClick={() => {
                setPreviewMuted(false);
                setPlayToken((n) => n + 1);
              }}
            >
              Probar audio
            </Chip>
            <Chip active={previewMuted} onClick={() => setPreviewMuted(true)}>
              Silenciar preview
            </Chip>
            {gift.media?.backgroundRemoved && gift.media.processedAsset ? (
              <>
                <Chip active={compare === 'original'} onClick={() => setCompare('original')}>
                  Original
                </Chip>
                <Chip active={compare === 'processed'} onClick={() => setCompare('processed')}>
                  Sin fondo
                </Chip>
              </>
            ) : null}
          </div>
          <p className="text-[10px] text-zinc-500">
            Silenciar el preview no quita la pista. {gift.media?.hasAudio ? 'Este video tiene audio.' : 'Sin pista de audio detectada.'}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-xs text-zinc-400">
          Posición X ({Math.round(slot.x)}%)
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={slot.x}
            onChange={(e) => patchSlot({ x: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
        </label>
        <label className="block space-y-1 text-xs text-zinc-400">
          Posición Y ({Math.round(slot.y)}%)
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={slot.y}
            onChange={(e) => patchSlot({ y: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1">
        <Chip active={false} onClick={() => patchSlot({ x: 50, y: 50 })}>
          Centrar
        </Chip>
        <Chip
          active={slot.fit === 'cover'}
          onClick={() => patchSlot({ fit: 'cover', fullscreenMode: globalArea ? 'global' : 'live' })}
        >
          Llenar
        </Chip>
        <Chip active={slot.fit === 'contain'} onClick={() => patchSlot({ fit: 'contain', fullscreenMode: 'none' })}>
          Ajustar
        </Chip>
        <Chip
          active={slot.fullscreenMode === 'live'}
          onClick={() => patchSlot({ displayArea: 'live', fullscreenMode: 'live', fit: 'cover' })}
        >
          Llenar LIVE
        </Chip>
        <Chip
          active={slot.fullscreenMode === 'global'}
          onClick={() => patchSlot({ displayArea: 'global', fullscreenMode: 'global', fit: 'cover' })}
        >
          Pantalla completa
        </Chip>
        <Chip active={cropMode} onClick={() => setCropMode((v) => !v)}>
          Recortar
        </Chip>
        <Chip
          active={false}
          onClick={() => patchSlot(defaultGiftLayoutSlot(gift.animScale))}
        >
          Restablecer
        </Chip>
        <Chip active={safeGuides} onClick={() => setSafeGuides((v) => !v)}>
          Área segura
        </Chip>
        <Chip active={false} onClick={() => setPlayToken((n) => n + 1)}>
          Reiniciar animación
        </Chip>
      </div>

      <div className="flex flex-wrap gap-1">
        <Chip
          active={false}
          onClick={() => commit(copyGiftLayoutToAllDevices(layout, device))}
        >
          Copiar a todos
        </Chip>
        <Chip
          active={false}
          onClick={() => commit(copyGiftLayoutFormat(layout, 'portrait916', 'landscape169'))}
        >
          9:16 → 16:9
        </Chip>
        <Chip
          active={false}
          onClick={() => commit(copyGiftLayoutFormat(layout, 'landscape169', 'portrait916'))}
        >
          16:9 → 9:16
        </Chip>
      </div>
      {cropMode ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="text-[10px] text-amber-200/80 sm:col-span-2">
            Recorte activo: arrastra para encuadrar. No modifica el archivo, solo cropX/cropY.
          </p>
          <label className="block space-y-1 text-xs text-zinc-400">
            Recorte X ({Math.round(slot.cropX)}%)
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={slot.cropX}
              onChange={(e) => patchSlot({ cropX: Number(e.target.value) })}
              className="w-full accent-amber-400"
            />
          </label>
          <label className="block space-y-1 text-xs text-zinc-400">
            Recorte Y ({Math.round(slot.cropY)}%)
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={slot.cropY}
              onChange={(e) => patchSlot({ cropY: Number(e.target.value) })}
              className="w-full accent-amber-400"
            />
          </label>
        </div>
      ) : null}

      <div ref={shellRef} className={device === 'desktop' ? 'w-full max-w-full py-2' : 'flex justify-center overflow-x-auto py-2'}>
        <div
          className={`relative overflow-hidden rounded-[1.25rem] border border-zinc-600 bg-zinc-950 shadow-2xl shadow-black/50 ${
            device === 'desktop' ? 'mx-auto max-w-full' : 'shrink-0'
          }`}
          style={{ width: displayW, height: displayH }}
        >
          <div className="absolute inset-0" style={BACKDROP_META[backdrop].style} />

          <div className="absolute left-2 top-2 z-30 flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2 py-0.5 text-[9px] font-bold text-white">
            ● LIVE
          </div>

          <div className={`absolute inset-0 z-10 flex ${device === 'desktop' ? 'flex-row' : 'flex-col'} min-h-0`}>
            {device === 'desktop' ? (
              <div className="flex w-[16%] shrink-0 flex-col gap-1 border-r border-white/10 bg-black/35 p-1.5">
                <div className="h-2 rounded bg-white/20" />
                <div className="h-2 w-3/4 rounded bg-white/10" />
                <div className="h-2 w-2/3 rounded bg-white/10" />
              </div>
            ) : null}

            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
              <div
                className={`absolute inset-0 flex items-center justify-center ${
                  device === 'desktop' ? '' : 'p-[3%]'
                }`}
              >
                <div
                  className="relative overflow-hidden bg-black/20"
                  style={liveStageBoxStyle(device, is916)}
                >
                  <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
                    <div className="relative overflow-hidden" style={liveVideoMockStyle(device, is916)}>
                      <div className="absolute left-1/2 top-[22%] z-0 flex w-[42%] -translate-x-1/2 flex-col items-center">
                        <div className="aspect-square w-full rounded-full bg-gradient-to-b from-zinc-600 to-zinc-800 ring-2 ring-white/10" />
                        <div className="mt-2 h-10 w-[70%] rounded-2xl bg-zinc-800/80" />
                      </div>
                      {gift.face && !globalArea ? (
                        <div
                          className="absolute left-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
                          style={{ top: `${faceTop}%`, fontSize: `${faceSize * facePreviewScale * 1.6}rem` }}
                          title={`Ancla: ${gift.face.anchor}`}
                        >
                          {gift.face.emoji || gift.emoji}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {!globalArea ? (
                    <GiftLayoutMedia
                      src={mediaSrc}
                      poster={gift.image}
                      isVideo={isVideo}
                      emoji={gift.emoji}
                      slot={slot}
                      interactive
                      cropMode={cropMode}
                      playToken={playToken}
                      muted={previewMuted}
                      volume={gift.media?.volume ?? 1}
                      className="absolute inset-0 z-10"
                      onSlotChange={patchSlot}
                    />
                  ) : null}
                  {safeGuides ? (
                    <div className="pointer-events-none absolute inset-0 z-20">
                      <div className="absolute inset-x-[6%] top-[8%] h-[9%] rounded-md border border-dashed border-amber-300/50" />
                      <div className="absolute bottom-[14%] left-[4%] h-[28%] w-[38%] rounded-md border border-dashed border-sky-300/45" />
                      <div className="absolute bottom-[4%] right-[4%] h-[36%] w-[14%] rounded-md border border-dashed border-fuchsia-300/45" />
                      <div className="absolute inset-x-0 bottom-0 h-[11%] border-t border-dashed border-white/35" />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {device === 'desktop' ? (
              <div className="flex w-[20%] shrink-0 flex-col gap-1 border-l border-white/10 bg-black/35 p-1.5">
                <div className="h-2 rounded bg-white/20" />
                <div className="h-8 rounded bg-white/10" />
                <div className="h-8 rounded bg-white/10" />
              </div>
            ) : null}
          </div>

          {globalArea ? (
            <GiftLayoutMedia
              src={mediaSrc}
              poster={gift.image}
              isVideo={isVideo}
              emoji={gift.emoji}
              slot={slot}
              interactive
              cropMode={cropMode}
              playToken={playToken}
              muted={previewMuted}
              volume={gift.media?.volume ?? 1}
              className="absolute inset-0 z-20"
              onSlotChange={patchSlot}
            />
          ) : null}

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
        {DEVICE_LABEL[device]} · LIVE {is916 ? '9:16' : '16:9'} ·{' '}
        {globalArea ? 'toda la pantalla del lienzo' : 'dentro del video'}. Publica para aplicar en la app.
      </p>
    </div>
  );
}
