import { sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import {
  BadgeCheck,
  Bell,
  Camera,
  Check,
  ChevronRight,
  Copy,
  Eye,
  Image as ImageIcon,
  Lock,
  LogOut,
  MoreHorizontal,
  Palette,
  Shield,
  Trash2,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DeleteAccountSection } from '../components/account/DeleteAccountSection';
import { MyReelsPanel } from '../components/feed/MyReelsPanel';
import { api, mapPostgresUser, type SessionUser } from '../lib/api';
import { isSuperAdminEmail } from '../lib/superAdmin';
import {
  adultCutoffDate,
  ageFromIsoDate,
  clearPendingBirth,
  readPendingBirthDate,
} from '../lib/birthDate';
import { LIVE_CATEGORIES } from '../lib/categories';
import { auth } from '../lib/firebase';
import { fetchFirestoreProfile, saveFirestoreAvatar, saveFirestoreProfile, updateFirestoreProfileFields } from '../lib/profileFirestore';
import { dataUrlToBlob, isHttpUrl, uploadUserAvatar } from '../lib/storage';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';

type SettingsTab =
  | 'cuenta'
  | 'privacidad'
  | 'notificaciones'
  | 'preferencias'
  | 'billetera'
  | 'apariencia';

type EditField = 'displayName' | 'username' | null;

type ProfilePayload = {
  id: string;
  firebaseUid: string;
  email: string;
  username: string;
  displayName?: string;
  avatarUrl: string | null;
  bio: string | null;
  birthDate: string | null;
  category?: string | null;
  coinsBalance: number;
  createdAt: string;
  updatedAt: string;
};

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof User }> = [
  { id: 'cuenta', label: 'Cuenta', icon: User },
  { id: 'privacidad', label: 'Privacidad y seguridad', icon: Shield },
  { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
  { id: 'preferencias', label: 'Preferencias', icon: Eye },
  { id: 'billetera', label: 'Billetera', icon: Wallet },
  { id: 'apariencia', label: 'Apariencia', icon: Palette },
];

function cropToAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = document.createElement('img');
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 256;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No se pudo procesar la imagen'));
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Imagen inválida'));
    };
    image.src = objectUrl;
  });
}

function Card({
  title,
  subtitle,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/[0.08] bg-[#14151c] p-4 sm:p-5 ${className}`}
    >
      {title ? (
        <header className="mb-4">
          <h2 className="text-base font-bold text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

function RowLink({
  icon,
  title,
  subtitle,
  onClick,
  to,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  to?: string;
}) {
  const inner = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-zinc-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold text-white">{title}</span>
        {subtitle ? <span className="block text-xs text-zinc-500">{subtitle}</span> : null}
      </span>
      <ChevronRight size={16} className="shrink-0 text-zinc-600" />
    </>
  );
  const className =
    'flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0f1016] px-3 py-3 transition hover:bg-white/[0.03]';
  if (to) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

export function ProfileView() {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const logout = useAuthStore((state) => state.logout);
  const setToast = useUiStore((state) => state.setToast);
  const [searchParams] = useSearchParams();
  const forceComplete = searchParams.get('completar') === '1' || !profile?.birthDate;

  const [tab, setTab] = useState<SettingsTab>('cuenta');
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [username, setUsername] = useState(profile?.handle ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '');
  const [category, setCategory] = useState(profile?.category ?? 'musica');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditField>(null);
  const [copied, setCopied] = useState(false);
  const [notifyLive, setNotifyLive] = useState(true);
  const [notifyMsg, setNotifyMsg] = useState(true);
  const [notifyGifts, setNotifyGifts] = useState(true);
  const [privateProfile, setPrivateProfile] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const galleryAvatarRef = useRef<HTMLInputElement>(null);
  const cameraAvatarRef = useRef<HTMLInputElement>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const maxBirthDate = useMemo(() => adultCutoffDate(), []);
  const calculatedAge = useMemo(() => (birthDate ? ageFromIsoDate(birthDate) : null), [birthDate]);

  const referralPath = profile?.handle
    ? `liveboomapp.com/registro?ref=${encodeURIComponent(profile.handle)}`
    : 'liveboomapp.com/registro';
  const referralUrl = `https://${referralPath}`;

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || firebaseUser?.displayName || '');
    setUsername(profile.handle);
    setBio(profile.bio ?? '');
    setBirthDate(
      profile.birthDate ||
        (firebaseUser ? readPendingBirthDate(firebaseUser.uid) : null) ||
        '',
    );
    setCategory(profile.category ?? 'musica');
    setAvatarUrl(
      profile.avatarUrl?.trim() || firebaseUser?.photoURL?.trim() || '',
    );
  }, [profile, firebaseUser?.photoURL, firebaseUser?.displayName, firebaseUser?.uid]);

  useEffect(() => {
    if (!firebaseUser || !profile) return;
    // Importar foto de Google a Firestore si el perfil aún no tiene avatar
    const googlePhoto = firebaseUser.photoURL?.trim();
    if (!googlePhoto) return;
    if (profile.avatarUrl?.trim()) return;
    void (async () => {
      try {
        await updateFirestoreProfileFields(firebaseUser.uid, { avatarUrl: googlePhoto });
        setAvatarUrl(googlePhoto);
        setProfile({ ...profile, avatarUrl: googlePhoto });
      } catch {
        setAvatarUrl(googlePhoto);
      }
    })();
  }, [firebaseUser?.uid, firebaseUser?.photoURL, profile?.avatarUrl, profile?.firebaseUid, setProfile]);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      try {
        const fsUser = await fetchFirestoreProfile(profile.firebaseUid);
        let user: ProfilePayload | null = null;
        if (fsUser) {
          user = {
            id: fsUser.id,
            firebaseUid: fsUser.firebaseUid,
            email: fsUser.email,
            username: fsUser.handle,
            displayName: fsUser.displayName,
            avatarUrl: fsUser.avatarUrl,
            bio: fsUser.bio,
            birthDate: fsUser.birthDate,
            category: fsUser.category,
            coinsBalance: fsUser.coinsBalance,
            createdAt: '',
            updatedAt: '',
          };
        } else {
          user = await api<ProfilePayload>('/api/users/profile');
        }
        const next: SessionUser = mapPostgresUser(user);
        setProfile({ ...next, coins: profile.coins, coinsBalance: profile.coinsBalance });
        setDisplayName(user.displayName || user.username);
        setUsername(user.username);
        setBio(user.bio ?? '');
        setBirthDate(user.birthDate ?? readPendingBirthDate(profile.firebaseUid) ?? '');
        setCategory(user.category ?? 'musica');
        setAvatarUrl(
          (user.avatarUrl && String(user.avatarUrl).trim()) ||
            firebaseUser?.photoURL?.trim() ||
            '',
        );
      } catch {
        // ignore
      }
    })();
  }, [profile?.firebaseUid, setProfile]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!avatarMenuRef.current?.contains(event.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [avatarMenuOpen]);

  async function onPickAvatar(file: File | undefined) {
    if (!file || !firebaseUser || !profile) return;
    setAvatarBusy(true);
    setError(null);
    setAvatarMenuOpen(false);
    try {
      const dataUrl = await cropToAvatar(file);
      setAvatarUrl(dataUrl);
      const blob = await dataUrlToBlob(dataUrl);
      const url = await uploadUserAvatar(firebaseUser.uid, blob);
      await saveFirestoreAvatar(firebaseUser.uid, url);
      await updateProfile(firebaseUser, { photoURL: url }).catch(() => undefined);
      setAvatarUrl(url);
      setProfile({ ...profile, avatarUrl: url });
      setToast('Foto de perfil guardada.', 'success');
      window.setTimeout(() => setToast(null), 2800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la foto');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function saveBirthDateOnly(nextDate: string) {
    if (!firebaseUser || !profile || !nextDate) return;
    const age = ageFromIsoDate(nextDate);
    if (age == null || age < 18) {
      setError('Debes ser mayor de 18 años para usar Liveboom.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateFirestoreProfileFields(firebaseUser.uid, { birthDate: nextDate });
      try {
        await api('/api/users/profile', {
          method: 'PATCH',
          body: JSON.stringify({ birthDate: nextDate }),
        });
      } catch {
        // Firestore ya guardó
      }
      setProfile({ ...profile, birthDate: nextDate });
      clearPendingBirth(firebaseUser.uid);
      setToast('Fecha de nacimiento guardada.', 'success');
      window.setTimeout(() => setToast(null), 2800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la fecha');
    } finally {
      setBusy(false);
    }
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!firebaseUser || !profile) return;

    const handle = username.trim().replace(/^@/, '').toLowerCase();
    const name = displayName.trim();
    setError(null);

    if (!name) {
      setError('El nombre es obligatorio.');
      return;
    }
    let avatarToSave =
      avatarUrl.trim() || profile.avatarUrl?.trim() || firebaseUser.photoURL?.trim() || '';
    if (!avatarToSave) {
      setError('Agrega una foto de perfil (o usa la de tu cuenta Google).');
      return;
    }
    if (!USERNAME_RE.test(handle)) {
      setError('El usuario debe tener 3-24 caracteres (a-z, 0-9, _).');
      return;
    }
    if (forceComplete && !bio.trim()) {
      setError('La biografía es obligatoria para completar tu perfil.');
      return;
    }
    if (!birthDate) {
      setError('La fecha de nacimiento es obligatoria.');
      return;
    }
    const age = ageFromIsoDate(birthDate);
    if (age == null || age < 18) {
      setError('Debes ser mayor de 18 años para usar Liveboom.');
      return;
    }

    setBusy(true);
    try {
      if (avatarToSave && !isHttpUrl(avatarToSave)) {
        const blob = await dataUrlToBlob(avatarToSave);
        avatarToSave = await uploadUserAvatar(firebaseUser.uid, blob);
        setAvatarUrl(avatarToSave);
        await saveFirestoreAvatar(firebaseUser.uid, avatarToSave);
      }

      const fsSaved = await saveFirestoreProfile({
        uid: firebaseUser.uid,
        email: profile.email,
        username: handle,
        displayName: name,
        avatarUrl: avatarToSave || null,
        bio: bio.trim(),
        birthDate,
        category,
      });

      let next = {
        ...fsSaved,
        displayName: name,
        birthDate,
        category,
      };

      try {
        const updated = await api<ProfilePayload>('/api/users/profile', {
          method: 'PATCH',
          body: JSON.stringify({
            username: handle,
            displayName: name,
            bio: bio.trim(),
            avatarUrl: avatarToSave,
            birthDate,
            category,
          }),
        });
        next = {
          ...mapPostgresUser(updated),
          handle: fsSaved.handle,
          displayName: name,
          avatarUrl: fsSaved.avatarUrl ?? updated.avatarUrl,
          bio: fsSaved.bio ?? updated.bio,
          birthDate: fsSaved.birthDate ?? updated.birthDate ?? birthDate,
          category: fsSaved.category ?? updated.category ?? category,
        };
      } catch {
        // Firestore ya guardó
      }

      setProfile({
        ...next,
        coins: next.coinsBalance,
        coinsBalance: next.coinsBalance,
      });
      clearPendingBirth(firebaseUser.uid);
      const firebasePatch: { displayName: string; photoURL?: string } = { displayName: name };
      if (avatarToSave.startsWith('http')) firebasePatch.photoURL = avatarToSave;
      await updateProfile(firebaseUser, firebasePatch).catch(() => undefined);
      setEditing(null);
      setToast('Perfil guardado.', 'success');
      window.setTimeout(() => setToast(null), 2800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el perfil');
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword() {
    if (!profile?.email) return;
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, profile.email);
      setToast('Te enviamos un correo para cambiar la contraseña.', 'success');
      window.setTimeout(() => setToast(null), 3200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo');
    } finally {
      setBusy(false);
    }
  }

  async function copyReferral() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copia tu enlace:', referralUrl);
    }
  }

  function shareReferral(network: 'wa' | 'fb' | 'x' | 'more') {
    const text = encodeURIComponent(`Únete a LiveBoom con mi enlace: ${referralUrl}`);
    const url = encodeURIComponent(referralUrl);
    if (network === 'wa') {
      window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
      return;
    }
    if (network === 'fb') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'noopener');
      return;
    }
    if (network === 'x') {
      window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener');
      return;
    }
    if (navigator.share) {
      void navigator.share({ title: 'LiveBoom', text: 'Únete a LiveBoom', url: referralUrl });
    } else {
      void copyReferral();
    }
  }

  if (!profile && !firebaseUser) {
    return (
      <div className="lb-panel rounded-2xl p-6 text-center text-sm text-zinc-400">
        <Link to="/login" className="text-cyan-400 underline">
          Inicia sesión
        </Link>{' '}
        para administrar tu cuenta.
      </div>
    );
  }

  const emailVerified = Boolean(firebaseUser?.emailVerified);

  return (
    <div className="lb-page mx-auto w-full max-w-5xl space-y-5 pb-2">
      <header>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Configuración</h1>
        <p className="mt-1 text-sm text-zinc-400">Administra tu cuenta, privacidad y preferencias.</p>
      </header>

      <nav className="chat-scroll -mx-1 flex gap-1 overflow-x-auto border-b border-white/[0.06] px-1 pb-px">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-semibold transition ${
                active ? 'text-violet-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon size={16} className={active ? 'text-violet-400' : ''} />
              <span className="whitespace-nowrap">{item.label}</span>
              {active ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-violet-500" />
              ) : null}
            </button>
          );
        })}
      </nav>

      {forceComplete && tab === 'cuenta' ? (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-50">
          Completa tu @usuario y fecha de nacimiento, luego guarda los cambios.
        </p>
      ) : null}

      {error ? <p className="text-sm text-fuchsia-400">{error}</p> : null}

      {tab === 'cuenta' && profile ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-4">
            <Card
              title="Información de la cuenta"
              subtitle="Actualiza tu información personal y de contacto."
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="relative mx-auto shrink-0 sm:mx-0" ref={avatarMenuRef}>
                  <div className="h-[5.5rem] w-[5.5rem] overflow-hidden rounded-full bg-zinc-900 ring-2 ring-white/10">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-zinc-600">
                        <Camera size={28} />
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAvatarMenuOpen((value) => !value)}
                    disabled={avatarBusy}
                    className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-violet-600 text-white shadow-lg ring-2 ring-[#14151c] disabled:opacity-60"
                    aria-label="Cambiar foto"
                  >
                    <Camera size={14} />
                  </button>
                  {avatarMenuOpen ? (
                    <div className="absolute left-0 top-full z-10 mt-2 min-w-[10.5rem] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarMenuOpen(false);
                          galleryAvatarRef.current?.click();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-zinc-200 hover:bg-white/5"
                      >
                        <ImageIcon size={14} className="text-cyan-300" />
                        Galería
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarMenuOpen(false);
                          cameraAvatarRef.current?.click();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-zinc-200 hover:bg-white/5"
                      >
                        <Camera size={14} className="text-violet-300" />
                        Cámara
                      </button>
                    </div>
                  ) : null}
                  <input
                    ref={galleryAvatarRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void onPickAvatar(e.target.files?.[0])}
                  />
                  <input
                    ref={cameraAvatarRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={(e) => void onPickAvatar(e.target.files?.[0])}
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <InfoRow
                    label="Nombre"
                    value={displayName || '—'}
                    editing={editing === 'displayName'}
                    onEdit={() => setEditing('displayName')}
                    onCancel={() => setEditing(null)}
                  >
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-violet-500"
                    />
                  </InfoRow>

                  <InfoRow
                    label="Nombre de usuario"
                    value={`@${username.replace(/^@/, '') || '—'}`}
                    editing={editing === 'username'}
                    onEdit={() => setEditing('username')}
                    onCancel={() => setEditing(null)}
                  >
                    <div className="flex overflow-hidden rounded-lg border border-white/10 bg-zinc-950 focus-within:border-violet-500">
                      <span className="grid place-items-center px-2 text-violet-300">@</span>
                      <input
                        value={username.replace(/^@/, '')}
                        onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))}
                        className="h-9 min-w-0 flex-1 bg-transparent pr-3 text-sm text-white outline-none"
                      />
                    </div>
                  </InfoRow>

                  <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] pb-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-zinc-500">Correo electrónico</p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-white">
                        {profile.email || '—'}
                      </p>
                    </div>
                    {emailVerified ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                        <Check size={12} /> Verificado
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200">
                        Pendiente
                      </span>
                    )}
                  </div>

                  <div className="border-b border-white/[0.05] pb-3">
                    <p className="text-[11px] font-medium text-zinc-500">Fecha de nacimiento</p>
                    <input
                      type="date"
                      value={birthDate}
                      max={maxBirthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value && value !== profile.birthDate) {
                          void saveBirthDateOnly(value);
                        }
                      }}
                      className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none [color-scheme:dark] focus:border-violet-500"
                    />
                    {calculatedAge != null ? (
                      <p className="mt-1 text-[11px] text-zinc-500">Edad: {calculatedAge} años</p>
                    ) : (
                      <p className="mt-1 text-[11px] text-zinc-500">Obligatoria · mayor de 18 años</p>
                    )}
                  </div>

                  {editing ? (
                    <button
                      type="button"
                      disabled={busy || avatarBusy}
                      onClick={() => void save()}
                      className="h-10 w-full rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busy ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                disabled={busy || avatarBusy}
                onClick={() => void save()}
                className="mt-4 h-11 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? 'Guardando perfil…' : avatarBusy ? 'Subiendo foto…' : 'Guardar perfil'}
              </button>
            </Card>

            <Card title="Verificación de cuenta" subtitle="Aumenta tu seguridad y accede a más beneficios.">
              <div
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                  emailVerified
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-amber-500/30 bg-amber-500/10'
                }`}
              >
                <span
                  className={`grid h-10 w-10 place-items-center rounded-full ${
                    emailVerified ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {emailVerified ? <BadgeCheck size={20} /> : <Shield size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">
                    {emailVerified ? 'Cuenta verificada' : 'Verificación pendiente'}
                  </span>
                  <span className="block text-xs text-zinc-400">
                    {emailVerified
                      ? 'Tu cuenta está verificada.'
                      : 'Confirma tu correo para verificar la cuenta.'}
                  </span>
                </span>
                <ChevronRight size={16} className="text-zinc-500" />
              </div>
            </Card>

            <RowLink
              icon={<Lock size={18} />}
              title="Cambiar contraseña"
              subtitle="Asegura tu cuenta con una contraseña fuerte."
              onClick={() => void onChangePassword()}
            />

            <Card title="Eliminar cuenta" subtitle="Esta acción no se puede deshacer.">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-500">
                  Se borrarán perfil, publicaciones, amistades y mensajes.
                </p>
                <DeleteAccount inline />
              </div>
            </Card>
          </div>

          <Card className="h-fit">
            <header className="mb-4 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/20 text-violet-300">
                <Users size={18} />
              </span>
              <div>
                <h2 className="text-base font-bold text-white">Programa de referidos</h2>
                <p className="text-[11px] text-zinc-500">Invita amigos y gana coins juntos.</p>
              </div>
            </header>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/[0.06] bg-[#0f1016] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Tus referidos
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-white">
                  <Users size={16} className="text-violet-400" /> 0
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#0f1016] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Coins ganados
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-white">
                  <span className="text-amber-400">●</span> 0
                </p>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold text-white">Cómo funciona</p>
              <ol className="mt-3 space-y-3">
                {[
                  'Invita a tus amigos',
                  'Ellos se registran',
                  'Ambos ganan',
                ].map((step, i) => (
                  <li key={step} className="flex items-center gap-3 text-sm text-zinc-300">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold text-white">Tu enlace de referido</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={referralPath}
                  className="h-11 min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-zinc-950 px-3 text-xs text-zinc-300 outline-none"
                />
                <button
                  type="button"
                  onClick={() => void copyReferral()}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-bold text-white"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold text-white">Compartir enlace</p>
              <div className="flex flex-wrap gap-2">
                <ShareCircle label="WhatsApp" onClick={() => shareReferral('wa')} tone="bg-emerald-500/20 text-emerald-300">
                  WA
                </ShareCircle>
                <ShareCircle label="Instagram" onClick={() => shareReferral('more')} tone="bg-pink-500/20 text-pink-300">
                  IG
                </ShareCircle>
                <ShareCircle label="Facebook" onClick={() => shareReferral('fb')} tone="bg-blue-500/20 text-blue-300">
                  FB
                </ShareCircle>
                <ShareCircle label="X" onClick={() => shareReferral('x')} tone="bg-zinc-500/30 text-zinc-200">
                  X
                </ShareCircle>
                <ShareCircle label="Más" onClick={() => shareReferral('more')} tone="bg-white/10 text-zinc-300">
                  <MoreHorizontal size={16} />
                </ShareCircle>
              </div>
            </div>

            <button
              type="button"
              className="mt-5 flex w-full items-center justify-center gap-1 text-sm font-semibold text-violet-300 hover:underline"
            >
              Ver mis referidos <ChevronRight size={14} />
            </button>
          </Card>
        </div>
      ) : null}

      {tab === 'privacidad' ? (
        <div className="space-y-4">
          <Card title="Privacidad y seguridad" subtitle="Controla quién ve tu contenido y cómo proteges tu cuenta.">
            <div className="space-y-3">
              <ToggleRow
                title="Perfil más privado"
                subtitle="Limita quién puede enviarte solicitudes."
                checked={privateProfile}
                onChange={setPrivateProfile}
              />
              <RowLink
                icon={<Lock size={18} />}
                title="Cambiar contraseña"
                subtitle="Te enviaremos un correo seguro."
                onClick={() => void onChangePassword()}
              />
              <RowLink
                icon={<Shield size={18} />}
                title="Sesiones y dispositivos"
                subtitle="Revisa accesos recientes desde tu correo."
                to="/legal/privacidad"
              />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'notificaciones' ? (
        <Card title="Notificaciones" subtitle="Elige qué alertas quieres recibir.">
          <div className="space-y-3">
            <ToggleRow
              title="Amigos en LIVE"
              subtitle="Sonido y aviso cuando un amigo transmite."
              checked={notifyLive}
              onChange={setNotifyLive}
            />
            <ToggleRow
              title="Mensajes privados"
              subtitle="Alerta cuando recibes un chat."
              checked={notifyMsg}
              onChange={setNotifyMsg}
            />
            <ToggleRow
              title="Regalos y actividad"
              subtitle="Avisos de regalos y menciones."
              checked={notifyGifts}
              onChange={setNotifyGifts}
            />
          </div>
        </Card>
      ) : null}

      {tab === 'preferencias' && profile ? (
        <div className="space-y-4">
          <Card title="Preferencias" subtitle="Biografía, categoría y contenido.">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-zinc-300">Biografía</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  maxLength={280}
                  className="min-h-[100px] w-full resize-none rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-zinc-300">Categoría principal</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none [color-scheme:dark] focus:border-violet-500"
                >
                  {LIVE_CATEGORIES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.emoji} {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="h-11 w-full rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? 'Guardando…' : 'Guardar preferencias'}
              </button>
            </form>
          </Card>
          <MyReelsPanel username={profile.handle} />
        </div>
      ) : null}

      {tab === 'billetera' && profile ? (
        <Card title="Billetera" subtitle="Saldo y movimientos de coins.">
          <p className="text-3xl font-bold text-cyan-300">
            {profile.coinsBalance.toLocaleString('es-CO')}{' '}
            <span className="text-base font-semibold text-zinc-400">coins</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/billetera"
              className="inline-flex h-11 items-center rounded-xl bg-violet-600 px-4 text-sm font-bold text-white"
            >
              Abrir billetera
            </Link>
            <Link
              to="/billetera"
              className="inline-flex h-11 items-center rounded-xl border border-emerald-500/40 px-4 text-sm font-bold text-emerald-300"
            >
              Retirar
            </Link>
          </div>
        </Card>
      ) : null}

      {tab === 'apariencia' ? (
        <Card title="Apariencia" subtitle="Tema visual de LiveBoom.">
          <p className="text-sm text-zinc-400">
            Por ahora LiveBoom usa el tema oscuro oficial del mockup. Pronto podrás ajustar acentos.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {['Oscuro', 'Auto', 'Claro'].map((label, i) => (
              <button
                key={label}
                type="button"
                disabled={i !== 0}
                className={`rounded-xl border px-3 py-4 text-xs font-bold ${
                  i === 0
                    ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                    : 'border-white/10 text-zinc-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {profile ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 text-sm font-semibold text-fuchsia-200"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          ) : null}
        </Card>
      ) : null}

      {profile ? (
        <p className="text-center text-xs text-zinc-600">
          <Link to={`/u/${encodeURIComponent(profile.handle)}`} className="text-cyan-400 hover:underline">
            Ver mi perfil público
          </Link>
          {isSuperAdminEmail(profile.email) ? (
            <>
              {' · '}
              <Link to="/super-admin" className="text-fuchsia-400/80 hover:underline">
                Super Admin
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function InfoRow({
  label,
  value,
  editing,
  onEdit,
  onCancel,
  children,
}: {
  label: string;
  value: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-zinc-500">{label}</p>
          {editing ? <div className="mt-1">{children}</div> : (
            <p className="mt-0.5 truncate text-sm font-semibold text-white">{value}</p>
          )}
        </div>
        {editing ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300"
          >
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            Editar
          </button>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0f1016] px-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-xs text-zinc-500">{subtitle}</span>
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

function ShareCircle({
  children,
  label,
  onClick,
  tone,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tone: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`grid h-11 w-11 place-items-center rounded-full text-xs font-bold ${tone}`}
    >
      {children}
    </button>
  );
}

/** Botón rojo del mockup + diálogo de confirmación existente. */
function DeleteAccount({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!inline) return <DeleteAccountSection />;
  return (
    <div className="shrink-0">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-400 hover:text-rose-300"
        >
          <Trash2 size={15} /> Eliminar mi cuenta
        </button>
      ) : (
        <div className="min-w-[14rem]">
          <DeleteAccountSection />
        </div>
      )}
    </div>
  );
}
