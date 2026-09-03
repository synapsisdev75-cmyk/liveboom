import { Camera, Mic } from 'lucide-react';
import type { RefObject } from 'react';
import { useState } from 'react';
import { LIVE_CATEGORIES } from '../lib/categories';
import {
  liveAspectRatioLabel,
  liveCanvasDimensions,
  livePreviewFrameClass,
} from '../lib/liveAspectRatio';
import { AddSourceMenu } from '../components/live/studio/AddSourceMenu';
import { AudioMixer } from '../components/live/studio/AudioMixer';
import { BroadcastControlsBar } from '../components/live/studio/BroadcastControlsBar';
import { BroadcastModeSelector } from '../components/live/studio/BroadcastModeSelector';
import { ExternalEncoderPanel } from '../components/live/studio/ExternalEncoderPanel';
import { LivePreviewMeta } from '../components/live/studio/LivePreviewMeta';
import { LiveStudioLayout } from '../components/live/studio/LiveStudioLayout';
import { MirrorSettings } from '../components/live/studio/MirrorSettings';
import { OrientationSelector } from '../components/live/studio/OrientationSelector';
import { SourcePanel } from '../components/live/studio/SourcePanel';
import { StreamHealth } from '../components/live/studio/StreamHealth';
import { StudioTopBar } from '../components/live/studio/StudioTopBar';
import type { BroadcastMode, LiveStudioFormat, StudioSource } from '../components/live/studio/liveStudioTypes';
import { studioFormatToAspect } from '../components/live/studio/liveStudioTypes';

type ChecklistState = {
  age: boolean;
  content: boolean;
  rules: boolean;
  consequences: boolean;
};

type Props = {
  step: 1 | 2 | 3;
  setStep: (s: 1 | 2 | 3) => void;
  title: string;
  setTitle: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  goalCoins: string;
  setGoalCoins: (v: string) => void;
  goalLabel: string;
  setGoalLabel: (v: string) => void;
  thumbnail: string | null;
  allowGifts: boolean;
  setAllowGifts: (v: boolean) => void;
  liveChat: boolean;
  setLiveChat: (v: boolean) => void;
  followersOnly: boolean;
  setFollowersOnly: (v: boolean) => void;
  saveProfile: boolean;
  setSaveProfile: (v: boolean) => void;
  studioFormat: LiveStudioFormat;
  setStudioFormat: (v: LiveStudioFormat) => void;
  broadcastMode: BroadcastMode;
  setBroadcastMode: (v: BroadcastMode) => void;
  checks: ChecklistState;
  setAllRules: (v: boolean) => void;
  rulesAccepted: boolean;
  canContinue: boolean;
  error: string | null;
  previewReady: boolean;
  previewVideoRef: RefObject<HTMLVideoElement | null>;
  fileRef: RefObject<HTMLInputElement | null>;
  onPickThumb: (file: File | null) => void;
  displayTitle: string;
  goToPreview: () => void;
  goLive: () => void;
  mirrorPreview: boolean;
  setMirrorPreview: (v: boolean) => void;
  addSourceOpen: boolean;
  setAddSourceOpen: (v: boolean) => void;
};

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#0f1016] px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        {hint ? <span className="block text-[11px] text-zinc-500">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-violet-600' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
            checked ? 'left-[1.35rem]' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  );
}

function buildSources(
  previewReady: boolean,
  broadcastMode: BroadcastMode,
): StudioSource[] {
  return [
    {
      id: 'camera',
      label: 'Cámara',
      state: previewReady ? 'active' : 'off',
      visible: true,
    },
    {
      id: 'screen',
      label: broadcastMode === 'gaming' ? 'Pantalla / Juego' : 'Pantalla',
      state: broadcastMode === 'screen' || broadcastMode === 'gaming' ? 'sharing' : 'off',
      visible: broadcastMode !== 'camera',
    },
    {
      id: 'mic',
      label: 'Micrófono',
      state: previewReady ? 'active' : 'off',
      visible: true,
    },
    {
      id: 'game-audio',
      label: 'Audio juego',
      state: broadcastMode === 'gaming' ? 'active' : 'off',
      visible: broadcastMode === 'gaming',
    },
  ];
}

export function TransmitStudioBody(props: Props) {
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const aspectRatio = studioFormatToAspect(props.studioFormat);
  const dims = liveCanvasDimensions(aspectRatio);
  const resolution = `${dims.width} × ${dims.height}`;
  const sources = buildSources(props.previewReady, props.broadcastMode);

  const previewCenter = (
    <div className="flex flex-col gap-3">
      {props.studioFormat === 'dual' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className={`relative ${livePreviewFrameClass('16:9')}`}>
            <LivePreviewMeta format="16:9" resolution={resolution} fps={30} />
            <div className="grid h-full place-items-center bg-zinc-950 text-[10px] text-zinc-500">
              Editar horizontal
            </div>
          </div>
          <div className={`relative ${livePreviewFrameClass('9:16')}`}>
            <LivePreviewMeta format="9:16" resolution="720 × 1280" fps={30} />
            <div className="grid h-full place-items-center bg-zinc-950 text-[10px] text-zinc-500">
              Editar vertical
            </div>
          </div>
        </div>
      ) : (
        <div className={`relative mx-auto w-full max-w-[min(100%,960px)] ${livePreviewFrameClass(aspectRatio)}`}>
          <LivePreviewMeta format={props.studioFormat} resolution={resolution} fps={30} />
          <video
            ref={props.previewVideoRef}
            muted
            playsInline
            className={`h-full w-full object-contain ${props.mirrorPreview ? 'lb-live-mirror-on' : ''}`}
          />
          {!props.previewReady ? (
            <div className="absolute inset-0 grid place-items-center bg-zinc-950/85 text-center">
              {props.thumbnail ? (
                <img src={props.thumbnail} alt="" className="h-full w-full object-contain" />
              ) : (
                <div className="px-4">
                  <Camera className="mx-auto text-zinc-600" size={36} />
                  <p className="mt-2 text-xs text-zinc-500">
                    LiveBoom necesita permiso para acceder a tu cámara.
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Continúa a vista previa o usa una miniatura.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  const compactPreLive = (
    <div className="mx-auto w-full max-w-lg space-y-3">
      <div className={`relative mx-auto w-full ${livePreviewFrameClass(aspectRatio)}`}>
        <video
          ref={props.previewVideoRef}
          muted
          playsInline
          className={`h-full w-full object-contain ${props.mirrorPreview ? 'lb-live-mirror-on' : ''}`}
        />
        {!props.previewReady ? (
          <div className="absolute inset-0 grid place-items-center bg-zinc-950/90 text-center">
            <Camera className="text-zinc-600" size={32} />
            <p className="mt-2 px-4 text-xs text-zinc-500">Permite cámara para el preview</p>
          </div>
        ) : null}
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-zinc-400">Título *</span>
        <input
          value={props.title}
          onChange={(e) => props.setTitle(e.target.value)}
          placeholder="Título del live"
          maxLength={80}
          className="h-10 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-violet-500"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-zinc-400">Categoría *</span>
        <select
          value={props.category}
          onChange={(e) => props.setCategory(e.target.value)}
          className="h-10 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none [color-scheme:dark] focus:border-violet-500"
        >
          <option value="">Selecciona</option>
          {LIVE_CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.emoji} {item.label}
            </option>
          ))}
        </select>
      </label>
      <BroadcastModeSelector value={props.broadcastMode} onChange={props.setBroadcastMode} />
      <OrientationSelector value={props.studioFormat} onChange={props.setStudioFormat} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => props.setMirrorPreview(!props.mirrorPreview)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            props.mirrorPreview ? 'bg-cyan-500/20 text-cyan-200' : 'bg-zinc-800 text-zinc-300'
          }`}
        >
          Espejo {props.mirrorPreview ? 'ON' : 'OFF'}
        </button>
        <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-400">
          <Mic size={14} /> Mic activo al iniciar
        </span>
      </div>
      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2">
        <input
          type="checkbox"
          checked={props.rulesAccepted}
          onChange={(e) => props.setAllRules(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-violet-500"
        />
        <span className="text-xs text-zinc-300">Acepto las reglas de LiveBoom (18+, contenido permitido)</span>
      </label>
      <button
        type="button"
        onClick={() => setMoreOptionsOpen((v) => !v)}
        className="text-xs font-semibold text-cyan-400 hover:underline"
      >
        {moreOptionsOpen ? 'Ocultar opciones' : 'Más opciones'}
      </button>
      {moreOptionsOpen ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-[#14151c] p-3">
          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Descripción</span>
            <textarea
              value={props.description}
              onChange={(e) => props.setDescription(e.target.value)}
              rows={2}
              maxLength={200}
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none"
            />
          </label>
          <Toggle checked={props.allowGifts} onChange={props.setAllowGifts} label="Permitir regalos" />
          <Toggle checked={props.liveChat} onChange={props.setLiveChat} label="Chat en vivo" />
          <Toggle checked={props.followersOnly} onChange={props.setFollowersOnly} label="Solo seguidores" />
        </div>
      ) : null}
      <button
        type="button"
        onClick={props.goLive}
        disabled={!props.canContinue}
        className="lb-gradient-btn flex h-12 w-full items-center justify-center rounded-xl text-sm font-bold text-white disabled:opacity-45"
      >
        INICIAR LIVE
      </button>
      <button
        type="button"
        onClick={props.goToPreview}
        disabled={!props.canContinue}
        className="w-full text-center text-xs font-semibold text-zinc-500 hover:text-cyan-400 disabled:opacity-40"
      >
        Configuración avanzada (estudio completo)
      </button>
    </div>
  );

  const previewStep = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => props.setStep(1)}
          className="text-xs font-semibold text-cyan-400 hover:underline"
        >
          ← Editar configuración
        </button>
        <span className="text-[11px] text-zinc-500">{liveAspectRatioLabel(aspectRatio)}</span>
      </div>
      {previewCenter}
      <div className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-4">
        <p className="text-sm font-bold text-white">{props.displayTitle}</p>
        <p className="mt-1 text-xs text-zinc-400">
          {LIVE_CATEGORIES.find((c) => c.id === props.category)?.label || props.category}
        </p>
      </div>
      <button
        type="button"
        onClick={props.goLive}
        className="lb-gradient-btn flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white"
      >
        Iniciar LIVE
      </button>
    </div>
  );

  return (
    <div className="lb-page pb-4">
      {props.step === 1 ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-white/[0.08] bg-[#0a0b10] p-4 sm:p-5">
          <p className="mb-3 text-sm font-bold text-white">Preparar LIVE</p>
          {compactPreLive}
        </div>
      ) : (
        <LiveStudioLayout
          topBar={<StudioTopBar broadcastState="preparing" />}
          left={
            <>
              <SourcePanel sources={sources} onAddSource={() => props.setAddSourceOpen(true)} />
              <AudioMixer micMuted={false} gameMuted={props.broadcastMode !== 'gaming'} />
            </>
          }
          center={
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0b10] p-3 sm:p-5">
              <button
                type="button"
                onClick={() => props.setStep(1)}
                className="mb-3 text-xs font-semibold text-cyan-400 hover:underline"
              >
                ← Vista compacta
              </button>
              {previewStep}
            </div>
          }
          right={
            <>
              <BroadcastModeSelector value={props.broadcastMode} onChange={props.setBroadcastMode} />
              <MirrorSettings
                localMirror={props.mirrorPreview}
                onLocalChange={props.setMirrorPreview}
              />
              <StreamHealth quality="excellent" resolution={resolution} fps={30} />
              <ExternalEncoderPanel />
            </>
          }
          bottom={
            <BroadcastControlsBar
              micOn={true}
              mirrorOn={props.mirrorPreview}
              onToggleMirror={() => props.setMirrorPreview(!props.mirrorPreview)}
            />
          }
        />
      )}
      <AddSourceMenu open={props.addSourceOpen} onClose={() => props.setAddSourceOpen(false)} />
      {props.error ? (
        <p className="mt-3 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
