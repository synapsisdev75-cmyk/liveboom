import {
  Box,
  Check,
  Eye,
  FlipHorizontal,
  Info,
  Loader2,
  Plus,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  estimateReconstructionQuality,
  kindCopy,
  kindProgress,
  nextRequiredView,
} from '../../lib/reconstruction3d/catalog';
import {
  clearReconstructionDraft,
  emptyReconstructionDraft,
  getReconstructionDraft,
  patchReconstructionDraft,
  setReconstructionDraft,
  subscribeReconstructionDraft,
} from '../../lib/reconstruction3d/draftStore';
import { inspectReconstructionPhoto, qualityReasonLabel, resetReconstructionQualityMemory } from '../../lib/reconstruction3d/quality';
import {
  evaluateReconstructionCoverage,
  persistReconstructionReady,
  runLocalReconstructionPipeline,
  threeDReconstructionService,
} from '../../lib/reconstruction3d/service';
import {
  DEFAULT_RECONSTRUCTION_EDIT,
  RECONSTRUCTION_PROCESS_STAGES,
  slotByYawPitch,
  type Reconstruction3DEdit,
  type Reconstruction3DMotion,
  type Reconstruction3DSlotId,
  type ReconstructionDraft,
  type ReconstructionSubjectKind,
} from '../../lib/reconstruction3d/types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useUiStore } from '../../store/uiStore';
import { CaptureGuide } from './CaptureGuide';
import { CaptureProgress } from './CaptureProgress';
import { CaptureSourceMenu, type CaptureSource } from './CaptureSourceMenu';
import { CaptureViewAssign, PhotoPreview } from './PhotoPreview';
import { Reconstruction3DViewer } from './Reconstruction3DViewer';
import { ReconstructionTabs } from './ReconstructionTabs';

type Step = 'capture' | 'processing' | 'preview' | 'coverage';

type Props = {
  open: boolean;
  userId: string;
  onClose: () => void;
  onReady: (draft: ReconstructionDraft) => void;
  onSelectFormat?: (tab: 'publication' | 'boomclip' | 'flashboom') => void;
};

type PendingShot = {
  file: File;
  url: string;
  slot: Reconstruction3DSlotId | null;
  suggested: Reconstruction3DSlotId | null;
  assign: boolean;
};

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

let generationLock: Promise<void> | null = null;

function newCaptureId() {
  return `cap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function isImageFile(file: File) {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export function Reconstruction3DPanel({ open, userId, onClose, onReady, onSelectFormat }: Props) {
  const [draft, setDraft] = useState<ReconstructionDraft | null>(getReconstructionDraft());
  const [step, setStep] = useState<Step>('capture');
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [fabRect, setFabRect] = useState<DOMRect | null>(null);
  const [pending, setPending] = useState<PendingShot | null>(null);
  const [assignSlot, setAssignSlot] = useState<Reconstruction3DSlotId>('front');
  const [shading, setShading] = useState<'mesh' | 'textured' | 'realistic'>('textured');
  const [kind, setKind] = useState<ReconstructionSubjectKind>(draft?.kind || 'person');
  const [editHistory, setEditHistory] = useState<Reconstruction3DEdit[]>([DEFAULT_RECONSTRUCTION_EDIT]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(8);
  const kindRef = useRef<ReconstructionSubjectKind>(draft?.kind || 'person');
  const breakpoint = useBreakpoint();
  const setToast = useUiStore((state) => state.setToast);

  useEffect(() => subscribeReconstructionDraft(setDraft), []);

  useEffect(() => {
    kindRef.current = kind;
  }, [kind]);

  useEffect(() => {
    if (draft?.kind) setKind(draft.kind);
  }, [draft?.kind]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    const current = getReconstructionDraft();
    if (current?.status === 'ready' && current.result) setStep('preview');
    else if (
      current?.status === 'processing' ||
      current?.status === 'uploading' ||
      current?.status === 'generating_geometry' ||
      current?.status === 'texturing'
    ) {
      setStep('processing');
    } else setStep('capture');
  }, [open]);

  useEffect(() => {
    if (!open || (step !== 'capture' && step !== 'coverage')) {
      stopCamera();
      return;
    }
    void startCamera();
    return () => stopCamera();
  }, [open, step, facingMode]);

  useEffect(() => {
    if (!open || step !== 'capture') return;
    function onOrient(event: DeviceOrientationEvent) {
      const alpha = Number(event.alpha);
      const beta = Number(event.beta);
      if (!Number.isFinite(alpha)) return;
      yawRef.current = ((alpha % 360) + 360) % 360;
      pitchRef.current = Number.isFinite(beta) ? Math.max(-18, Math.min(48, 90 - Math.abs(beta))) : 8;
    }
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [open, step]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Este dispositivo no permite usar la cámara en el navegador. Usa galería o importar archivo.');
      return;
    }
    stopCamera();
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setCameraError(null);
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setCameraError(
        'No hay permiso de cámara. Actívalo en Ajustes del navegador o del sistema. Mientras tanto puedes agregar fotos desde galería o importar un archivo.',
      );
    }
  }

  async function ensureDraft(kind: ReconstructionSubjectKind = 'person') {
    const current = getReconstructionDraft();
    if (current) {
      if (current.kind !== kind) patchReconstructionDraft({ kind });
      return getReconstructionDraft()!;
    }
    const id = await threeDReconstructionService.createProject(userId, kind);
    const next = emptyReconstructionDraft(userId, id.id, kind);
    setReconstructionDraft(next);
    return next;
  }

  async function addPreparedFile(file: File, slot: Reconstruction3DSlotId | null) {
    setBusy(true);
    setRejectReason(null);
    const current = await ensureDraft(kindRef.current);
    const quality = await inspectReconstructionPhoto(file).catch(() => null);
    if (quality && !quality.ok) {
      setRejectReason(quality.reason || qualityReasonLabel(quality.issue));
      setBusy(false);
      return false;
    }
    const kind = current.kind || 'person';
    const yaw = slot
      ? yawRef.current
      : yawRef.current;
    const pitch = slot === 'top' || slot === 'sky' ? 42 : slot === 'bottom' || slot === 'ground' ? -12 : pitchRef.current;
    const slotId = slot || slotByYawPitch(yaw, pitch, kind);
    const objectUrl = URL.createObjectURL(file);
    const captures = [
      ...current.captures,
      {
        id: newCaptureId(),
        slotId,
        yaw,
        pitch,
        objectUrl,
        file,
        brightness: quality?.brightness,
        sharpness: quality?.sharpness,
        suggestedSlot: slotId,
      },
    ];
    const coverage = evaluateReconstructionCoverage(captures, kind);
    patchReconstructionDraft({
      captures: coverage.captures,
      missingSlots: coverage.missing,
      status: 'draft',
      error: null,
    });
    setBusy(false);
    return true;
  }

  async function addFiles(files: FileList | File[], preferredSlot?: Reconstruction3DSlotId | null, askAssign = false) {
    const list = Array.from(files).filter(isImageFile);
    if (!list.length) return;
    const current = await ensureDraft(kindRef.current);
    const nextView = nextRequiredView(current.kind, current.captures);
    if (askAssign || (!preferredSlot && !nextView)) {
      const file = list[0]!;
      const url = URL.createObjectURL(file);
      const suggested = preferredSlot || nextView?.id || slotByYawPitch(yawRef.current, pitchRef.current, current.kind);
      setAssignSlot(suggested);
      setPending({ file, url, slot: suggested, suggested, assign: true });
      return;
    }
    let slot = preferredSlot || nextView?.id || null;
    for (const file of list) {
      const ok = await addPreparedFile(file, slot);
      if (!ok) break;
      const latest = getReconstructionDraft();
      slot = latest ? nextRequiredView(latest.kind, latest.captures)?.id || slot : slot;
    }
  }

  async function captureFromCamera(slot?: Reconstruction3DSlotId) {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setRejectReason('La cámara aún no está lista. Espera un segundo o usa galería.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return;
    const file = new File([blob], `recon-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const url = URL.createObjectURL(file);
    const current = getReconstructionDraft();
    const nextView = current ? nextRequiredView(current.kind, current.captures) : null;
    const chosen = slot || nextView?.id || null;
    setPending({ file, url, slot: chosen, suggested: chosen, assign: false });
  }

  async function processNow() {
    const current = getReconstructionDraft();
    if (!current || generationLock) return;
    if (current.kind === 'person' && !current.personConsent) {
      setRejectReason('Confirma que tienes autorización para reconstruir a esta persona.');
      return;
    }
    const coverage = evaluateReconstructionCoverage(current.captures, current.kind);
    if (!coverage.ok) {
      patchReconstructionDraft({
        captures: coverage.captures,
        missingSlots: coverage.missing,
        status: 'needs_coverage',
      });
      setStep('coverage');
      setRejectReason(coverage.message);
      return;
    }
    setStep('processing');
    patchReconstructionDraft({ status: 'uploading', progress: 2, stage: 'Subiendo fotografías...', error: null });
    generationLock = (async () => {
      try {
        let uploaded = coverage.captures;
        try {
          uploaded = await threeDReconstructionService.uploadCaptureImages(userId, current.id, coverage.captures);
        } catch {
          uploaded = coverage.captures;
        }
        patchReconstructionDraft({ captures: uploaded, status: 'processing', progress: 8 });
        void threeDReconstructionService.generateModel(current.id);
        const latest = getReconstructionDraft();
        if (!latest) return;
        const result = await runLocalReconstructionPipeline(latest, (progress, stage) => {
          const status =
            progress < 25
              ? 'uploading'
              : progress < 50
                ? 'processing'
                : progress < 75
                  ? 'generating_geometry'
                  : 'texturing';
          patchReconstructionDraft({ status, progress, stage });
        });
        patchReconstructionDraft({
          status: 'ready',
          progress: 100,
          stage: RECONSTRUCTION_PROCESS_STAGES[RECONSTRUCTION_PROCESS_STAGES.length - 1],
          result,
        });
        await persistReconstructionReady(current.id, result);
        setToast('Tu modelo 3D está listo.', 'success');
        setStep('preview');
      } catch (error) {
        patchReconstructionDraft({
          status: 'failed',
          error: error instanceof Error ? error.message : 'No se pudo generar la reconstrucción.',
        });
        setToast('No se pudo generar el modelo 3D.', 'error');
        setStep('capture');
      } finally {
        generationLock = null;
      }
    })();
    await generationLock;
  }

  function applyEdit(next: Reconstruction3DEdit, record = true) {
    if (record) setEditHistory((history) => [...history.slice(-12), next]);
    patchReconstructionDraft({ edit: next, result: draft?.result ? { ...draft.result, edit: next } : draft?.result });
  }

  function autoAdjust() {
    const next: Reconstruction3DEdit = {
      ...(draft?.edit || DEFAULT_RECONSTRUCTION_EDIT),
      yaw: 0,
      pitch: 8,
      zoom: 112,
      scale: 104,
      panX: 0,
      panY: -2,
      brightness: 6,
      contrast: 8,
      saturation: 4,
      exposure: 4,
      sharpness: 10,
    };
    applyEdit(next, true);
  }

  function undoEdit() {
    if (editHistory.length < 2) return;
    const next = editHistory[editHistory.length - 2] ?? draft?.edit ?? DEFAULT_RECONSTRUCTION_EDIT;
    setEditHistory((history) => history.slice(0, -1));
    applyEdit(next, false);
  }

  async function removeReconstruction() {
    const current = getReconstructionDraft();
    if (current) await threeDReconstructionService.deleteReconstruction(current.id, current.captures);
    resetReconstructionQualityMemory();
    clearReconstructionDraft();
    setStep('capture');
    setPending(null);
  }

  async function changeKind(next: ReconstructionSubjectKind) {
    setKind(next);
    await ensureDraft(next);
    patchReconstructionDraft({ kind: next });
    if (step === 'preview' || step === 'processing') return;
    setStep('capture');
  }

  function onSource(source: CaptureSource) {
    if (source === 'CAMERA') void captureFromCamera();
    if (source === 'GALLERY') galleryRef.current?.click();
    if (source === 'FILE') fileRef.current?.click();
  }

  const copy = kindCopy(kind);
  const captures = draft?.captures || [];
  const nextView = nextRequiredView(kind, captures);
  const progress = kindProgress(kind, captures);
  const quality = estimateReconstructionQuality(kind, captures);
  const coverage = evaluateReconstructionCoverage(captures, kind);
  const canProcess = coverage.ok && (kind !== 'person' || Boolean(draft?.personConsent));
  const filled = useMemo(() => {
    const ids = new Set<string>();
    const counts: Record<string, number> = {};
    for (const item of captures) {
      if (!item.slotId) continue;
      ids.add(item.slotId);
      counts[item.slotId] = (counts[item.slotId] || 0) + 1;
    }
    return { ids, counts };
  }, [captures]);

  if (!open) return null;

  const body = (
    <div className="lb-recon3d-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`lb-recon3d-panel lb-recon3d-panel--studio is-${kind}`} role="dialog" aria-labelledby="lb-recon3d-title">
        <header className="lb-recon3d-panel__head">
          <div>
            <p className="lb-recon3d-kicker">
              <Box size={16} /> Reconstrucción 3D <span className="lb-recon3d-pro">PRO</span>
            </p>
            <h2 id="lb-recon3d-title">Reconstrucción 3D</h2>
            <p className="lb-recon3d-lead">
              Convierte personas, objetos y espacios en modelos 3D a partir de varias fotografías.
            </p>
          </div>
          <button type="button" className="lb-recon3d-iconbtn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <ReconstructionTabs value={kind} onChange={(next) => void changeKind(next)} />

        {captures.length > 0 && step === 'capture' ? (
          <p className="lb-recon-continue">Continuar reconstrucción 3D · {captures.length} fotos guardadas</p>
        ) : null}

        {step === 'capture' || step === 'coverage' ? (
          <div className={`lb-recon-studio is-${kind}`}>
            <div className="lb-recon-studio__camera">
              <CaptureGuide
                kind={kind}
                filled={filled.ids}
                filledCounts={filled.counts}
                nextId={nextView?.id || null}
                nextIndex={progress.current + (nextView ? 1 : 0)}
                nextTotal={progress.target}
                cameraOn={!cameraError}
                cameraError={cameraError}
                onSelectPoint={(id) => {
                  const mapped =
                    kind === 'landscape' && (id === 'front' || id === 'left' || id === 'right' || id === 'back')
                      ? 'lateral'
                      : kind === 'landscape' && id === 'top'
                        ? 'sky'
                        : id;
                  void captureFromCamera(mapped);
                }}
              >
                <video ref={videoRef} className="lb-recon-guide__cam" muted playsInline autoPlay />
                {pending && !pending.assign ? <PhotoPreview src={pending.url} onRetry={() => {
                  URL.revokeObjectURL(pending.url);
                  setPending(null);
                }} onUse={() => {
                  void addPreparedFile(pending.file, pending.slot).then(() => {
                    URL.revokeObjectURL(pending.url);
                    setPending(null);
                  });
                }} /> : null}
                {pending?.assign ? (
                  <CaptureViewAssign
                    src={pending.url}
                    kind={kind}
                    suggested={pending.suggested}
                    value={assignSlot}
                    onChange={setAssignSlot}
                    onCancel={() => {
                      URL.revokeObjectURL(pending.url);
                      setPending(null);
                    }}
                    onConfirm={() => {
                      void addPreparedFile(pending.file, assignSlot).then(() => {
                        URL.revokeObjectURL(pending.url);
                        setPending(null);
                      });
                    }}
                  />
                ) : null}
                <button
                  type="button"
                  className="lb-recon-fab"
                  ref={fabRef}
                  onClick={() => {
                    setFabRect(fabRef.current?.getBoundingClientRect() || null);
                    setSourceOpen(true);
                  }}
                  aria-label="Agregar fotografía"
                >
                  <Plus size={22} />
                </button>
              </CaptureGuide>
              <p className="lb-recon-tip">
                <Info size={14} /> {copy.tip}
              </p>
              <div className="lb-recon-cam-tools">
                <button
                  type="button"
                  className="lb-recon3d-secondary"
                  onClick={() =>
                    cameraError
                      ? void startCamera()
                      : setFacingMode((mode) => (mode === 'user' ? 'environment' : 'user'))
                  }
                >
                  <FlipHorizontal size={16} /> {cameraError ? 'Reintentar cámara' : 'Cambiar cámara'}
                </button>
              </div>
            </div>

            <CaptureProgress
              kind={kind}
              captures={captures}
              nextId={nextView?.id || null}
              quality={quality}
              onSelect={(id) => void captureFromCamera(id)}
            />

            <aside className="lb-recon-side">
              <p>Personas, objetos y mundos en 3D.</p>
              <p>{copy.guide}</p>
              {draft?.result ? (
                <button type="button" className="lb-recon3d-secondary" onClick={() => setStep('preview')}>
                  <Eye size={16} /> Vista previa 3D
                </button>
              ) : null}
              {kind === 'person' ? (
                <label className="lb-recon-consent">
                  <input
                    type="checkbox"
                    checked={Boolean(draft?.personConsent)}
                    onChange={(event) => patchReconstructionDraft({ personConsent: event.target.checked })}
                  />
                  Confirmo que tengo autorización para crear un modelo 3D de esta persona.
                </label>
              ) : null}
            </aside>
          </div>
        ) : null}

        {rejectReason || (step === 'coverage' && coverage.message) ? (
          <p className="lb-recon3d-reject">{rejectReason || coverage.message}</p>
        ) : null}

        {(step === 'capture' || step === 'coverage') && (
          <div className="lb-recon-bottom">
            {kind === 'person' ? (
              <label className="lb-recon-consent lb-recon-consent--bar">
                <input
                  type="checkbox"
                  checked={Boolean(draft?.personConsent)}
                  onChange={(event) => patchReconstructionDraft({ personConsent: event.target.checked })}
                />
                Confirmo que tengo autorización para crear un modelo 3D de esta persona.
              </label>
            ) : null}
            <button
              type="button"
              className="lb-recon3d-primary lb-recon-generate"
              disabled={!canProcess || busy}
              onClick={() => void processNow()}
            >
              Generar modelo 3D →
            </button>
            <small>
              {canProcess
                ? 'Se procesará en segundo plano. Te notificaremos cuando esté listo.'
                : coverage.message || 'Captura las vistas mínimas para habilitar la generación.'}
            </small>
          </div>
        )}

        {step === 'processing' ? (
          <div className="lb-recon3d-process">
            <div className="lb-recon3d-ring" style={{ ['--lb-recon-progress' as string]: `${draft?.progress || 0}` }}>
              <strong>{Math.round(draft?.progress || 0)}%</strong>
            </div>
            <p>{draft?.stage || 'Generando reconstrucción 3D…'}</p>
            <p className="lb-recon-tip">Puedes cerrar esta pantalla. El proceso continúa y te avisaremos al terminar.</p>
            <ul>
              {RECONSTRUCTION_PROCESS_STAGES.map((stage, index) => {
                const current = RECONSTRUCTION_PROCESS_STAGES.findIndex((item) => item === draft?.stage);
                const done = current > index || (draft?.progress || 0) >= 100;
                const active = current === index;
                return (
                  <li key={stage} className={done ? 'is-done' : active ? 'is-active' : ''}>
                    {done ? <Check size={14} /> : <Loader2 size={14} className={active ? 'animate-spin' : ''} />}
                    {stage}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {draft?.status === 'failed' && step === 'capture' ? (
          <div className="lb-recon-bottom">
            <button type="button" className="lb-recon3d-primary" onClick={() => void processNow()}>
              Reintentar
            </button>
            <small>Las fotografías se conservan. No hace falta volver a capturarlas.</small>
          </div>
        ) : null}

        {step === 'preview' && draft?.result ? (
          <div className="lb-recon3d-preview">
            <div className="lb-recon-shading" role="tablist" aria-label="Modo de vista">
              {(['mesh', 'textured', 'realistic'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={shading === mode ? 'is-on' : ''}
                  onClick={() => setShading(mode)}
                >
                  {mode === 'mesh' ? 'Malla' : mode === 'textured' ? 'Texturizado' : 'Realista'}
                </button>
              ))}
            </div>
            <Reconstruction3DViewer
              payload={draft.result}
              edit={draft.edit}
              shading={shading}
              onEditChange={(next) => applyEdit(next)}
            />
            <div className="lb-recon3d-edit">
              <button type="button" className="lb-recon3d-primary" onClick={autoAdjust}>
                <Sparkles size={14} /> Autoajustar
              </button>
              <button type="button" className="lb-recon3d-secondary" onClick={undoEdit} disabled={editHistory.length < 2}>
                <Undo2 size={14} /> Deshacer
              </button>
              <label>
                Brillo
                <input
                  type="range"
                  min={-40}
                  max={40}
                  value={draft.edit.brightness}
                  onChange={(event) => applyEdit({ ...draft.edit, brightness: Number(event.target.value) })}
                />
              </label>
              <label>
                Contraste
                <input
                  type="range"
                  min={-40}
                  max={40}
                  value={draft.edit.contrast}
                  onChange={(event) => applyEdit({ ...draft.edit, contrast: Number(event.target.value) })}
                />
              </label>
              <label>
                Saturación
                <input
                  type="range"
                  min={-40}
                  max={40}
                  value={draft.edit.saturation}
                  onChange={(event) => applyEdit({ ...draft.edit, saturation: Number(event.target.value) })}
                />
              </label>
              <label>
                Movimiento
                <select
                  value={draft.motion}
                  onChange={(event) =>
                    patchReconstructionDraft({ motion: event.target.value as Reconstruction3DMotion })
                  }
                >
                  <option value="orbit">Giro 360°</option>
                  <option value="auto">Órbita + zoom</option>
                  <option value="zoom_in">Acercamiento</option>
                  <option value="zoom_out">Alejamiento</option>
                </select>
              </label>
            </div>
            <p className="lb-recon3d-kicker">Publicar en LiveBoom</p>
            <div className="lb-recon3d-formats">
              <button type="button" onClick={() => onSelectFormat?.('publication')}>
                Publicación
                <span>Modelo interactivo 3D</span>
              </button>
              <button type="button" onClick={() => onSelectFormat?.('boomclip')}>
                Boom Clip
                <span>Recorrido orbital</span>
              </button>
              <button type="button" onClick={() => onSelectFormat?.('flashboom')}>
                Flash Boom
                <span>Vista 24 h</span>
              </button>
            </div>
            <div className="lb-recon3d-actions">
              <button type="button" className="lb-recon3d-secondary" onClick={() => void removeReconstruction()}>
                Eliminar reconstrucción
              </button>
              <button
                type="button"
                className="lb-recon3d-primary"
                onClick={() => {
                  const latest = getReconstructionDraft();
                  if (latest) onReady(latest);
                  onClose();
                }}
              >
                Usar en la publicación
              </button>
            </div>
          </div>
        ) : null}

        <input
          ref={galleryRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            void addFiles(event.target.files || [], nextView?.id || null, false);
            event.target.value = '';
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            void addFiles(event.target.files || [], nextView?.id || null, !nextView);
            event.target.value = '';
          }}
        />
      </section>
      <CaptureSourceMenu
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        onSelect={onSource}
        placement={breakpoint === 'phone' ? 'sheet' : 'popover'}
        anchor={fabRect}
      />
    </div>
  );

  return createPortal(body, document.body);
}

export { Reconstruction3DPanel as Reconstruction3D };
