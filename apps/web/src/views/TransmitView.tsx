import {
  Ban,
  Camera,
  Check,
  Heart,
  ImagePlus,
  Info,
  Lock,
  Radio,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LIVE_CATEGORIES } from '../lib/categories';
import {
  type LiveAspectRatio,
  liveAspectRatioLabel,
  livePreviewFrameClass,
} from '../lib/liveAspectRatio';
import { useAuthStore } from '../store/authStore';

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

const RULE_ICONS = [
  { icon: '18+', label: 'Debo tener 18 años o más' },
  { icon: 'shield', label: 'No contenido sexual o explícito' },
  { icon: 'ban', label: 'No actividades ilegales o peligrosas' },
  { icon: 'users', label: 'Respeto las reglas de la comunidad' },
  { icon: 'lock', label: 'Entiendo las consecuencias por incumplimiento' },
] as const;

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
  const [aspectRatio, setAspectRatio] = useState<LiveAspectRatio>('9:16');
  const [checks, setChecks] = useState<ChecklistState>(() => loadChecklist());
  const [error, setError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    if (step !== 2) {
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
  }, [step]);

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
        description: description.trim().slice(0, 200),
        allowGifts,
        liveChat,
        saveProfile,
        thumbnail,
      },
    });
  }

  const suggestedThumbs = LIVE_CATEGORIES.slice(0, 3);

  return (
    <div className="lb-page mx-auto w-full max-w-4xl space-y-5 pb-2">
      <header>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-white sm:text-3xl">
          <Radio className="text-violet-400" size={28} />
          Iniciar transmisión
        </h1>
        <p className="mt-1 text-sm text-zinc-400">Configura tu live y conecta con tu audiencia.</p>
      </header>

      {/* Stepper */}
      <nav className="flex items-center justify-center gap-2 sm:gap-3">
        {(
          [
            { n: 1 as const, label: 'Configurar' },
            { n: 2 as const, label: 'Vista previa' },
            { n: 3 as const, label: 'Transmitir' },
          ] as const
        ).map((item, i, arr) => {
          const active = step === item.n;
          const done = step > item.n;
          return (
            <div key={item.n} className="flex items-center gap-2 sm:gap-3">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${
                    active || done
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {done ? <Check size={16} /> : item.n}
                </span>
                <span
                  className={`text-[11px] font-semibold sm:text-xs ${
                    active ? 'text-violet-300' : 'text-zinc-500'
                  }`}
                >
                  {item.label}
                </span>
                {active ? (
                  <span className="h-0.5 w-12 rounded-full bg-violet-500 sm:w-16" />
                ) : (
                  <span className="h-0.5 w-12 bg-transparent sm:w-16" />
                )}
              </div>
              {i < arr.length - 1 ? (
                <span
                  className={`mb-5 hidden h-px w-8 border-t border-dashed sm:block md:w-14 ${
                    step > item.n ? 'border-violet-500' : 'border-zinc-700'
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </nav>

      {error ? (
        <p className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200">
          {error}
        </p>
      ) : null}

      {step === 1 ? (
        <>
          {/* Rules banner */}
          <section className="rounded-2xl border border-amber-500/40 bg-[#14151c] p-4 sm:p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-200">
              <ShieldCheck size={18} className="text-amber-400" />
              Antes de iniciar tu live
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Sigue estas reglas para evitar la suspensión de tu cuenta.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {RULE_ICONS.map((item) => (
                <div key={item.label} className="flex flex-col items-center gap-2 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200">
                    {item.icon === '18+' ? (
                      <span className="text-[11px] font-black">18+</span>
                    ) : item.icon === 'shield' ? (
                      <Heart size={18} />
                    ) : item.icon === 'ban' ? (
                      <Ban size={18} />
                    ) : item.icon === 'users' ? (
                      <Users size={18} />
                    ) : (
                      <Lock size={18} />
                    )}
                  </span>
                  <span className="text-[10px] leading-snug text-zinc-400 sm:text-[11px]">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={rulesAccepted}
                onChange={(e) => setAllRules(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 accent-violet-500"
              />
              <span className="text-sm text-zinc-200">
                He leído y acepto las reglas de LiveBoom
              </span>
            </label>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-4 sm:p-5">
            <h2 className="text-base font-bold text-white">Información básica</h2>

            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-zinc-400">
                    Título del live <span className="text-rose-400">*</span>
                  </span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej: Noche de música en vivo 🎵"
                    maxLength={80}
                    className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-violet-500"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-zinc-400">
                    Categoría <span className="text-rose-400">*</span>
                  </span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none [color-scheme:dark] focus:border-violet-500"
                  >
                    <option value="">Selecciona una categoría</option>
                    {LIVE_CATEGORIES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.emoji} {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <p className="text-xs font-semibold text-zinc-400">Miniatura del live</p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-cyan-400/40 bg-cyan-500/5 text-cyan-300 sm:w-40"
                    >
                      <ImagePlus size={22} />
                      <span className="text-xs font-bold">Subir miniatura</span>
                      <span className="text-[10px] text-zinc-500">JPG, PNG, Máx. 5MB</span>
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => onPickThumb(e.target.files?.[0] || null)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="mb-2 text-[11px] text-zinc-500">o elige una sugerida</p>
                      <div className="flex gap-2">
                        {suggestedThumbs.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setThumbnail(c.icon);
                              setCategory((prev) => prev || c.id);
                            }}
                            className={`h-16 w-16 overflow-hidden rounded-lg ring-2 transition ${
                              thumbnail === c.icon ? 'ring-violet-500' : 'ring-transparent hover:ring-white/20'
                            }`}
                          >
                            <img src={c.icon} alt={c.label} className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                      {thumbnail ? (
                        <p className="mt-2 truncate text-[10px] text-emerald-400">Miniatura lista</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-zinc-400">Descripción (opcional)</span>
                  <div className="relative">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                      rows={4}
                      placeholder="Cuéntale a tu audiencia de qué va el live…"
                      className="w-full resize-none rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                    />
                    <span className="absolute bottom-2 right-3 text-[10px] text-zinc-600">
                      {description.length}/200
                    </span>
                  </div>
                </label>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/[0.06] bg-[#0f1016] p-3.5">
                  <p className="text-sm font-bold text-white">Objetivo del live (opcional)</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">¿Qué quieres lograr?</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <select
                      value={goalLabel}
                      onChange={(e) => setGoalLabel(e.target.value)}
                      className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none [color-scheme:dark]"
                    >
                      <option>Meta en coins</option>
                      <option>Nuevo equipo</option>
                      <option>Meta del mes</option>
                      <option>Otro</option>
                    </select>
                    <label className="relative block w-full sm:w-28">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-400">
                        ●
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={goalCoins}
                        onChange={(e) => setGoalCoins(e.target.value)}
                        className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950 pl-7 pr-3 text-sm text-white outline-none"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-[11px] leading-snug text-sky-100">
                    <Info size={14} className="mt-0.5 shrink-0 text-sky-300" />
                    <span>
                      <strong className="font-semibold">¿Cómo funciona?</strong> La meta se muestra
                      en tu sala y motiva a tu audiencia a enviar regalos.
                    </span>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-wide text-white">
                    Formato de transmisión
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAspectRatio('16:9')}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        aspectRatio === '16:9'
                          ? 'border-cyan-400/60 bg-cyan-500/10 ring-1 ring-cyan-400/30'
                          : 'border-white/[0.06] bg-[#0f1016] hover:border-white/20'
                      }`}
                    >
                      <span className="block text-sm font-black text-white">16:9</span>
                      <span className="block text-[11px] text-zinc-500">Horizontal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAspectRatio('9:16')}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        aspectRatio === '9:16'
                          ? 'border-cyan-400/60 bg-cyan-500/10 ring-1 ring-cyan-400/30'
                          : 'border-white/[0.06] bg-[#0f1016] hover:border-white/20'
                      }`}
                    >
                      <span className="block text-sm font-black text-white">9:16</span>
                      <span className="block text-[11px] text-zinc-500">Vertical</span>
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-500">
                    El formato se mantiene durante toda la transmisión. Cámara y pantalla compartida se
                    adaptan dentro del marco elegido.
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-bold text-white">Opciones del live</p>
                  <div className="space-y-2">
                    <Toggle
                      checked={allowGifts}
                      onChange={setAllowGifts}
                      label="Permitir regalos"
                      hint="Los viewers pueden enviarte coins"
                    />
                    <Toggle
                      checked={liveChat}
                      onChange={setLiveChat}
                      label="Chat en vivo"
                      hint="Mensajes en tiempo real en la sala"
                    />
                    <Toggle
                      checked={followersOnly}
                      onChange={setFollowersOnly}
                      label="Solo seguidores"
                      hint="Limita quién puede entrar al live"
                    />
                    <Toggle
                      checked={saveProfile}
                      onChange={setSaveProfile}
                      label="Guardar en mi perfil"
                      hint="Queda en tu historial de lives"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={goToPreview}
              disabled={!canContinue}
              className="lb-gradient-btn mt-6 flex h-12 w-full items-center justify-center rounded-xl text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              Continuar a vista previa →
            </button>
          </section>
        </>
      ) : null}

      {step === 2 || step === 3 ? (
        <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#14151c] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-white">Vista previa</h2>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs font-semibold text-cyan-400 hover:underline"
            >
              ← Editar configuración
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="flex flex-col items-center justify-center gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Vista previa · {liveAspectRatioLabel(aspectRatio)}
              </p>
              <div className={livePreviewFrameClass(aspectRatio)}>
                <video
                  ref={previewVideoRef}
                  muted
                  playsInline
                  className="h-full w-full object-contain"
                />
                {!previewReady ? (
                  <div className="absolute inset-0 grid place-items-center bg-zinc-950/80 text-center">
                    {thumbnail ? (
                      <img src={thumbnail} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <div className="px-4">
                        <Camera className="mx-auto text-zinc-600" size={36} />
                        <p className="mt-2 text-xs text-zinc-500">
                          Permite la cámara para previsualizar, o usa la miniatura.
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}
                <span className="absolute left-3 top-3 rounded bg-violet-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                  Preview
                </span>
              </div>
              <div className="grid w-full max-w-md grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={`rounded-xl border px-3 py-2 text-center text-xs font-bold transition ${
                    aspectRatio === '16:9'
                      ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100'
                      : 'border-white/[0.08] bg-zinc-950 text-zinc-400'
                  }`}
                >
                  16:9 Horizontal
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`rounded-xl border px-3 py-2 text-center text-xs font-bold transition ${
                    aspectRatio === '9:16'
                      ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100'
                      : 'border-white/[0.08] bg-zinc-950 text-zinc-400'
                  }`}
                >
                  9:16 Vertical
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-medium text-zinc-500">Título</p>
                <p className="text-sm font-bold text-white">{displayTitle}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-zinc-500">Categoría</p>
                <p className="text-sm text-zinc-200">
                  {LIVE_CATEGORIES.find((c) => c.id === category)?.label || category}
                </p>
              </div>
              {description ? (
                <div>
                  <p className="text-[11px] font-medium text-zinc-500">Descripción</p>
                  <p className="text-xs text-zinc-400">{description}</p>
                </div>
              ) : null}
              <div>
                <p className="text-[11px] font-medium text-zinc-500">Formato</p>
                <p className="text-sm text-zinc-200">{liveAspectRatioLabel(aspectRatio)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-zinc-500">Objetivo</p>
                <p className="text-sm text-amber-200">
                  {goalLabel}: {Number(goalCoins || 0).toLocaleString('es-CO')} coins
                </p>
              </div>
              <ul className="space-y-1 text-[11px] text-zinc-400">
                <li>{allowGifts ? '✓ Regalos activos' : '○ Regalos desactivados'}</li>
                <li>{liveChat ? '✓ Chat en vivo' : '○ Chat desactivado'}</li>
                <li>{followersOnly ? '✓ Solo seguidores' : '○ Live público'}</li>
                <li>{saveProfile ? '✓ Guardar en perfil' : '○ No guardar en perfil'}</li>
              </ul>
            </div>
          </div>

          <button
            type="button"
            onClick={goLive}
            className="lb-gradient-btn flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white"
          >
            <Radio size={16} />
            {step === 3 ? 'Conectando…' : 'Iniciar transmisión →'}
          </button>
        </section>
      ) : null}
    </div>
  );
}
