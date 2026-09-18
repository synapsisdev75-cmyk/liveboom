import { Link, useLocation, useNavigate } from 'react-router-dom';
import { type LiveAspectRatio } from '../lib/liveAspectRatio';
import { useAuthStore } from '../store/authStore';
import { TransmitStudioBody } from './TransmitStudioBody';
import type { BroadcastMode, LiveStudioFormat } from '../components/live/studio/liveStudioTypes';
import { studioFormatToAspect } from '../components/live/studio/liveStudioTypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getLiveUserMedia,
  listLiveMediaDevices,
  liveCameraDeniedMessage,
  loadLiveMediaPrefs,
  pickExistingId,
  saveLiveMediaPrefs,
} from '../lib/liveMediaDevices';
import { ensureNativeLiveAvPermissions } from '../lib/nativeLiveMedia';
import { stashLiveCameraHandoff } from '../lib/liveCameraHandoff';
import { warmLiveGoLiveChunks } from '../lib/routePrefetch';
import {
  LivePrivacySetupSheet,
} from '../components/live/privacy';
import { findLiveGift } from '../lib/liveboomGifts';

const CHECKLIST_KEY = 'liveboom.preLiveChecklist.v1';

type GamingLaunchInbound = {
  gamingSpace?: boolean;
  gamingShareTarget?: 'full_display' | 'single_app';
  gamingMicOn?: boolean;
  gamingDeviceAudioOn?: boolean;
  category?: string;
  title?: string;
};

type ChecklistState = {
  age: boolean;
  content: boolean;
  rules: boolean;
  consequences: boolean;
};

const emptyChecklist: ChecklistState = {
  age: false,
  content: false,
  rules: false,
  consequences: false,
};

function loadChecklist(): ChecklistState {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    if (!raw) return emptyChecklist;
    const parsed = JSON.parse(raw) as Partial<ChecklistState>;
    return {
      age: Boolean(parsed.age),
      content: Boolean(parsed.content),
      rules: Boolean(parsed.rules),
      consequences: Boolean(parsed.consequences),
    };
  } catch {
    return emptyChecklist;
  }
}

type Step = 1 | 2 | 3;

export function TransmitView() {
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const location = useLocation();
  const gamingInbound = (location.state as GamingLaunchInbound | null) || {};
  const savedPrefs = useMemo(() => loadLiveMediaPrefs(), []);
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState(() => String(gamingInbound.title || ''));
  const [category, setCategory] = useState(() => String(gamingInbound.category || ''));
  const [description, setDescription] = useState('');
  const [goalCoins, setGoalCoins] = useState('500');
  const [goalLabel, setGoalLabel] = useState('Meta en coins');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [allowGifts, setAllowGifts] = useState(true);
  const [liveChat, setLiveChat] = useState(true);
  const [followersOnly, setFollowersOnly] = useState(false);
  const [lockSetupOpen, setLockSetupOpen] = useState(false);
  const [lockDraftIds, setLockDraftIds] = useState<string[]>([]);
  const [saveProfile, setSaveProfile] = useState(true);
  const [studioFormat, setStudioFormat] = useState<LiveStudioFormat>(savedPrefs.orientation);
  const [broadcastMode, setBroadcastMode] = useState<BroadcastMode>(
    gamingInbound.gamingSpace ? 'camera' : 'camera',
  );
  const [mirrorPreview, setMirrorPreview] = useState(savedPrefs.mirror);
  const [micOnAtStart, setMicOnAtStart] = useState(
    typeof gamingInbound.gamingMicOn === 'boolean' ? gamingInbound.gamingMicOn : savedPrefs.micOn,
  );
  const [selectedCameraId, setSelectedCameraId] = useState(savedPrefs.cameraId || '');
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState(savedPrefs.microphoneId || '');
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [checks, setChecks] = useState<ChecklistState>(() => loadChecklist());
  const [error, setError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handedOffRef = useRef(false);
  const cameraIdRef = useRef(selectedCameraId);
  const micIdRef = useRef(selectedMicrophoneId);
  cameraIdRef.current = selectedCameraId;
  micIdRef.current = selectedMicrophoneId;

  const aspectRatio: LiveAspectRatio = studioFormatToAspect(studioFormat);

  useEffect(() => {
    warmLiveGoLiveChunks();
  }, []);

  useEffect(() => {
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checks));
  }, [checks]);

  useEffect(() => {
    saveLiveMediaPrefs({
      cameraId: selectedCameraId || null,
      microphoneId: selectedMicrophoneId || null,
      mirror: mirrorPreview,
      orientation: aspectRatio,
      micOn: micOnAtStart,
    });
  }, [selectedCameraId, selectedMicrophoneId, mirrorPreview, aspectRatio, micOnAtStart]);

  const rulesAccepted =
    checks.age && checks.content && checks.rules && checks.consequences;

  const canContinue = useMemo(
    () => rulesAccepted && title.trim().length >= 3 && Boolean(category),
    [rulesAccepted, title, category],
  );

  const lockSummary = useMemo(() => {
    const id = lockDraftIds[0];
    if (!id) return '';
    return findLiveGift(id)?.name || id;
  }, [lockDraftIds]);

  const attachPreview = useCallback((stream: MediaStream) => {
    streamRef.current = stream;
    const video = previewVideoRef.current;
    if (video) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
    setPreviewReady(true);
  }, []);

  const refreshDevices = useCallback(async () => {
    const list = await listLiveMediaDevices();
    setVideoInputs(list.video);
    setAudioInputs(list.audio);
    return list;
  }, []);

  const replaceVideoTrack = useCallback(async (deviceId: string) => {
    const next = await getLiveUserMedia({
      cameraId: deviceId,
      video: true,
      audio: false,
    });
    const incoming = next.getVideoTracks()[0];
    if (!incoming) {
      next.getTracks().forEach((track) => track.stop());
      throw new Error('Sin cámara');
    }
    const current = streamRef.current;
    if (current) {
      const old = current.getVideoTracks()[0];
      if (old) {
        current.removeTrack(old);
        old.stop();
      }
      current.addTrack(incoming);
      attachPreview(current);
    } else {
      attachPreview(next);
    }
    setSelectedCameraId(incoming.getSettings().deviceId || deviceId);
  }, [attachPreview]);

  const replaceAudioTrack = useCallback(async (deviceId: string) => {
    const next = await getLiveUserMedia({
      microphoneId: deviceId,
      video: false,
      audio: true,
    });
    const incoming = next.getAudioTracks()[0];
    if (!incoming) {
      next.getTracks().forEach((track) => track.stop());
      throw new Error('Sin micrófono');
    }
    const current = streamRef.current;
    if (current) {
      current.getAudioTracks().forEach((track) => {
        current.removeTrack(track);
        track.stop();
      });
      current.addTrack(incoming);
      attachPreview(current);
    } else {
      incoming.stop();
    }
    setSelectedMicrophoneId(incoming.getSettings().deviceId || deviceId);
  }, [attachPreview]);

  useEffect(() => {
    if (!profile) {
      if (!handedOffRef.current) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      setPreviewReady(false);
      return;
    }
    let cancelled = false;
    handedOffRef.current = false;
    void (async () => {
      try {
        await ensureNativeLiveAvPermissions();
        if (cancelled) return;
        const stream = await getLiveUserMedia({
          cameraId: cameraIdRef.current || savedPrefs.cameraId,
          microphoneId: micIdRef.current || savedPrefs.microphoneId,
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        attachPreview(stream);
        const videoId = stream.getVideoTracks()[0]?.getSettings().deviceId || '';
        const audioId = stream.getAudioTracks()[0]?.getSettings().deviceId || '';
        const list = await refreshDevices();
        if (cancelled) return;
        setSelectedCameraId(pickExistingId(videoId || cameraIdRef.current, list.video));
        setSelectedMicrophoneId(pickExistingId(audioId || micIdRef.current, list.audio));
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setPreviewReady(false);
          setError(liveCameraDeniedMessage(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (handedOffRef.current) {
        streamRef.current = null;
        setPreviewReady(false);
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPreviewReady(false);
    };
  }, [profile, attachPreview, refreshDevices, savedPrefs.cameraId, savedPrefs.microphoneId]);

  useEffect(() => {
    const devices = navigator.mediaDevices;
    if (!devices?.addEventListener) return;
    const onChange = () => {
      void (async () => {
        const list = await refreshDevices();
        const cam = pickExistingId(cameraIdRef.current, list.video);
        const mic = pickExistingId(micIdRef.current, list.audio);
        if (cam && cam !== cameraIdRef.current) {
          try {
            await replaceVideoTrack(cam);
          } catch {
            /* keep current preview */
          }
        } else {
          setSelectedCameraId(cam);
        }
        if (mic && mic !== micIdRef.current) {
          try {
            await replaceAudioTrack(mic);
          } catch {
            setSelectedMicrophoneId(mic);
          }
        } else {
          setSelectedMicrophoneId(mic);
        }
      })();
    };
    devices.addEventListener('devicechange', onChange);
    return () => devices.removeEventListener('devicechange', onChange);
  }, [refreshDevices, replaceVideoTrack, replaceAudioTrack]);

  if (!profile) {
    return (
      <div className="grid min-h-full place-items-center rounded-2xl bg-zinc-900 p-6">
        <p className="text-center text-sm text-zinc-400">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para transmitir.
        </p>
      </div>
    );
  }

  const displayTitle = title.trim() || `Live de ${profile.displayName || profile.handle}`;

  function toggleLockDraftGift(giftId: string) {
    setLockDraftIds((current) => (current[0] === giftId ? [] : [giftId]));
  }

  function setAllRules(value: boolean) {
    setChecks({
      age: value,
      content: value,
      rules: value,
      consequences: value,
    });
  }

  function onPickThumb(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('La miniatura debe pesar máximo 5MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Solo JPG o PNG.');
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    setThumbnail(url);
  }

  function goToPreview() {
    if (!canContinue) {
      setError(
        !rulesAccepted
          ? 'Debes aceptar las reglas de LiveBoom.'
          : !title.trim()
            ? 'Escribe un título para tu live.'
            : 'Selecciona una categoría.',
      );
      return;
    }
    setError(null);
    setStep(2);
  }

  function goLive() {
    if (!profile || !canContinue) return;
    setStep(3);
    const stream = streamRef.current;
    const video = stream?.getVideoTracks()[0] ?? null;
    const audio = stream?.getAudioTracks()[0] ?? null;
    const stashed = stashLiveCameraHandoff({
      video,
      audio,
      cameraId: selectedCameraId || null,
      microphoneId: selectedMicrophoneId || null,
    });
    if (stashed) {
      handedOffRef.current = true;
      streamRef.current = null;
      if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
    } else {
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    navigate(`/stream/${encodeURIComponent(profile.handle)}`, {
      replace: true,
      state: {
        goLive: true,
        title: displayTitle,
        isPrivate: followersOnly,
        category: category || profile.category || 'otro',
        goalCoins: Math.max(0, Math.floor(Number(goalCoins) || 0)),
        goalLabel: goalLabel.trim().slice(0, 80) || 'Meta en coins',
        aspectRatio,
        broadcastMode,
        description: description.trim().slice(0, 200),
        allowGifts,
        liveChat,
        saveProfile,
        thumbnail,
        cameraId: selectedCameraId || null,
        microphoneId: selectedMicrophoneId || null,
        mirror: mirrorPreview,
        micOn: micOnAtStart,
        gamingSpace: Boolean(gamingInbound.gamingSpace),
        gamingShareTarget: gamingInbound.gamingShareTarget || 'full_display',
        gamingDeviceAudioOn: gamingInbound.gamingDeviceAudioOn !== false,
        privacyLock: lockDraftIds[0]
          ? {
              requirements: [{ giftId: lockDraftIds[0], quantity: 1 }],
            }
          : undefined,
      },
    });
  }

  return (
    <>
    <TransmitStudioBody
      step={step}
      setStep={setStep}
      title={title}
      setTitle={setTitle}
      category={category}
      setCategory={setCategory}
      description={description}
      setDescription={setDescription}
      goalCoins={goalCoins}
      setGoalCoins={setGoalCoins}
      goalLabel={goalLabel}
      setGoalLabel={setGoalLabel}
      thumbnail={thumbnail}
      allowGifts={allowGifts}
      setAllowGifts={setAllowGifts}
      liveChat={liveChat}
      setLiveChat={setLiveChat}
      followersOnly={followersOnly}
      setFollowersOnly={setFollowersOnly}
      saveProfile={saveProfile}
      setSaveProfile={setSaveProfile}
      studioFormat={studioFormat}
      setStudioFormat={setStudioFormat}
      broadcastMode={broadcastMode}
      setBroadcastMode={setBroadcastMode}
      checks={checks}
      setAllRules={setAllRules}
      rulesAccepted={rulesAccepted}
      canContinue={canContinue}
      error={error}
      previewReady={previewReady}
      previewVideoRef={previewVideoRef}
      fileRef={fileRef}
      onPickThumb={onPickThumb}
      displayTitle={displayTitle}
      goToPreview={goToPreview}
      goLive={goLive}
      lockSummary={lockSummary}
      onOpenLock={() => setLockSetupOpen(true)}
      mirrorPreview={mirrorPreview}
      setMirrorPreview={setMirrorPreview}
      micOnAtStart={micOnAtStart}
      setMicOnAtStart={setMicOnAtStart}
      videoInputs={videoInputs}
      audioInputs={audioInputs}
      selectedCameraId={selectedCameraId}
      selectedMicrophoneId={selectedMicrophoneId}
      onSelectCamera={(id) => {
        if (!id || id === selectedCameraId) return;
        void replaceVideoTrack(id).catch((err) => setError(liveCameraDeniedMessage(err)));
      }}
      onSelectMicrophone={(id) => {
        if (!id || id === selectedMicrophoneId) return;
        void replaceAudioTrack(id).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cambiar el micrófono.'));
      }}
      addSourceOpen={addSourceOpen}
      setAddSourceOpen={setAddSourceOpen}
    />
    <LivePrivacySetupSheet
      open={lockSetupOpen}
      draftIds={lockDraftIds}
      privateActive={lockDraftIds.length > 0}
      onClose={() => setLockSetupOpen(false)}
      onToggleGift={toggleLockDraftGift}
      onConfirm={() => setLockSetupOpen(false)}
      onClearPrivate={() => {
        setLockDraftIds([]);
        setLockSetupOpen(false);
      }}
    />
    </>
  );
}
