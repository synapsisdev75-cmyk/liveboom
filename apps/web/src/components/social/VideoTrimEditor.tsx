import {
  Check,
  ChevronDown,
  Loader2,
  Maximize2,
  Pencil,
  RotateCcw,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { readVideoDurationSec } from '../../lib/videoDuration';
import { BOOM_CLIP_MAX_DURATION_SEC } from '../../lib/videoTrim';
import { photoCssFilter, type PhotoEditValues } from '../../lib/photoEdit';
import { suggestHighlightClips, type HighlightSuggestion } from '../../lib/videoHighlightClips';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';

type Props = {
  file: File;
  previewUrl: string;
  durationSec: number;
  maxDurationSec?: number;
  title?: string;
  productLabel?: string;
  onCancel: () => void;
  onSave: (file: File) => void;
  onSaveMany?: (files: File[]) => void;
};

type EditorMode = 'manual' | 'ai';

type VideoAdjust = {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  warmth: number;
  exposure: number;
  shadows: number;
  highlights: number;
  speed: number;
  stabilize: boolean;
};

const DEFAULT_ADJUST: VideoAdjust = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpness: 0,
  warmth: 0,
  exposure: 0,
  shadows: 0,
  highlights: 0,
  speed: 1,
  stabilize: false,
};

const CLIP_COLORS = ['#f472b6', '#22d3ee', '#a78bfa', '#fb7185'];

const FILTER_PRESETS: { id: string; label: string; patch: Partial<VideoAdjust> }[] = [
  { id: 'none', label: 'Normal', patch: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpness: 0 } },
  { id: 'vivid', label: 'Vivo', patch: { saturation: 28, contrast: 12, sharpness: 10 } },
  { id: 'cine', label: 'Cine', patch: { contrast: 18, saturation: -8, warmth: -12, shadows: 10 } },
  { id: 'cold', label: 'Frío', patch: { warmth: -32, contrast: 8, highlights: 8 } },
];

type AiClip = HighlightSuggestion & { selected: boolean };

function productNoun(label: string, count: number) {
  if (count === 1) return label;
  if (label === 'Boom Clip') return 'Boom Clips';
  if (label === 'Flash Boom') return 'Flash Boom';
  return `${label}s`;
}

function formatClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function adjustFilter(adjust: VideoAdjust) {
  const mapped: PhotoEditValues = {
    zoom: 100,
    panX: 0,
    panY: 0,
    rotate: 0,
    brightness: adjust.brightness,
    contrast: adjust.contrast,
    saturation: adjust.saturation,
    sharpness: adjust.sharpness,
    warmth: adjust.warmth,
    exposure: adjust.exposure,
    shadows: adjust.shadows,
    highlights: adjust.highlights,
    vignette: 0,
    crop: 'free',
  };
  return photoCssFilter(mapped);
}

function isDefaultAdjust(adjust: VideoAdjust) {
  return (
    adjust.brightness === 0 &&
    adjust.contrast === 0 &&
    adjust.saturation === 0 &&
    adjust.sharpness === 0 &&
    adjust.warmth === 0 &&
    adjust.exposure === 0 &&
    adjust.shadows === 0 &&
    adjust.highlights === 0 &&
    adjust.speed === 1 &&
    !adjust.stabilize
  );
}

export function VideoTrimEditor({
  file,
  previewUrl,
  durationSec: durationHint,
  maxDurationSec = BOOM_CLIP_MAX_DURATION_SEC,
  title = 'Editar video',
  productLabel = 'Boom Clip',
  onCancel,
  onSave,
  onSaveMany,
}: Props) {
  useBodyScrollLock(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ edge: 'start' | 'end' | 'range'; x: number; start: number; end: number } | null>(null);

  const [durationSec, setDurationSec] = useState(() =>
    durationHint > 0 ? durationHint : maxDurationSec,
  );
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(() =>
    Math.min(durationHint > 0 ? durationHint : maxDurationSec, maxDurationSec),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(durationHint <= 0);
  const [mode, setMode] = useState<EditorMode>('manual');
  const [adjust, setAdjust] = useState<VideoAdjust>(DEFAULT_ADJUST);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [aiClips, setAiClips] = useState<AiClip[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [showAdjustPanel, setShowAdjustPanel] = useState(true);
  const [mobileSection, setMobileSection] = useState<'trim' | 'color' | 'speed' | 'ai'>('color');

  const clipDuration = useMemo(() => Math.max(0, endSec - startSec), [startSec, endSec]);
  const maxEnd = useMemo(
    () => Math.min(durationSec, startSec + maxDurationSec),
    [durationSec, startSec, maxDurationSec],
  );
  const selectedAi = aiClips.filter((item) => item.selected);
  const cssFilter = adjustFilter(adjust);

  useEffect(() => {
    if (durationHint > 0) return;
    let cancelled = false;
    setLoadingMeta(true);
    void readVideoDurationSec(file, maxDurationSec)
      .then((sec) => {
        if (cancelled) return;
        const safe = Math.max(1, sec);
        setDurationSec(safe);
        setEndSec(Math.min(safe, maxDurationSec));
        setLoadingMeta(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('No se pudo cargar el video. Prueba otro archivo o graba de nuevo.');
        setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [durationHint, file, maxDurationSec]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || loadingMeta) return;
    video.currentTime = startSec;
    video.playbackRate = adjust.speed;
  }, [startSec, loadingMeta, adjust.speed]);

  useEffect(() => {
    if (endSec > maxEnd) setEndSec(maxEnd);
    if (endSec <= startSec) setEndSec(Math.min(startSec + 1, maxEnd));
  }, [endSec, maxEnd, startSec]);

  useEffect(() => {
    if (loadingMeta || durationSec < 1) return;
    let cancelled = false;
    const video = document.createElement('video');
    video.src = previewUrl;
    video.muted = true;
    video.playsInline = true;
    const count = durationSec > 90 ? 12 : 8;
    void (async () => {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('thumb'));
      });
      const frames: string[] = [];
      const canvas = document.createElement('canvas');
      canvas.width = 72;
      canvas.height = 40;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      for (let i = 0; i < count; i += 1) {
        if (cancelled) return;
        video.currentTime = (durationSec * i) / Math.max(1, count - 1);
        await new Promise((resolve) => {
          video.onseeked = () => resolve(undefined);
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.6));
      }
      if (!cancelled) setThumbs(frames);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      video.src = '';
    };
  }, [previewUrl, durationSec, loadingMeta]);

  const runAi = useCallback(async () => {
    setAiBusy(true);
    setError(null);
    try {
      const list = await suggestHighlightClips(file, durationSec, maxDurationSec);
      setAiClips(list.map((item) => ({ ...item, selected: true })));
    } catch {
      setError('No se pudieron generar sugerencias. Puedes recortar en Manual.');
    } finally {
      setAiBusy(false);
    }
  }, [file, durationSec, maxDurationSec]);

  useEffect(() => {
    if (mode !== 'ai' || aiClips.length > 0 || aiBusy || loadingMeta) return;
    void runAi();
  }, [mode, aiClips.length, aiBusy, loadingMeta, runAi]);

  function setModeSafe(next: EditorMode) {
    if (next === 'ai' && editingClipId) {
      setAiClips((current) =>
        current.map((item) => (item.id === editingClipId ? { ...item, startSec, endSec } : item)),
      );
      setEditingClipId(null);
    }
    setMode(next);
    setError(null);
  }

  function openHeaderMode(next: EditorMode) {
    setModeSafe(next);
    if (next === 'ai') setMobileSection('ai');
    else setMobileSection((current) => (current === 'ai' ? 'color' : current));
  }

  function onHandleDown(edge: 'start' | 'end' | 'range', event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { edge, x: event.clientX, start: startSec, end: endSec };
  }

  function onHandleMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect) return;
    const deltaSec = ((event.clientX - drag.x) / Math.max(1, rect.width)) * durationSec;
    const span = drag.end - drag.start;
    if (drag.edge === 'range') {
      const nextStart = Math.min(Math.max(0, drag.start + deltaSec), Math.max(0, durationSec - span));
      setStartSec(nextStart);
      setEndSec(Math.min(nextStart + span, durationSec));
      return;
    }
    if (drag.edge === 'start') {
      setStartSec(Math.min(Math.max(0, drag.start + deltaSec), drag.end - 1));
      return;
    }
    setEndSec(Math.max(Math.min(Math.min(durationSec, drag.start + maxDurationSec), drag.end + deltaSec), drag.start + 1));
  }

  function onHandleUp() {
    dragRef.current = null;
  }

  async function exportRange(from: number, to: number) {
    const { trimVideoFile } = await import('../../lib/videoTrim');
    if (to - from >= durationSec - 0.25 && from < 0.25) return file;
    return trimVideoFile(file, from, to);
  }

  async function handleSaveManual() {
    if (clipDuration < 1) {
      setError('El clip debe durar al menos 1 segundo.');
      return;
    }
    if (clipDuration > maxDurationSec) {
      setError(`Máximo ${maxDurationSec} segundos.`);
      return;
    }
    if (editingClipId) {
      setAiClips((current) =>
        current.map((item) =>
          item.id === editingClipId ? { ...item, startSec, endSec } : item,
        ),
      );
      setEditingClipId(null);
      setMode('ai');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSave(await exportRange(startSec, endSec));
    } catch (err) {
      if (clipDuration >= durationSec - 0.25 && startSec < 0.25) {
        onSave(file);
        return;
      }
      setError(err instanceof Error ? err.message : 'No se pudo recortar el video');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMany() {
    const picks = selectedAi;
    if (picks.length === 0) {
      setError('Selecciona al menos un clip.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const files: File[] = [];
      for (const clip of picks) {
        files.push(await exportRange(clip.startSec, clip.endSec));
      }
      if (files.length === 1 && files[0]) onSave(files[0]);
      else if (onSaveMany) onSaveMany(files);
      else if (files[0]) onSave(files[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron crear los clips');
    } finally {
      setBusy(false);
    }
  }

  function editAiClip(clip: AiClip) {
    setStartSec(clip.startSec);
    setEndSec(Math.min(clip.endSec, clip.startSec + maxDurationSec));
    setEditingClipId(clip.id);
    setMode('manual');
    setMobileSection('trim');
    setShowAdjustPanel(true);
  }

  const startPct = (startSec / Math.max(1, durationSec)) * 100;
  const endPct = (endSec / Math.max(1, durationSec)) * 100;

  const slidersBasic: { key: keyof VideoAdjust; label: string; min: number; max: number }[] = [
    { key: 'brightness', label: 'Brillo', min: -80, max: 80 },
    { key: 'contrast', label: 'Contraste', min: -80, max: 80 },
    { key: 'saturation', label: 'Saturación', min: -80, max: 80 },
    { key: 'sharpness', label: 'Nitidez', min: 0, max: 80 },
  ];
  const slidersAdvanced: { key: keyof VideoAdjust; label: string; min: number; max: number }[] = [
    { key: 'warmth', label: 'Temperatura', min: -80, max: 80 },
    { key: 'exposure', label: 'Exposición', min: -80, max: 80 },
    { key: 'shadows', label: 'Sombras', min: -80, max: 80 },
    { key: 'highlights', label: 'Luces', min: -80, max: 80 },
  ];

  function openMobileSection(next: 'trim' | 'color' | 'speed' | 'ai') {
    setShowAdjustPanel(true);
    setMobileSection(next);
    if (next === 'ai') setModeSafe('ai');
    else if (mode === 'ai') setModeSafe('manual');
  }

  function isPresetActive(preset: (typeof FILTER_PRESETS)[number]) {
    return (Object.keys(preset.patch) as (keyof VideoAdjust)[]).every(
      (key) => adjust[key] === preset.patch[key],
    );
  }

  function renderSlider(slider: { key: keyof VideoAdjust; label: string; min: number; max: number }) {
    const value = Number(adjust[slider.key]);
    return (
      <label key={slider.key} className="block min-w-0">
        <span className="mb-0.5 flex justify-between text-[10px] text-zinc-400">
          {slider.label}
          <span className="tabular-nums text-zinc-300">{value}</span>
        </span>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          value={value}
          onChange={(event) =>
            setAdjust((current) => ({ ...current, [slider.key]: Number(event.target.value) }))
          }
          className="lb-photo-slider w-full min-h-8"
        />
      </label>
    );
  }

  function renderSpeedRow() {
    return (
      <div className="flex flex-wrap gap-1.5">
        {[0.5, 1, 1.5, 2].map((rate) => (
          <button
            key={rate}
            type="button"
            onClick={() => setAdjust((current) => ({ ...current, speed: rate }))}
            className={`min-h-9 rounded-full border px-2.5 text-[10px] font-semibold ${
              adjust.speed === rate
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                : 'border-white/15 text-zinc-400'
            }`}
          >
            {rate}x
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAdjust((current) => ({ ...current, stabilize: !current.stabilize }))}
          className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-[10px] font-semibold ${
            adjust.stabilize
              ? 'border-violet-400 bg-violet-500/20 text-violet-100'
              : 'border-white/15 text-zinc-400'
          }`}
        >
          <Maximize2 size={11} />
          Estabilizar
        </button>
      </div>
    );
  }

  function renderColorFields() {
    return (
      <>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {FILTER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setAdjust((current) => ({ ...current, ...preset.patch }))}
              className={`min-h-8 rounded-full border px-2.5 text-[10px] font-semibold ${
                isPresetActive(preset)
                  ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                  : 'border-white/15 text-zinc-300'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Básicos</p>
        <div className="lb-video-editor-sliders">{slidersBasic.map(renderSlider)}</div>
        <p className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Avanzado</p>
        <div className="lb-video-editor-sliders">{slidersAdvanced.map(renderSlider)}</div>
      </>
    );
  }

  function renderColorPanel() {
    return (
      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          <p className="text-xs font-bold text-white">Ajustes</p>
          <button
            type="button"
            onClick={() => setAdjust(DEFAULT_ADJUST)}
            className="inline-flex min-h-9 items-center gap-1 rounded-full border border-white/15 px-2.5 text-[10px] text-zinc-300"
          >
            <RotateCcw size={12} />
            Restablecer
          </button>
        </div>
        {renderColorFields()}
        <p className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Movimiento
        </p>
        {renderSpeedRow()}
        {isDefaultAdjust(adjust) ? null : (
          <p className="mt-2 text-[10px] text-zinc-500">
            Los ajustes se ven en la vista previa. El recorte guarda el tramo elegido.
          </p>
        )}
      </div>
    );
  }

  function renderAiPanel() {
    return (
      <aside className="flex min-h-0 flex-col rounded-2xl border border-fuchsia-400/25 bg-black/30">
      <p className="px-3 pt-3 text-xs font-bold text-fuchsia-200">Clips sugeridos (IA)</p>
      {aiBusy ? (
        <p className="flex items-center gap-2 px-3 py-8 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          Analizando video…
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2">
          {aiClips.map((clip, index) => (
            <div
              key={clip.id}
              className="flex gap-2 rounded-xl border border-white/10 bg-zinc-900/80 p-2"
            >
              <button
                type="button"
                onClick={() =>
                  setAiClips((current) =>
                    current.map((item) =>
                      item.id === clip.id ? { ...item, selected: !item.selected } : item,
                    ),
                  )
                }
                className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md border ${
                  clip.selected ? 'border-cyan-400 bg-cyan-500 text-zinc-950' : 'border-white/20'
                }`}
                aria-label="Seleccionar clip"
              >
                {clip.selected ? <Check size={12} /> : null}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-white">
                  {index + 1}. {clip.title}
                </p>
                <p className="text-[10px] text-zinc-500">{clip.hint}</p>
                <p className="text-[10px] text-cyan-200">
                  {formatClock(clip.startSec)} – {formatClock(clip.endSec)} (
                  {(clip.endSec - clip.startSec).toFixed(0)} s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => editAiClip(clip)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white"
                aria-label="Ajustar clip"
              >
                <Pencil size={13} />
              </button>
              <span
                className="mt-1 h-8 w-1 shrink-0 rounded-full"
                style={{ background: CLIP_COLORS[index % CLIP_COLORS.length] }}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 border-t border-white/10 p-2">
        <button
          type="button"
          className="min-h-9 rounded-full border border-white/15 px-2.5 text-[10px] text-zinc-300"
          onClick={() => setAiClips((current) => current.map((item) => ({ ...item, selected: true })))}
        >
          Todos
        </button>
        <button
          type="button"
          className="min-h-9 rounded-full border border-white/15 px-2.5 text-[10px] text-zinc-300"
          onClick={() => setAiClips((current) => current.map((item) => ({ ...item, selected: false })))}
        >
          Ninguno
        </button>
        <button
          type="button"
          className="min-h-9 rounded-full border border-fuchsia-400/40 px-2.5 text-[10px] text-fuchsia-200"
          onClick={() => {
            setAiClips([]);
            void runAi();
          }}
        >
          Regenerar sugerencias
        </button>
        <button
          type="button"
          disabled={busy || aiBusy || selectedAi.length === 0}
          className="min-h-9 rounded-full border border-cyan-400/40 px-2.5 text-[10px] font-semibold text-cyan-200 disabled:opacity-50"
          onClick={() => void handleSaveMany()}
        >
          Generar clips automáticamente
        </button>
      </div>
    </aside>
    );
  }

  const timelineBlock = (
    <>
      <div
        ref={stripRef}
        className="relative mt-2 h-12 shrink-0 overflow-hidden rounded-2xl bg-zinc-900 touch-none sm:h-14"
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
      >
        <div className="absolute inset-0 flex">
          {(thumbs.length ? thumbs : Array.from({ length: 8 })).map((src, index) => (
            <div key={index} className="h-full flex-1 overflow-hidden">
              {typeof src === 'string' && src.startsWith('data:') ? (
                <img src={src} alt="" className="h-full w-full object-cover opacity-80" />
              ) : (
                <div className="h-full w-full bg-zinc-800" />
              )}
            </div>
          ))}
        </div>
        <div className="absolute inset-y-0 bg-black/55" style={{ left: 0, width: `${startPct}%` }} />
        <div className="absolute inset-y-0 bg-black/55" style={{ left: `${endPct}%`, right: 0 }} />
        {mode === 'ai'
          ? aiClips.map((clip, index) => (
              <button
                key={clip.id}
                type="button"
                className="absolute top-1 h-[calc(100%-0.5rem)] rounded-lg border-2"
                style={{
                  left: `${(clip.startSec / Math.max(1, durationSec)) * 100}%`,
                  width: `${((clip.endSec - clip.startSec) / Math.max(1, durationSec)) * 100}%`,
                  borderColor: CLIP_COLORS[index % CLIP_COLORS.length],
                  opacity: clip.selected ? 1 : 0.35,
                }}
                onClick={() => editAiClip(clip)}
                aria-label={clip.title}
              />
            ))
          : (
              <div
                className="absolute inset-y-1 cursor-grab rounded-xl border-2 border-cyan-300/90 touch-none"
                style={{ left: `${startPct}%`, width: `${Math.max(2, endPct - startPct)}%` }}
                onPointerDown={(event) => onHandleDown('range', event)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
              >
                <button
                  type="button"
                  className="absolute -left-2 top-1/2 h-11 w-4 -translate-y-1/2 rounded-full bg-cyan-400"
                  aria-label="Inicio"
                  onPointerDown={(event) => onHandleDown('start', event)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  onPointerCancel={onHandleUp}
                />
                <button
                  type="button"
                  className="absolute -right-2 top-1/2 h-11 w-4 -translate-y-1/2 rounded-full bg-fuchsia-400"
                  aria-label="Fin"
                  onPointerDown={(event) => onHandleDown('end', event)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  onPointerCancel={onHandleUp}
                />
              </div>
            )}
      </div>
      <p className="mt-1.5 shrink-0 text-center text-[11px] font-semibold text-cyan-200">
        {mode === 'manual'
          ? `Inicio ${startSec.toFixed(1)} s · Fin ${endSec.toFixed(1)} s · ${clipDuration.toFixed(1)} s / ${maxDurationSec} s`
          : `Máximo ${maxDurationSec} s por ${productLabel}`}
      </p>
    </>
  );

  const panel = (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-3">
      <div className="lb-video-editor flex h-[96dvh] max-h-[96dvh] w-full max-w-[min(72rem,calc(100vw-0.5rem))] flex-col overflow-hidden rounded-t-3xl border border-cyan-400/20 bg-zinc-950 shadow-[0_0_24px_rgba(34,211,238,0.12)] sm:h-[min(92dvh,52rem)] sm:rounded-3xl">
        <div className="lb-video-editor-head shrink-0 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Scissors size={16} className="shrink-0 text-cyan-300" />
              <h3 className="truncate text-base font-bold text-white">{title}</h3>
            </div>
            <p className="mt-0.5 hidden text-[11px] text-zinc-400 sm:block">
              Recorta, ajusta y crea varios Boom Clips con IA.
            </p>
          </div>
          <div className="lb-video-editor-modes">
            <button
              type="button"
              className={mode === 'manual' ? 'is-active' : ''}
              onClick={() => openHeaderMode('manual')}
            >
              Manual
            </button>
            <button
              type="button"
              className={mode === 'ai' ? 'is-active' : ''}
              onClick={() => openHeaderMode('ai')}
            >
              <Sparkles size={12} />
              IA destaca lo mejor
            </button>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-11 w-11 shrink-0 place-items-center justify-self-end rounded-full bg-white/10 text-white"
            aria-label="Cerrar editor"
          >
            <X size={16} />
          </button>
          {mode === 'ai' ? (
            <p className="lb-video-editor-ai-hint text-[10px] text-zinc-500">
              Analiza tu video y encuentra los momentos más importantes.
            </p>
          ) : null}
        </div>

        <div className="lb-video-editor-body">
          <div className="lb-video-editor-stage">
            <div className="lb-video-editor-preview">
              <video
                ref={videoRef}
                src={previewUrl}
                className="lb-video-editor-video"
                style={{
                  filter: cssFilter,
                  transform: adjust.stabilize ? 'scale(1.06)' : undefined,
                }}
                controls
                playsInline
                muted
              />
            </div>
            {timelineBlock}
            {error ? <p className="mt-1 shrink-0 text-sm text-fuchsia-400">{error}</p> : null}
          </div>

          {showAdjustPanel ? (
            <div className="lb-video-editor-side">
              {mode === 'ai' ? renderAiPanel() : renderColorPanel()}
            </div>
          ) : null}

          <div className="lb-video-editor-mobile">
            <div className="lb-video-editor-mobile-tabs" role="tablist" aria-label="Secciones del editor">
              {(
                [
                  { id: 'trim' as const, label: 'Recorte' },
                  { id: 'color' as const, label: 'Color' },
                  { id: 'speed' as const, label: 'Velocidad' },
                  { id: 'ai' as const, label: 'IA' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mobileSection === tab.id}
                  className={mobileSection === tab.id ? 'is-active' : ''}
                  onClick={() => openMobileSection(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {showAdjustPanel ? (
              <div className="lb-video-editor-mobile-panel">
                {mobileSection === 'trim' ? (
                  <p className="text-[11px] leading-snug text-zinc-400">
                    Arrastra el recuadro de la línea de tiempo para elegir inicio y fin. El video se
                    queda arriba mientras recortas.
                  </p>
                ) : null}
                {mobileSection === 'color' ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-white">Ajustes de color</p>
                      <button
                        type="button"
                        onClick={() => setAdjust(DEFAULT_ADJUST)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-white/15 px-2.5 text-[10px] text-zinc-300"
                      >
                        <RotateCcw size={12} />
                        Restablecer
                      </button>
                    </div>
                    {renderColorFields()}
                  </div>
                ) : null}
                {mobileSection === 'speed' ? (
                  <div>
                    <p className="mb-2 text-xs font-bold text-white">Movimiento</p>
                    {renderSpeedRow()}
                  </div>
                ) : null}
                {mobileSection === 'ai' ? renderAiPanel() : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 pb-[max(0.6rem,var(--lb-safe-bottom))] sm:px-4 sm:py-3">
          <button
            type="button"
            onClick={() => setShowAdjustPanel((open) => !open)}
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-semibold text-zinc-200"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${showAdjustPanel ? '' : '-rotate-90'}`}
            />
            {showAdjustPanel ? 'Ocultar ajustes' : 'Ver ajustes'}
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={onCancel} className="min-h-11 px-4 text-sm text-zinc-400">
              Cancelar
            </button>
            {mode === 'ai' ? (
              <button
                type="button"
                disabled={busy || aiBusy || selectedAi.length === 0}
                onClick={() => void handleSaveMany()}
                className="inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-5 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy
                  ? 'Creando…'
                  : `Crear ${selectedAi.length} ${productNoun(productLabel, selectedAi.length)}`}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || loadingMeta}
                onClick={() => void handleSaveManual()}
                className="inline-flex min-h-11 items-center rounded-full bg-cyan-500 px-5 text-sm font-bold text-zinc-950 disabled:opacity-60"
              >
                {busy ? 'Procesando…' : editingClipId ? 'Aplicar al clip' : 'Usar este tramo →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
}
