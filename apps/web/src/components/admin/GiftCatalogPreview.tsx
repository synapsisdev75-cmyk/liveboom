import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { EditableGift, GiftPlacement } from '../../lib/catalogConfigFirestore';
import { clampGiftAnimScale } from '../../lib/liveboomGifts';
import {
  copyGiftLayoutActiveToDevices,
  copyGiftLayoutFormat,
  GIFT_LAYOUT_VARIANT_LABEL,
  giftLayoutVariantFor,
  normalizeGiftLayout,
  patchGiftLayoutCell,
  resetGiftLayoutCell,
  resolveGiftLayoutCell,
  setGiftLayoutPreferredArea,
  type GiftFitMode,
  type GiftLayoutArea,
  type GiftLayoutMap,
  type GiftLiveFormat,
} from '../../lib/giftLayout';
import { GiftLayoutMedia } from '../gifts/GiftLayoutMedia';
import { clampGiftVolume, giftPlaybackSrc, type GiftMediaInfo } from '../../lib/giftMedia';
import { GiftContextStage } from './GiftContextStage';

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
  previewPlacement: GiftPlacement;
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
  previewPlacement,
  onDeviceChange,
  onAnimScaleChange,
  onLayoutChange,
  onMediaChange,
}: Props) {
  const [liveFormat, setLiveFormat] = useState<GiftLiveFormat>(
    device === 'desktop' ? 'landscape169' : 'portrait916',
  );
  const [callKind, setCallKind] = useState<'voice' | 'video'>('video');
  const shellRef = useRef<HTMLDivElement>(null);
  const [shellW, setShellW] = useState(0);
  const frameFormat =
    previewPlacement === 'live'
      ? liveFormat
      : device === 'desktop'
        ? 'landscape169'
        : 'portrait916';
  const meta = previewFrame(device, frameFormat);
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
  const [backdrop, setBackdrop] = useState<PreviewBackdrop>('dark');
  const [cropMode, setCropMode] = useState(false);
  const [safeGuides, setSafeGuides] = useState(false);
  const [playToken, setPlayToken] = useState(0);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [finalPreview, setFinalPreview] = useState(false);
  const layout = useMemo(
    () => normalizeGiftLayout(gift.giftLayout, gift.animScale),
    [gift.giftLayout, gift.animScale],
  );
  const variant = giftLayoutVariantFor(previewPlacement, { liveFormat, callKind });
  const resolved = resolveGiftLayoutCell({
    layout,
    animScale: gift.animScale,
    variant,
    device,
    liveFormat: previewPlacement === 'live' ? liveFormat : undefined,
  });
  const slot = resolved.slot;
  const area: GiftLayoutArea = resolved.area;
  const globalArea = area === 'viewport';
  const is916 = liveFormat === 'portrait916';
  const enabledHere = gift.placements.includes(previewPlacement);
  const sourceLabel =
    resolved.source === 'exact'
      ? 'Ajuste específico de esta combinación'
      : resolved.source === 'legacy'
        ? 'Usando el ajuste anterior del regalo (aún no hay uno propio)'
        : resolved.source === 'variant' || resolved.source === 'area'
          ? 'Usando valores heredados. Al mover el regalo se crea un ajuste propio.'
          : 'Usando el valor predeterminado del sistema';

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
    const current = resolveGiftLayoutCell({
      layout: next,
      animScale: gift.animScale,
      variant,
      device,
      area,
    }).slot;
    onAnimScaleChange?.(clampGiftAnimScale(Math.min(1, current.scale), gift.level));
  };

  const patchSlot = (partial: Partial<typeof slot>) => {
    commit(patchGiftLayoutCell(layout, { variant, device, area }, partial, gift.animScale));
  };

  const setArea = (nextArea: GiftLayoutArea) => {
    commit(setGiftLayoutPreferredArea(layout, { variant, device, area: nextArea }, gift.animScale));
  };

  const areaContentLabel = previewPlacement === 'live' ? 'Dentro del LIVE' : 'Dentro del contenido';
  const areaViewportLabel = 'Toda la pantalla';
  const editingLine = `Editando: ${PLACEMENT_SHORT[previewPlacement]} · ${DEVICE_LABEL[device]}${
    previewPlacement === 'live' ? ` · ${is916 ? '9:16' : '16:9'}` : ''
  }${previewPlacement === 'call' ? ` · ${callKind === 'voice' ? 'Voz' : 'Video'}` : ''} · ${
    globalArea ? areaViewportLabel : areaContentLabel
  }`;

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

      <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
        <p className="text-[11px] font-semibold text-white">
          {finalPreview ? 'Resultado final (sin guías ni cuadrícula)' : editingLine}
        </p>
        <p className="text-[10px] text-zinc-400">
          {finalPreview ? 'Así se verá publicado sobre LiveBoom.' : sourceLabel}
        </p>
        {!enabledHere ? (
          <p className="mt-1 text-[10px] font-semibold text-amber-200">
            Esta ubicación todavía no está habilitada para publicación.
          </p>
        ) : null}
        {/\.webm(\?|$)/i.test(mediaSrc || '') ? (
          <p className="mt-1 text-[10px] text-amber-200/80">
            Chrome, Android y escritorio reproducen el alfa WebM VP9. Safari/iOS no está comprobado: si
            falla, se conserva la versión aprobada.
          </p>
        ) : null}
      </div>

      {previewPlacement === 'live' ? (
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
      ) : null}

      {previewPlacement === 'call' ? (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Tipo de llamada
          </p>
          <div className="flex flex-wrap gap-1">
            <Chip tone="cyan" active={callKind === 'voice'} onClick={() => setCallKind('voice')}>
              Voz
            </Chip>
            <Chip tone="cyan" active={callKind === 'video'} onClick={() => setCallKind('video')}>
              Video
            </Chip>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Área de aparición
          </p>
          <div className="flex flex-wrap gap-1">
            <Chip active={!globalArea} onClick={() => setArea('content')}>
              {areaContentLabel}
            </Chip>
            <Chip active={globalArea} onClick={() => setArea('viewport')}>
              {areaViewportLabel}
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
          20%–200% en {GIFT_LAYOUT_VARIANT_LABEL[variant]} · {DEVICE_LABEL[device]}. Ctrl + rueda para zoom.
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
        {previewPlacement === 'live' ? (
          <Chip
            active={!globalArea && slot.fullscreenMode === 'live'}
            onClick={() => {
              commit(
                patchGiftLayoutCell(
                  setGiftLayoutPreferredArea(layout, { variant, device, area: 'content' }, gift.animScale),
                  { variant, device, area: 'content' },
                  { displayArea: 'live', fullscreenMode: 'live', fit: 'cover' },
                  gift.animScale,
                ),
              );
            }}
          >
            Llenar LIVE
          </Chip>
        ) : null}
        <Chip
          active={globalArea && slot.fullscreenMode === 'global'}
          onClick={() => {
            commit(
              patchGiftLayoutCell(
                setGiftLayoutPreferredArea(layout, { variant, device, area: 'viewport' }, gift.animScale),
                { variant, device, area: 'viewport' },
                { displayArea: 'global', fullscreenMode: 'global', fit: 'cover' },
                gift.animScale,
              ),
            );
          }}
        >
          Pantalla completa
        </Chip>
        <Chip active={cropMode} onClick={() => setCropMode((v) => !v)}>
          Recortar
        </Chip>
        <Chip
          active={false}
          onClick={() => commit(resetGiftLayoutCell(layout, { variant, device, area }, gift.animScale))}
        >
          Restablecer
        </Chip>
        <Chip active={safeGuides && !finalPreview} onClick={() => setSafeGuides((v) => !v)}>
          Área segura
        </Chip>
        <Chip active={finalPreview} onClick={() => {
          setFinalPreview((v) => {
            const next = !v;
            if (next) {
              setCropMode(false);
              setSafeGuides(false);
            }
            return next;
          });
        }}>
          Ver resultado final
        </Chip>
        <Chip active={false} onClick={() => setPlayToken((n) => n + 1)}>
          Reiniciar animación
        </Chip>
      </div>

      <div className="flex flex-wrap gap-1">
        <Chip
          active={false}
          onClick={() => commit(copyGiftLayoutActiveToDevices(layout, variant, device))}
        >
          Copiar a todos
        </Chip>
        {previewPlacement === 'live' ? (
          <>
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
          </>
        ) : null}
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
          <div
            className="absolute inset-0"
            style={
              finalPreview && backdrop === 'checker' ? BACKDROP_META.dark.style : BACKDROP_META[backdrop].style
            }
          />

          <GiftContextStage
            placement={previewPlacement}
            device={device}
            liveFormat={liveFormat}
            callKind={callKind}
            contentGift={
              !globalArea ? (
                <>
                  {gift.face && previewPlacement === 'live' ? (
                    <div
                      className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
                      style={{ top: `${faceTop}%`, fontSize: `${faceSize * facePreviewScale * 1.6}rem` }}
                      title={`Ancla: ${gift.face.anchor}`}
                    >
                      {gift.face.emoji || gift.emoji}
                    </div>
                  ) : null}
                  <GiftLayoutMedia
                    src={mediaSrc}
                    isVideo={isVideo}
                    emoji={gift.emoji}
                    slot={slot}
                    interactive
                    cropMode={cropMode}
                    finalPreview={finalPreview}
                    playToken={playToken}
                    muted={previewMuted}
                    volume={gift.media?.volume ?? 1}
                    mediaWidth={gift.media?.width}
                    mediaHeight={gift.media?.height}
                    className="absolute inset-0 z-10"
                    onSlotChange={patchSlot}
                  />
                </>
              ) : null
            }
          />

          {globalArea ? (
            <GiftLayoutMedia
              src={mediaSrc}
              isVideo={isVideo}
              emoji={gift.emoji}
              slot={slot}
              interactive
              cropMode={cropMode}
              finalPreview={finalPreview}
              playToken={playToken}
              muted={previewMuted}
              volume={gift.media?.volume ?? 1}
              mediaWidth={gift.media?.width}
              mediaHeight={gift.media?.height}
              className="absolute inset-0 z-20"
              onSlotChange={patchSlot}
            />
          ) : null}

          {safeGuides && !finalPreview ? (
            <div className="pointer-events-none absolute inset-0 z-30">
              <div className="absolute inset-x-[6%] top-[8%] h-[9%] rounded-md border border-dashed border-amber-300/50" />
              <div className="absolute bottom-[14%] left-[4%] h-[28%] w-[38%] rounded-md border border-dashed border-sky-300/45" />
              <div className="absolute bottom-[4%] right-[4%] h-[36%] w-[14%] rounded-md border border-dashed border-fuchsia-300/45" />
              <div className="absolute inset-x-0 bottom-0 h-[11%] border-t border-dashed border-white/35" />
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-center text-[11px] text-zinc-500">
        {GIFT_LAYOUT_VARIANT_LABEL[variant]} · {DEVICE_LABEL[device]} ·{' '}
        {globalArea ? 'toda la pantalla de la app' : 'dentro del contenido'}. Publica para aplicar en la app.
      </p>
    </div>
  );
}
