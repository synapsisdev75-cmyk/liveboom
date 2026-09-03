import { Link, useNavigate } from 'react-router-dom';
import { type LiveAspectRatio } from '../lib/liveAspectRatio';
import { useAuthStore } from '../store/authStore';
import { TransmitStudioBody } from './TransmitStudioBody';
import type { BroadcastMode, LiveStudioFormat } from '../components/live/studio/liveStudioTypes';
import { studioFormatToAspect } from '../components/live/studio/liveStudioTypes';
import { useEffect, useMemo, useRef, useState } from 'react';

const CHECKLIST_KEY = 'liveboom.preLiveChecklist.v1';

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
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [goalCoins, setGoalCoins] = useState('500');
  const [goalLabel, setGoalLabel] = useState('Meta en coins');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [allowGifts, setAllowGifts] = useState(true);
  const [liveChat, setLiveChat] = useState(true);
  const [followersOnly, setFollowersOnly] = useState(false);
  const [saveProfile, setSaveProfile] = useState(true);
  const [studioFormat, setStudioFormat] = useState<LiveStudioFormat>('9:16');
  const [broadcastMode, setBroadcastMode] = useState<BroadcastMode>('camera');
  const [mirrorPreview, setMirrorPreview] = useState(true);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [checks, setChecks] = useState<ChecklistState>(() => loadChecklist());
  const [error, setError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const aspectRatio: LiveAspectRatio = studioFormatToAspect(studioFormat);

  useEffect(() => {
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checks));
  }, [checks]);

  const rulesAccepted =
    checks.age && checks.content && checks.rules && checks.consequences;

  const canContinue = useMemo(
    () => rulesAccepted && title.trim().length >= 3 && Boolean(category),
    [rulesAccepted, title, category],
  );

  useEffect(() => {
    if (!profile) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPreviewReady(false);
      return;
    }
    let cancelled = false;
    void navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
          void previewVideoRef.current.play().catch(() => undefined);
        }
        setPreviewReady(true);
      })
      .catch(() => setPreviewReady(false));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPreviewReady(false);
    };
  }, [profile]);

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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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
      },
    });
  }

  return (
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
      mirrorPreview={mirrorPreview}
      setMirrorPreview={setMirrorPreview}
      addSourceOpen={addSourceOpen}
      setAddSourceOpen={setAddSourceOpen}
    />
  );
}
