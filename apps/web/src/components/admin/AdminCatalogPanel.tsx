import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ALL_GIFT_PLACEMENTS,
  buildDefaultCoinPackages,
  buildDefaultGiftsCatalog,
  saveCoinPackagesConfig,
  saveGiftsCatalog,
  uploadCatalogAsset,
  type EditableCoinPackage,
  type EditableGift,
  type GiftPlacement,
} from '../../lib/catalogConfigFirestore';
import { giftLevelFromCoins, type GiftLevel } from '../../lib/liveboomGifts';
import { packageCopLabel } from '../../lib/coinPackages';
import { useAuthStore } from '../../store/authStore';
import { useCatalogConfigStore } from '../../store/catalogConfigStore';
import {
  GiftCatalogPreview,
  type PreviewDevice,
} from './GiftCatalogPreview';
import {
  forgetGiftAlphaJob,
  formatGiftAnimBytes,
  giftAlphaStageLabel,
  giftAnimLimitsHint,
  isGiftAnimationFile,
  needsAlphaMovConvert,
  rememberedGiftAlphaJobId,
  resumeGiftAlphaJob,
  retryGiftAlphaJob,
  uploadGiftAnimation,
  type GiftAnimProgress,
} from '../../lib/giftAlphaConvert';
import {
  deleteGiftPermanentlyApi,
  giftStoragePathFromUrl,
  startGiftBackgroundRemove,
  uploadGiftSource,
} from '../../lib/giftMediaApi';
import { defaultGiftMedia, type GiftMediaInfo } from '../../lib/giftMedia';

const PLACEMENT_LABELS: Record<GiftPlacement, string> = {
  live: 'LIVE',
  post: 'Publicaciones',
  boom_clip: 'Boom Clip',
  flashboom: 'Flash Boom',
  call: 'Llamadas',
  chat: 'Chat',
};

type SubTab = 'gifts' | 'coins';

function AssetDropZone({
  label,
  accept,
  hint,
  previewUrl,
  isVideo,
  disabled,
  busyLabel,
  progress,
  onFile,
  onRetry,
}: {
  label: string;
  accept: string;
  hint: string;
  previewUrl?: string;
  isVideo?: boolean;
  disabled?: boolean;
  busyLabel?: string;
  progress?: GiftAnimProgress | null;
  onFile: (file: File) => void;
  onRetry?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const busy =
    Boolean(progress) && progress?.stage !== 'done' && progress?.stage !== 'failed';
  const percent = progress?.percent;
  const showBar = busy && (percent != null || progress?.indeterminate);

  function takeFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    takeFiles(e.dataTransfer.files);
  }

  const title = busy
    ? progress?.label || busyLabel || 'Procesando…'
    : progress?.stage === 'done'
      ? 'Animación lista.'
      : disabled
        ? busyLabel || 'Subiendo…'
        : isVideo
          ? 'Subir animación'
          : 'Subir desde el escritorio';

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-400">{label}</p>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-4 text-center transition ${
          dragOver
            ? 'border-cyan-400 bg-cyan-500/10'
            : 'border-zinc-600 bg-zinc-900/60 hover:border-fuchsia-400/50 hover:bg-zinc-900'
        } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      >
        {previewUrl ? (
          isVideo ? (
            <video
              src={previewUrl}
              muted
              loop
              autoPlay
              playsInline
              className="max-h-24 max-w-full rounded-lg object-contain"
            />
          ) : (
            <img
              src={previewUrl}
              alt=""
              className="max-h-24 max-w-full rounded-lg object-contain"
            />
          )
        ) : (
          <span className="text-2xl text-zinc-500">⬆</span>
        )}
        <span className="text-sm font-semibold text-white">{title}</span>
        {progress?.fileName ? (
          <span className="max-w-full truncate text-[11px] text-zinc-400">
            {progress.fileName}
            {progress.fileBytes ? ` · ${formatGiftAnimBytes(progress.fileBytes)}` : ''}
          </span>
        ) : null}
        {showBar ? (
          <div className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-zinc-800">
            {percent != null && !progress?.indeterminate ? (
              <div
                className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-[width]"
                style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
              />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400/70" />
            )}
          </div>
        ) : null}
        {progress?.warning ? (
          <span className="text-[11px] text-amber-200">{progress.warning}</span>
        ) : null}
        {progress?.error ? (
          <span className="text-[11px] text-rose-300">{progress.error}</span>
        ) : null}
        {progress?.stage === 'failed' && onRetry ? (
          <button
            type="button"
            className="min-h-10 rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-400/30"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRetry();
            }}
          >
            Reintentar conversión
          </button>
        ) : null}
        <span className="text-[11px] text-zinc-500">{hint}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          takeFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function AdminCatalogPanel({
  modules = ['gifts', 'coins'],
}: {
  modules?: Array<'gifts' | 'coins'>;
}) {
  const allowedGifts = modules.includes('gifts');
  const allowedCoins = modules.includes('coins');
  const email = useAuthStore((s) => s.profile?.email) || 'super-admin';
  const storeGifts = useCatalogConfigStore((s) => s.gifts);
  const storePacks = useCatalogConfigStore((s) => s.packages);
  const giftsVersion = useCatalogConfigStore((s) => s.giftsVersion);
  const packsVersion = useCatalogConfigStore((s) => s.packsVersion);

  const [sub, setSub] = useState<SubTab>(allowedGifts ? 'gifts' : 'coins');
  const [gifts, setGifts] = useState<EditableGift[]>(() => buildDefaultGiftsCatalog().gifts);
  const [packs, setPacks] = useState<EditableCoinPackage[]>(() => buildDefaultCoinPackages().packages);
  const [selectedGiftId, setSelectedGiftId] = useState(gifts[0]?.id || '');
  const [selectedPackId, setSelectedPackId] = useState(packs[0]?.id || '');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [animProgress, setAnimProgress] = useState<Record<string, GiftAnimProgress | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('mobile');
  const [previewPlacement, setPreviewPlacement] = useState<GiftPlacement>('live');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bgBusy, setBgBusy] = useState(false);
  const [adjustMode, setAdjustMode] = useState(false);
  const animGenRef = useRef<Record<string, number>>({});
  const giftsDirtyRef = useRef(false);
  const packsDirtyRef = useRef(false);

  useEffect(() => {
    if (giftsDirtyRef.current) return;
    if (storeGifts.length) {
      setGifts(storeGifts.map((g) => ({ ...g, face: g.face ? { ...g.face } : null })));
      if (!storeGifts.some((g) => g.id === selectedGiftId)) {
        setSelectedGiftId(storeGifts[0]!.id);
      }
    }
  }, [storeGifts, giftsVersion]);

  useEffect(() => {
    if (packsDirtyRef.current) return;
    if (storePacks.length) {
      setPacks(storePacks.map((p) => ({ ...p })));
      if (!storePacks.some((p) => p.id === selectedPackId)) {
        setSelectedPackId(storePacks[0]!.id);
      }
    }
  }, [storePacks, packsVersion]);

  useEffect(() => {
    if (sub === 'gifts' && !allowedGifts && allowedCoins) setSub('coins');
    if (sub === 'coins' && !allowedCoins && allowedGifts) setSub('gifts');
  }, [allowedGifts, allowedCoins, sub]);

  const filteredGifts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return gifts;
    return gifts.filter(
      (g) =>
        g.id.toLowerCase().includes(q) ||
        g.name.toLowerCase().includes(q) ||
        g.animation.toLowerCase().includes(q),
    );
  }, [gifts, query]);

  const gift = gifts.find((g) => g.id === selectedGiftId) || gifts[0];
  const pack = packs.find((p) => p.id === selectedPackId) || packs[0];

  useEffect(() => {
    const giftId = selectedGiftId;
    if (!giftId) return;
    const genAtStart = animGenRef.current[giftId] || 0;
    let cancelled = false;
    void resumeGiftAlphaJob(giftId, (progress) => {
      if (cancelled || (animGenRef.current[giftId] || 0) !== genAtStart) return;
      setAnimProgress((prev) => ({ ...prev, [giftId]: progress }));
    })
      .then((job) => {
        if (cancelled || !job) return;
        if ((animGenRef.current[giftId] || 0) !== genAtStart) return;
        if (job.status === 'done' && job.url && !job.url.startsWith('blob:')) {
          patchGift(job.giftId, { video: job.url });
          forgetGiftAlphaJob(job.giftId);
          if (job.warning) setMessage(`${job.warning} Publica para aplicar.`);
        }
      })
      .catch(() => {
        /* el recuadro muestra el error si el job falló */
      });
    return () => {
      cancelled = true;
    };
  }, [selectedGiftId]);

  function patchGift(id: string, patch: Partial<EditableGift>) {
    giftsDirtyRef.current = true;
    setGifts((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.coins != null) next.level = giftLevelFromCoins(patch.coins) as GiftLevel;
        if (patch.placements) {
          next.liveOnly = patch.placements.length === 1 && patch.placements[0] === 'live';
        }
        return next;
      }),
    );
  }

  function patchPack(id: string, patch: Partial<EditableCoinPackage>) {
    packsDirtyRef.current = true;
    setPacks((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addGift() {
    const base = `regalo_${Date.now().toString(36)}`;
    const id = base.replace(/[^a-z0-9_]/g, '_').slice(0, 40);
    const next: EditableGift = {
      id,
      name: 'Nuevo regalo',
      emoji: '🎁',
      coins: 10,
      level: 1,
      animation: '',
      animScale: 0.55,
      enabled: true,
      placements: [...ALL_GIFT_PLACEMENTS],
      face: null,
    };
    setGifts((prev) => [...prev, next]);
    setSelectedGiftId(id);
    giftsDirtyRef.current = true;
    setMessage('Regalo agregado en borrador. Publica para guardar.');
  }

  function duplicateGift(id: string) {
    const row = gifts.find((g) => g.id === id);
    if (!row) return;
    const nextId = `regalo_${Date.now().toString(36)}`.replace(/[^a-z0-9_]/g, '_').slice(0, 40);
    const copy: EditableGift = {
      ...row,
      id: nextId,
      name: `${row.name} copia`,
      face: row.face ? { ...row.face } : null,
      media: row.media ? { ...row.media } : defaultGiftMedia(),
    };
    setGifts((prev) => [...prev, copy]);
    setSelectedGiftId(nextId);
    giftsDirtyRef.current = true;
    setMessage('Copia creada en borrador. Publica para guardar.');
  }

  async function confirmPermanentDelete() {
    if (!gift) return;
    const giftId = gift.id;
    const next = gifts.filter((g) => g.id !== giftId);
    if (!next.length) {
      setDeleteError('Debe quedar al menos un regalo en el catálogo.');
      return;
    }
    setSaving(true);
    setDeleteError(null);
    setMessage(null);
    try {
      await deleteGiftPermanentlyApi(giftId);
      giftsDirtyRef.current = true;
      setGifts(next);
      setSelectedGiftId(next[0]?.id || '');
      setDeleteOpen(false);
      setMessage('Regalo eliminado de todos lados.');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar el regalo');
    } finally {
      setSaving(false);
    }
  }

  function togglePlacement(id: string, placement: GiftPlacement) {
    const row = gifts.find((g) => g.id === id);
    if (!row) return;
    const has = row.placements.includes(placement);
    const next = has
      ? row.placements.filter((p) => p !== placement)
      : [...row.placements, placement];
    patchGift(id, { placements: next.length ? next : ['live'] });
  }

  async function publishGifts() {
    const busy = gifts.find(
      (row) => row.media?.processingStatus === 'processing' || row.media?.processingStatus === 'uploading',
    );
    if (busy || bgBusy) {
      setMessage('Espera a que termine el procesamiento antes de publicar.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const version = Math.max(1, giftsVersion + 1);
      await saveGiftsCatalog({ version, gifts }, email);
      giftsDirtyRef.current = false;
      setMessage(`Regalos publicados (v${version}).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo publicar regalos');
    } finally {
      setSaving(false);
    }
  }

  async function publishPacks() {
    setSaving(true);
    setMessage(null);
    try {
      const version = Math.max(1, packsVersion + 1);
      await saveCoinPackagesConfig({ version, packages: packs }, email);
      packsDirtyRef.current = false;
      setMessage(`Paquetes Blast publicados (v${version}).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo publicar paquetes');
    } finally {
      setSaving(false);
    }
  }

  async function onUploadGiftAsset(kind: 'image' | 'video', file: File | null) {
    if (!file || !gift) return;
    if (kind === 'image') {
      setImageUploading(true);
      setMessage(null);
      try {
        const url = await uploadCatalogAsset('gifts', `${gift.id}-image`, file);
        patchGift(gift.id, { image: url });
        setMessage('Imagen subida. Publica para aplicar.');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Error al subir archivo');
      } finally {
        setImageUploading(false);
      }
      return;
    }

    if (!isGiftAnimationFile(file) && !needsAlphaMovConvert(file)) {
      setMessage('Usa un WebM, MP4 o MOV ProRes 4444.');
      return;
    }

    const targetGiftId = gift.id;
    const gen = (animGenRef.current[targetGiftId] || 0) + 1;
    animGenRef.current[targetGiftId] = gen;
    const convertMov = needsAlphaMovConvert(file);
    setMessage(null);
    setAnimProgress((prev) => ({
      ...prev,
      [targetGiftId]: {
        stage: 'uploading',
        label: convertMov ? 'Subiendo archivo…' : 'Subiendo…',
        percent: 0,
        indeterminate: false,
        fileName: file.name,
        fileBytes: file.size,
      },
    }));
    try {
      if (convertMov) {
        const result = await uploadGiftAnimation(targetGiftId, file, (progress) => {
          setAnimProgress((prev) => ({ ...prev, [targetGiftId]: progress }));
        });
        if (animGenRef.current[targetGiftId] !== gen) return;
        patchGift(targetGiftId, {
          video: result.url,
          media: {
            ...(gift.media || defaultGiftMedia()),
            originalAsset: result.url,
            processedAsset: null,
            backgroundRemoved: false,
            processingStatus: 'ready',
            hasAudio: result.job?.hasAudio !== false,
          },
        });
        const warn = result.job?.warning;
        setMessage(
          warn ? `${warn} Publica para aplicar.` : 'MOV convertido a WebM. Publica para aplicar.',
        );
        forgetGiftAlphaJob(targetGiftId);
      } else {
        const result = await uploadGiftSource(targetGiftId, file, (percent) => {
          setAnimProgress((prev) => ({
            ...prev,
            [targetGiftId]: {
              stage: 'uploading',
              label: `Subiendo archivo… ${percent}%`,
              percent,
              indeterminate: false,
              fileName: file.name,
              fileBytes: file.size,
            },
          }));
        });
        if (animGenRef.current[targetGiftId] !== gen) return;
        patchGift(targetGiftId, {
          video: result.url,
          media: result.media,
        });
        setAnimProgress((prev) => ({
          ...prev,
          [targetGiftId]: {
            stage: 'done',
            label: result.media.hasAudio ? 'Video con audio listo.' : 'Video listo.',
            percent: 100,
            indeterminate: false,
            fileName: file.name,
            fileBytes: file.size,
          },
        }));
        setMessage(
          result.media.hasAudio
            ? 'Animación subida con audio completo. Publica para aplicar.'
            : 'Animación subida. Publica para aplicar.',
        );
      }
    } catch (err) {
      if (animGenRef.current[targetGiftId] !== gen) return;
      const error = err instanceof Error ? err.message : 'Error al subir archivo';
      setAnimProgress((prev) => ({
        ...prev,
        [targetGiftId]: {
          ...(prev[targetGiftId] || {
            stage: 'failed',
            label: 'Error al convertir',
            percent: null,
            indeterminate: false,
            fileName: file.name,
            fileBytes: file.size,
          }),
          stage: 'failed',
          label: 'Error al convertir',
          error,
        },
      }));
      setMessage(error);
    }
  }

  async function onRetryGiftAnim(targetGiftId: string) {
    const jobId = rememberedGiftAlphaJobId(targetGiftId);
    if (!jobId) {
      setMessage('Vuelve a soltar el MOV para convertir.');
      return;
    }
    const row = gifts.find((g) => g.id === targetGiftId);
    const gen = (animGenRef.current[targetGiftId] || 0) + 1;
    animGenRef.current[targetGiftId] = gen;
    setMessage(null);
    setAnimProgress((prev) => ({
      ...prev,
      [targetGiftId]: {
        stage: 'queued',
        label: 'En cola…',
        percent: null,
        indeterminate: true,
        fileName: prev[targetGiftId]?.fileName,
        fileBytes: prev[targetGiftId]?.fileBytes,
        error: null,
      },
    }));
    try {
      const job = await retryGiftAlphaJob(jobId, (next) => {
        setAnimProgress((prev) => ({
          ...prev,
          [targetGiftId]: {
            stage: (next.stage || 'queued') as GiftAnimProgress['stage'],
            label: giftAlphaStageLabel(next.stage || 'queued', next.progressPercent),
            percent: next.progressPercent,
            indeterminate: Boolean(next.indeterminate) || next.progressPercent == null,
            warning: next.warning,
            error: next.error,
            fileName: next.fileName || prev[targetGiftId]?.fileName,
            fileBytes: next.sourceBytes || prev[targetGiftId]?.fileBytes,
          },
        }));
      });
      if (animGenRef.current[targetGiftId] !== gen) return;
      if (!job.url) throw new Error('La conversión no devolvió un video');
      patchGift(targetGiftId, {
        video: job.url,
        media: {
          ...(row?.media || defaultGiftMedia()),
          originalAsset: job.url,
          processedAsset: null,
          backgroundRemoved: false,
          processingStatus: 'ready',
          hasAudio: job.hasAudio !== false,
        },
      });
      forgetGiftAlphaJob(targetGiftId);
      setAnimProgress((prev) => ({
        ...prev,
        [targetGiftId]: {
          stage: 'done',
          label: 'Animación lista.',
          percent: 100,
          indeterminate: false,
          fileName: job.fileName || prev[targetGiftId]?.fileName,
          fileBytes: job.sourceBytes || prev[targetGiftId]?.fileBytes,
        },
      }));
      setMessage(
        job.warning ? `${job.warning} Publica para aplicar.` : 'MOV convertido a WebM. Publica para aplicar.',
      );
    } catch (err) {
      if (animGenRef.current[targetGiftId] !== gen) return;
      const error = err instanceof Error ? err.message : 'No se pudo reintentar la conversión';
      setAnimProgress((prev) => ({
        ...prev,
        [targetGiftId]: {
          ...(prev[targetGiftId] || {
            stage: 'failed',
            label: 'Error al convertir',
            percent: null,
            indeterminate: false,
          }),
          stage: 'failed',
          label: 'Error al convertir',
          error,
        },
      }));
      setMessage(error);
    }
  }

  async function removeBackground(mode: 'auto' | 'adjust', similarity?: number, blend?: number) {
    if (!gift?.video) {
      setMessage('Sube un video para quitar el fondo.');
      return;
    }
    const preserveAlpha = Boolean(gift.media?.hasAlpha) && gift.media?.alphaUsable !== false;
    if (preserveAlpha && mode === 'auto') {
      setMessage('Esta animación ya tiene transparencia real. No se volvió a recortar ni se sustituye el original.');
      return;
    }
    const storagePath =
      giftStoragePathFromUrl(gift.media?.originalAsset || gift.video) ||
      giftStoragePathFromUrl(gift.video);
    if (!storagePath) {
      setMessage('Sube el video al catálogo para quitar fondo (no aplica a archivos /gifts del sitio).');
      return;
    }
    setBgBusy(true);
    setMessage(null);
    patchGift(gift.id, {
      media: {
        ...(gift.media || defaultGiftMedia()),
        originalAsset: gift.media?.originalAsset || gift.video,
        processingStatus: 'processing',
      },
    });
    try {
      const job = await startGiftBackgroundRemove(gift.id, storagePath, {
        mode,
        similarity,
        blend,
        onProgress: (next) => {
          setAnimProgress((prev) => ({
            ...prev,
            [gift.id]: {
              stage: next.stage === 'failed' ? 'failed' : next.stage === 'done' ? 'done' : 'converting',
              label:
                next.stage === 'converting'
                  ? `Procesando fondo… ${next.progressPercent ?? ''}`.trim()
                  : next.stage === 'done'
                    ? 'Fondo listo.'
                    : 'Procesando fondo…',
              percent: next.progressPercent,
              indeterminate: Boolean(next.indeterminate) || next.progressPercent == null,
              warning: next.warning,
              error: next.error,
            },
          }));
        },
      });
      if (!job.url) throw new Error('No se pudo quitar el fondo. El archivo original sigue disponible.');
      if (job.hasAudio === false && gift.media?.hasAudio) {
        throw new Error('El WebM procesado quedó mudo. El original sigue disponible.');
      }
      const preserved = Boolean(job.preservedOriginal);
      const nextMedia: GiftMediaInfo = {
        ...(gift.media || defaultGiftMedia()),
        originalAsset: gift.media?.originalAsset || gift.video,
        processedAsset: preserved ? gift.media?.processedAsset || null : job.url,
        backgroundRemoved: preserved ? Boolean(gift.media?.backgroundRemoved) : true,
        hasAudio: Boolean(job.hasAudio || gift.media?.hasAudio),
        duration: job.durationSec || gift.media?.duration || 0,
        width: job.width || gift.media?.width || 0,
        height: job.height || gift.media?.height || 0,
        fps: job.fps || gift.media?.fps || 0,
        codec: job.codec || gift.media?.codec || 'vp9',
        hasAlpha: job.hasAlpha !== false,
        alphaUsable: job.alphaUsable == null ? true : Boolean(job.alphaUsable),
        alphaWarning: job.warning || null,
        processingStatus: 'ready',
      };
      patchGift(gift.id, { video: preserved ? gift.video : job.url, media: nextMedia });
      setMessage(
        job.warning
          ? `${job.warning} Publica para aplicar.`
          : preserved
            ? 'Transparencia conservada. Publica para aplicar.'
            : 'Fondo quitado. Publica para aplicar.',
      );
    } catch (err) {
      patchGift(gift.id, {
        media: {
          ...(gift.media || defaultGiftMedia()),
          originalAsset: gift.media?.originalAsset || gift.video,
          processingStatus: 'error',
        },
      });
      setMessage(err instanceof Error ? err.message : 'No se pudo quitar el fondo. El archivo original sigue disponible.');
    } finally {
      setBgBusy(false);
    }
  }

  async function onUploadPackArt(file: File | null) {
    if (!file || !pack) return;
    setUploading(true);
    setMessage(null);
    try {
      const url = await uploadCatalogAsset('blast', pack.id, file);
      patchPack(pack.id, { artUrl: url });
      setMessage('Arte del paquete subido. Publica para aplicar.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al subir archivo');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {allowedGifts ? (
        <button
          type="button"
          onClick={() => setSub('gifts')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            sub === 'gifts'
              ? 'bg-fuchsia-500/20 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
              : 'bg-zinc-800/60 text-zinc-400'
          }`}
        >
          Regalos / animaciones
        </button>
        ) : null}
        {allowedCoins ? (
        <button
          type="button"
          onClick={() => setSub('coins')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            sub === 'coins'
              ? 'bg-fuchsia-500/20 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
              : 'bg-zinc-800/60 text-zinc-400'
          }`}
        >
          Paquetes Blast
        </button>
        ) : null}
        {sub === 'gifts' ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void publishGifts()}
            className="ml-auto rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Publicando…' : 'Publicar regalos'}
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void publishPacks()}
            className="ml-auto rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Publicando…' : 'Publicar paquetes'}
          </button>
        )}
      </div>

      {message ? (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
          {message}
        </p>
      ) : null}

      {sub === 'gifts' && gift ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <aside className="lb-panel max-h-[70dvh] space-y-2 overflow-y-auto rounded-2xl p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar regalo…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={addGift}
              className="w-full rounded-xl border border-dashed border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-2 text-sm font-semibold text-fuchsia-100 hover:bg-fuchsia-500/20"
            >
              + Agregar regalo
            </button>
            {filteredGifts.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedGiftId(row.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                  row.id === gift.id
                    ? 'bg-fuchsia-500/20 font-semibold text-fuchsia-100'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span className="text-lg">{row.emoji}</span>
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                {!row.enabled ? <span className="text-[10px] text-rose-300">off</span> : null}
              </button>
            ))}
          </aside>

          <section className="lb-panel space-y-4 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-3xl">{gift.emoji}</span>
              <div>
                <h2 className="text-lg font-bold text-white">{gift.name}</h2>
                <p className="text-xs text-zinc-500">{gift.id}</p>
              </div>
              <label className="ml-auto flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={gift.enabled}
                  onChange={(e) => patchGift(gift.id, { enabled: e.target.checked })}
                />
                Activo
              </label>
              <button
                type="button"
                onClick={() => duplicateGift(gift.id)}
                className="rounded-xl border border-white/15 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                Duplicar
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
                className="rounded-xl border border-rose-500/50 bg-rose-600/20 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-600/35"
              >
                Borrar permanentemente
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs text-zinc-400">
                Nombre
                <input
                  value={gift.name}
                  onChange={(e) => patchGift(gift.id, { name: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Emoji
                <input
                  value={gift.emoji}
                  onChange={(e) => patchGift(gift.id, { emoji: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Precio (Blast)
                <input
                  type="number"
                  min={0}
                  value={gift.coins}
                  onChange={(e) => patchGift(gift.id, { coins: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Nivel animación
                <select
                  value={gift.level}
                  onChange={(e) => patchGift(gift.id, { level: Number(e.target.value) as GiftLevel })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      Nivel {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1 text-xs text-zinc-400">
              Descripción de animación
              <textarea
                value={gift.animation}
                rows={3}
                onChange={(e) => patchGift(gift.id, { animation: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Ubicaciones donde aparece
              </p>
              <p className="mb-2 text-[10px] text-zinc-500">
                La casilla habilita el regalo. El nombre abre la previsualización de esa pantalla.
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_GIFT_PLACEMENTS.map((placement) => {
                  const on = gift.placements.includes(placement);
                  const previewing = previewPlacement === placement;
                  return (
                    <div
                      key={placement}
                      className={`flex min-h-11 items-center gap-1.5 rounded-full px-2 py-1 ${
                        previewing
                          ? 'bg-cyan-500/20 ring-1 ring-cyan-400/50'
                          : on
                            ? 'bg-zinc-800 ring-1 ring-white/10'
                            : 'bg-zinc-900'
                      }`}
                    >
                      <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-cyan-400"
                          checked={on}
                          onChange={() => togglePlacement(gift.id, placement)}
                          aria-label={`Habilitar ${PLACEMENT_LABELS[placement]}`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setPreviewPlacement(placement)}
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          previewing ? 'text-cyan-100' : on ? 'text-zinc-100' : 'text-zinc-500'
                        }`}
                      >
                        {PLACEMENT_LABELS[placement]}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">
                Previsualizando {PLACEMENT_LABELS[previewPlacement]}
                {gift.placements.includes(previewPlacement) ? '' : ' · no habilitada aún'}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <AssetDropZone
                  label="Imagen PNG / WebP"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hint="Arrastra o haz clic · PNG, JPG, WebP"
                  previewUrl={gift.image}
                  disabled={imageUploading}
                  onFile={(file) => void onUploadGiftAsset('image', file)}
                />
                <label className="block space-y-1 text-xs text-zinc-400">
                  URL imagen (opcional)
                  <input
                    value={gift.image || ''}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      patchGift(gift.id, { image: value || undefined });
                    }}
                    placeholder="/gifts/besito.png o https://…"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
              <div className="space-y-3">
                <AssetDropZone
                  label="Animación WebM / MP4 / MOV 4444"
                  accept="video/webm,video/mp4,video/quicktime,.webm,.mp4,.mov,.MOV"
                  hint={`Arrastra un WebM, MP4 o MOV ProRes 4444. Los MOV se convierten automáticamente a WebM. ${giftAnimLimitsHint()}.`}
                  previewUrl={gift.video}
                  isVideo
                  progress={animProgress[gift.id] || null}
                  disabled={bgBusy}
                  onFile={(file) => void onUploadGiftAsset('video', file)}
                  onRetry={() => void onRetryGiftAnim(gift.id)}
                />
                <label className="block space-y-1 text-xs text-zinc-400">
                  URL animación (opcional)
                  <input
                    value={gift.video || ''}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      patchGift(gift.id, { video: value || undefined });
                    }}
                    placeholder="/gifts/flor_tropical.webm o MOV 4444 convertido"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Quitar fondo
                  </p>
                  {gift.media?.hasAlpha && gift.media?.alphaUsable !== false ? (
                    <p className="text-[11px] text-emerald-200/90">
                      Esta animación ya tiene transparencia real. No se volverá a recortar el fondo ni se
                      sustituye el original.
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-400">
                      Úsalo solo si el fondo va pegado a los píxeles. Si el recorte sale mal, restaura el
                      original y usa Ajustar.
                    </p>
                  )}
                  {gift.media?.alphaWarning ? (
                    <p className="text-[11px] text-amber-200/90">{gift.media.alphaWarning}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={
                        bgBusy ||
                        !gift.video ||
                        Boolean(gift.media?.hasAlpha && gift.media?.alphaUsable !== false)
                      }
                      onClick={() => void removeBackground('auto')}
                      className="min-h-11 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/30 disabled:opacity-40"
                    >
                      {bgBusy ? 'Procesando fondo…' : 'Quitar fondo'}
                    </button>
                    <button
                      type="button"
                      disabled={
                        bgBusy ||
                        !gift.video ||
                        Boolean(gift.media?.hasAlpha && gift.media?.alphaUsable === true)
                      }
                      onClick={() => setAdjustMode((v) => !v)}
                      className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold ${
                        adjustMode ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      Ajustar
                    </button>
                    <button
                      type="button"
                      disabled={!gift.media?.originalAsset}
                      onClick={() => {
                        const media = gift.media || defaultGiftMedia();
                        patchGift(gift.id, {
                          video: media.originalAsset || gift.video,
                          media: { ...media, backgroundRemoved: false, processingStatus: 'ready' },
                        });
                        setMessage('Se restauró el archivo original.');
                      }}
                      className="min-h-11 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200"
                    >
                      Restaurar original
                    </button>
                  </div>
                  {adjustMode ? (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={bgBusy}
                        onClick={() => void removeBackground('adjust', 0.09, 0.08)}
                        className="rounded-lg bg-zinc-800 px-3 py-2 text-[11px] font-semibold text-zinc-200"
                      >
                        Conservar
                      </button>
                      <button
                        type="button"
                        disabled={bgBusy}
                        onClick={() => void removeBackground('adjust', 0.26, 0.08)}
                        className="rounded-lg bg-zinc-800 px-3 py-2 text-[11px] font-semibold text-zinc-200"
                      >
                        Borrar
                      </button>
                      <button
                        type="button"
                        disabled={bgBusy}
                        onClick={() => void removeBackground('adjust', 0.16, 0.22)}
                        className="rounded-lg bg-zinc-800 px-3 py-2 text-[11px] font-semibold text-zinc-200"
                      >
                        Suavizar borde
                      </button>
                    </div>
                  ) : null}
                  <p className="text-[10px] text-zinc-500">
                    Solo el fondo visual. El audio se conserva en WebM VP9 + alpha + Opus.
                  </p>
                </div>
              </div>
            </div>

            <GiftCatalogPreview
              gift={gift}
              device={previewDevice}
              previewPlacement={previewPlacement}
              onDeviceChange={setPreviewDevice}
              onAnimScaleChange={(scale) => patchGift(gift.id, { animScale: scale })}
              onLayoutChange={(giftLayout) => patchGift(gift.id, { giftLayout })}
              onMediaChange={(media) => patchGift(gift.id, { media })}
            />

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Ubicación en cara (Face Mesh)
                </p>
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={Boolean(gift.face)}
                    onChange={(e) =>
                      patchGift(gift.id, {
                        face: e.target.checked
                          ? {
                              emoji: gift.emoji,
                              anchor: 'hat',
                              scale: 1.2,
                              offsetY: -0.8,
                            }
                          : null,
                      })
                    }
                  />
                  Activar anclaje
                </label>
              </div>
              {gift.face ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Ancla
                    <select
                      value={gift.face.anchor}
                      onChange={(e) =>
                        patchGift(gift.id, {
                          face: {
                            ...gift.face!,
                            anchor: e.target.value as NonNullable<EditableGift['face']>['anchor'],
                          },
                        })
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    >
                      <option value="hat">Sombrero / frente</option>
                      <option value="crown">Corona</option>
                      <option value="mask">Máscara</option>
                      <option value="glasses">Lentes</option>
                      <option value="kiss">Labios / beso</option>
                    </select>
                  </label>
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Emoji en cara
                    <input
                      value={gift.face.emoji}
                      onChange={(e) =>
                        patchGift(gift.id, { face: { ...gift.face!, emoji: e.target.value } })
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Escala ({gift.face.scale.toFixed(2)})
                    <input
                      type="range"
                      min={0.2}
                      max={2.5}
                      step={0.05}
                      value={gift.face.scale}
                      onChange={(e) =>
                        patchGift(gift.id, {
                          face: { ...gift.face!, scale: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-cyan-400"
                    />
                  </label>
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Offset Y ({gift.face.offsetY.toFixed(2)})
                    <input
                      type="range"
                      min={-1.5}
                      max={1.5}
                      step={0.05}
                      value={gift.face.offsetY}
                      onChange={(e) =>
                        patchGift(gift.id, {
                          face: { ...gift.face!, offsetY: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-cyan-400"
                    />
                  </label>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Sin anclaje facial (animación flotante normal).</p>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {deleteOpen && gift && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[240] flex items-start justify-center overflow-y-auto bg-black/70 px-4 pb-8 pt-[max(4.75rem,calc(var(--lb-safe-top,0px)+4.75rem))]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="gift-delete-title"
            >
              <div className="w-full max-w-md space-y-3 rounded-2xl border border-rose-500/30 bg-zinc-950 p-4 shadow-2xl">
                <h3 id="gift-delete-title" className="text-base font-bold text-white">
                  ¿Eliminar este regalo permanentemente?
                </h3>
                <p className="text-sm text-zinc-300">
                  Esta acción eliminará el regalo y sus recursos asociados y no se puede deshacer.
                </p>
                {deleteError ? <p className="text-sm text-rose-300">{deleteError}</p> : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setDeleteOpen(false);
                      setDeleteError(null);
                    }}
                    className="min-h-11 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void confirmPermanentDelete()}
                    className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {saving ? 'Eliminando…' : 'Aceptar'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {sub === 'coins' && pack ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <aside className="lb-panel max-h-[70dvh] space-y-1 overflow-y-auto rounded-2xl p-2">
            {packs.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedPackId(row.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                  row.id === pack.id
                    ? 'bg-fuchsia-500/20 font-semibold text-fuchsia-100'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {row.name} · {row.coins}
                {!row.enabled ? <span className="ml-2 text-[10px] text-rose-300">off</span> : null}
              </button>
            ))}
          </aside>
          <section className="lb-panel space-y-4 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <img src={pack.artUrl} alt="" className="h-16 w-16 object-contain" />
              <div>
                <h2 className="text-lg font-bold text-white">{pack.name}</h2>
                <p className="text-xs text-zinc-500">{pack.id}</p>
              </div>
              <label className="ml-auto flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={pack.enabled}
                  onChange={(e) => patchPack(pack.id, { enabled: e.target.checked })}
                />
                Activo
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs text-zinc-400">
                Nombre
                <input
                  value={pack.name}
                  onChange={(e) => patchPack(pack.id, { name: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Blast
                <input
                  type="number"
                  min={1}
                  value={pack.coins}
                  onChange={(e) => patchPack(pack.id, { coins: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Precio (centavos COP Wompi)
                <input
                  type="number"
                  min={100}
                  value={pack.amountInCop}
                  onChange={(e) => patchPack(pack.id, { amountInCop: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
                <span className="text-[11px] text-zinc-500">{packageCopLabel(pack.amountInCop)}</span>
              </label>
              <div className="space-y-2 sm:col-span-2">
                <AssetDropZone
                  label="Arte del paquete"
                  accept="image/png,image/jpeg,image/webp"
                  hint="Arrastra o haz clic · imagen desde el escritorio"
                  previewUrl={pack.artUrl}
                  disabled={uploading}
                  onFile={(file) => void onUploadPackArt(file)}
                />
                <label className="block space-y-1 text-xs text-zinc-400">
                  URL arte (opcional)
                  <input
                    value={pack.artUrl}
                    onChange={(e) => patchPack(pack.id, { artUrl: e.target.value })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pack.popular}
                  onChange={(e) => patchPack(pack.id, { popular: e.target.checked })}
                />
                Popular
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pack.bestValue}
                  onChange={(e) => patchPack(pack.id, { bestValue: e.target.checked })}
                />
                Mejor valor
              </label>
            </div>
            <p className="text-xs text-amber-200/80">
              Nota: al cambiar precio/Blast, también debe alinearse el backend de pagos. Si el cobro
              falla tras publicar, avisa para sincronizar el servidor.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
