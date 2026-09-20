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
  Share2,
  Shield,
  Trash2,
  User,
  Users,
  Wallet,
  Languages,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DeleteAccountSection } from '../components/account/DeleteAccountSection';
import { CallSettingsPanel } from '../components/social/CallSettingsPanel';
import { MyReelsPanel } from '../components/feed/MyReelsPanel';
import { api, type SessionUser } from '../lib/api';
import { isOwnerEmail, isSuperAdminEmail } from '../lib/superAdmin';
import { listenSuperAdmins } from '../lib/superAdminsFirestore';
import {
  adultCutoffDate,
  ageFromIsoDate,
  clearPendingBirth,
  readPendingBirthDate,
} from '../lib/birthDate';
import { LIVE_CATEGORIES } from '../lib/categories';
import { auth } from '../lib/firebase';
import {
  mapProfileSaveError,
  saveFirestoreAvatar,
  saveFirestoreProfile,
  updateFirestoreProfileFields,
} from '../lib/profileFirestore';
import { dataUrlToBlob, isHttpUrl, uploadUserAvatar } from '../lib/storage';
import { cropToAvatar } from '../lib/avatarCrop';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { LanguageSelector } from '../components/i18n/LanguageSelector';
import { LanguageControl } from '../components/i18n/LanguageControl';
import { bcp47For, categoryMessageKey, useT } from '../i18n';

type SettingsTab =
  | 'cuenta'
  | 'privacidad'
  | 'notificaciones'
  | 'preferencias'
  | 'billetera'
  | 'idioma';

type EditField = 'displayName' | 'username' | null;

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const NAME_MAX = 48;
const BIO_MAX = 280;

type ProfileFormSnapshot = {
  displayName: string;
  username: string;
  bio: string;
  birthDate: string;
  category: string;
  avatarUrl: string;
};

function sanitizeDisplayName(value: string) {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

function snapshotFromProfile(profile: SessionUser, firebasePhoto?: string | null): ProfileFormSnapshot {
  return {
    displayName: sanitizeDisplayName(profile.displayName || ''),
    username: String(profile.handle || '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase(),
    bio: (profile.bio ?? '').trim(),
    birthDate: profile.birthDate ?? '',
    category: profile.category ?? 'musica',
    avatarUrl: profile.avatarUrl?.trim() || firebasePhoto?.trim() || '',
  };
}

function formEqualsSnapshot(
  form: ProfileFormSnapshot,
  saved: ProfileFormSnapshot,
) {
  return (
    form.displayName === saved.displayName &&
    form.username === saved.username &&
    form.bio === saved.bio &&
    form.birthDate === saved.birthDate &&
    form.category === saved.category &&
    form.avatarUrl === saved.avatarUrl
  );
}

const TABS: Array<{ id: SettingsTab; labelKey: 'settings.tabAccount' | 'settings.tabPrivacy' | 'settings.tabNotifications' | 'settings.tabPreferences' | 'settings.tabWallet' | 'settings.tabLanguage'; icon: typeof User }> = [
  { id: 'cuenta', labelKey: 'settings.tabAccount', icon: User },
  { id: 'privacidad', labelKey: 'settings.tabPrivacy', icon: Shield },
  { id: 'notificaciones', labelKey: 'settings.tabNotifications', icon: Bell },
  { id: 'preferencias', labelKey: 'settings.tabPreferences', icon: Eye },
  { id: 'idioma', labelKey: 'settings.tabLanguage', icon: Languages },
  { id: 'billetera', labelKey: 'settings.tabWallet', icon: Wallet },
];

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
      className={`min-w-0 overflow-x-clip rounded-2xl border border-white/[0.08] bg-[#14151c] p-4 sm:p-5 ${className}`}
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
    'lb-settings-row flex w-full items-center gap-3 rounded-xl px-3 py-3 transition';
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
  const t = useT();
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
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const maxBirthDate = useMemo(() => adultCutoffDate(), []);
  const calculatedAge = useMemo(() => (birthDate ? ageFromIsoDate(birthDate) : null), [birthDate]);
  const [superAllowlist, setSuperAllowlist] = useState<string[]>([]);
  const showSuperAdminLink = isSuperAdminEmail(profile?.email, superAllowlist);

  const currentForm = useMemo<ProfileFormSnapshot>(
    () => ({
      displayName: sanitizeDisplayName(displayName),
      username: username.trim().replace(/^@/, '').toLowerCase(),
      bio: bio.trim(),
      birthDate,
      category,
      avatarUrl: avatarUrl.trim(),
    }),
    [displayName, username, bio, birthDate, category, avatarUrl],
  );
  const savedForm = useMemo(
    () => (profile ? snapshotFromProfile(profile, firebaseUser?.photoURL) : currentForm),
    [profile, firebaseUser?.photoURL, currentForm],
  );
  const hasChanges = Boolean(profile) && !formEqualsSnapshot(currentForm, savedForm);
  dirtyRef.current = hasChanges;
  busyRef.current = busy;

  useEffect(() => {
    if (!profile?.email || isOwnerEmail(profile.email)) {
      setSuperAllowlist([]);
      return;
    }
    return listenSuperAdmins((doc) => setSuperAllowlist(doc?.emails ?? []));
  }, [profile?.email]);

  const referralPath = profile?.handle
    ? `liveboomapp.com/registro?ref=${encodeURIComponent(profile.handle)}`
    : 'liveboomapp.com/registro';
  const referralUrl = `https://${referralPath}`;

  useEffect(() => {
    if (!profile) return;
    if (busyRef.current || dirtyRef.current) return;
    const next = snapshotFromProfile(profile, firebaseUser?.photoURL);
    setDisplayName(next.displayName);
    setUsername(next.username);
    setBio(next.bio);
    setBirthDate(
      next.birthDate ||
        (firebaseUser ? readPendingBirthDate(firebaseUser.uid) : null) ||
        '',
    );
    setCategory(next.category);
    setAvatarUrl(next.avatarUrl);
  }, [
    profile?.firebaseUid,
    profile?.displayName,
    profile?.handle,
    profile?.bio,
    profile?.birthDate,
    profile?.category,
    profile?.avatarUrl,
    firebaseUser?.photoURL,
  ]);

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
      setToast(t('settings.photoSaved'), 'success');
      window.setTimeout(() => setToast(null), 2800);
    } catch (err) {
      setError(mapProfileSaveError(err));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function saveBirthDateOnly(nextDate: string) {
    if (!firebaseUser || !profile || !nextDate) return;
    const age = ageFromIsoDate(nextDate);
    if (age == null || age < 18) {
      setError(t('settings.mustBe18'));
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
      setToast(t('settings.birthSaved'), 'success');
      window.setTimeout(() => setToast(null), 2800);
    } catch (err) {
      setError(mapProfileSaveError(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!firebaseUser || !profile) return;

    const handle = username.trim().replace(/^@/, '').toLowerCase();
    const name = sanitizeDisplayName(displayName);
    const nextBio = bio.trim().slice(0, BIO_MAX);
    setError(null);

    if (!name) {
      setError(t('settings.nameRequired'));
      return;
    }
    if (/[<>]/.test(name)) {
      setError(t('settings.nameInvalidChars'));
      return;
    }
    let avatarToSave =
      avatarUrl.trim() || profile.avatarUrl?.trim() || firebaseUser.photoURL?.trim() || '';
    if (!avatarToSave) {
      setError(t('settings.photoRequired'));
      return;
    }
    if (!USERNAME_RE.test(handle)) {
      setError(t('settings.usernameFormat'));
      return;
    }
    if (forceComplete && !nextBio) {
      setError(t('settings.bioRequired'));
      return;
    }
    if (!birthDate) {
      setError(t('settings.birthMissing'));
      return;
    }
    const age = ageFromIsoDate(birthDate);
    if (age == null || age < 18) {
      setError(t('settings.mustBe18'));
      return;
    }

    const prevHandle = String(profile.handle || '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase();
    const changed: Record<string, string | null> = {};
    if (name !== sanitizeDisplayName(profile.displayName || '')) changed.displayName = name;
    if (handle !== prevHandle) changed.username = handle;
    if (nextBio !== (profile.bio ?? '').trim()) changed.bio = nextBio;
    if (birthDate !== (profile.birthDate ?? '')) changed.birthDate = birthDate;
    if ((category || 'musica') !== (profile.category ?? 'musica')) changed.category = category;
    const prevAvatar = profile.avatarUrl?.trim() || '';
    if (isHttpUrl(avatarToSave) && avatarToSave !== prevAvatar) changed.avatarUrl = avatarToSave;

    if (Object.keys(changed).length === 0 && isHttpUrl(avatarToSave)) {
      setToast(t('settings.profileUpdated'), 'success');
      window.setTimeout(() => setToast(null), 2800);
      setEditing(null);
      return;
    }

    setBusy(true);
    try {
      if (avatarToSave && !isHttpUrl(avatarToSave)) {
        const blob = await dataUrlToBlob(avatarToSave);
        avatarToSave = await uploadUserAvatar(firebaseUser.uid, blob);
        setAvatarUrl(avatarToSave);
        await saveFirestoreAvatar(firebaseUser.uid, avatarToSave);
        changed.avatarUrl = avatarToSave;
      }

      let fsSaved;
      if (changed.username) {
        fsSaved = await saveFirestoreProfile({
        uid: firebaseUser.uid,
        email: profile.email,
        username: handle,
        displayName: name,
        avatarUrl: avatarToSave || null,
          bio: nextBio,
        birthDate,
        category,
      });
      } else {
        const fieldPatch: Parameters<typeof updateFirestoreProfileFields>[1] = {};
        if (changed.displayName != null) fieldPatch.displayName = name;
        if (changed.bio != null) fieldPatch.bio = nextBio;
        if (changed.birthDate != null) fieldPatch.birthDate = birthDate;
        if (changed.category != null) fieldPatch.category = category;
        if (changed.avatarUrl != null) fieldPatch.avatarUrl = avatarToSave;
        if (Object.keys(fieldPatch).length > 0) {
          await updateFirestoreProfileFields(firebaseUser.uid, fieldPatch);
        }
        fsSaved = {
          ...profile,
        displayName: name,
          handle,
          avatarUrl: avatarToSave || profile.avatarUrl,
          bio: nextBio,
        birthDate,
        category,
        };
      }

      const persisted: SessionUser = {
        ...profile,
        displayName: fsSaved.displayName || name,
        handle: fsSaved.handle || handle,
        avatarUrl: fsSaved.avatarUrl ?? avatarToSave ?? profile.avatarUrl,
        bio: fsSaved.bio ?? nextBio,
        birthDate: fsSaved.birthDate ?? birthDate,
        category: fsSaved.category ?? category,
        coins: profile.coinsBalance,
        coinsBalance: profile.coinsBalance,
        levelXp: profile.levelXp,
        profileUpdatedAtMs: Date.now(),
      };

      const apiPatch: Record<string, string | null> = { ...changed };
      if (apiPatch.username == null) apiPatch.username = handle;
      if (apiPatch.birthDate == null) apiPatch.birthDate = birthDate;
      if (apiPatch.displayName == null) apiPatch.displayName = name;

      try {
        await api('/api/users/profile', {
          method: 'PATCH',
          body: JSON.stringify(apiPatch),
        });
      } catch {
        // Firestore ya es la fuente de verdad; el API es complementario.
      }

      setProfile(persisted);
      setDisplayName(persisted.displayName);
      setUsername(persisted.handle);
      setBio(persisted.bio ?? '');
      setBirthDate(persisted.birthDate ?? '');
      setCategory(persisted.category ?? 'musica');
      setAvatarUrl(persisted.avatarUrl ?? '');
      clearPendingBirth(firebaseUser.uid);
      const firebasePatch: { displayName: string; photoURL?: string } = { displayName: name };
      if (avatarToSave.startsWith('http')) firebasePatch.photoURL = avatarToSave;
      await updateProfile(firebaseUser, firebasePatch).catch(() => undefined);
      setEditing(null);
      setToast(t('settings.profileUpdated'), 'success');
      window.setTimeout(() => setToast(null), 2800);
    } catch (err) {
      setError(mapProfileSaveError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword() {
    if (!profile?.email) return;
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, profile.email);
      setToast(t('settings.passwordEmailSent'), 'success');
      window.setTimeout(() => setToast(null), 3200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo');
    } finally {
      setBusy(false);
    }
  }

  function shareOwnProfile() {
    const handle = profile?.handle?.replace(/^@/, '');
    if (!handle) return;
    const url = `${window.location.origin}/u/${encodeURIComponent(handle)}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
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
            {t('common.signIn')}
          </Link>{' '}
          {t('settings.signInToManage')}
      </div>
    );
  }

  const emailVerified = Boolean(firebaseUser?.emailVerified);

  return (
    <div className="lb-page lb-settings-page mx-auto w-full max-w-5xl space-y-5 pb-2">
      <header>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-zinc-400">{t('settings.subtitle')}</p>
      </header>

      <nav className="lb-settings-tabs" aria-label={t('settings.title')}>
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`lb-settings-tab${active ? ' is-on' : ''}`}
            >
              <Icon size={16} />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      {forceComplete && tab === 'cuenta' ? (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-50">
          {t('settings.completeProfile')}
        </p>
        ) : null}

      {error ? <p className="text-sm text-fuchsia-400">{error}</p> : null}

      {tab === 'cuenta' && profile ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="min-w-0 space-y-4">
            <Card
              title={t('settings.accountInfo')}
              subtitle={t('settings.accountInfoSub')}
            >
              <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start">
                <div className="relative mx-auto shrink-0 lg:mx-0" ref={avatarMenuRef}>
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
                    aria-label={t('settings.changePhoto')}
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
                        {t('settings.gallery')}
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
                        {t('settings.camera')}
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
                    label={t('settings.name')}
                    value={displayName || '—'}
                    editing={editing === 'displayName'}
                    onEdit={() => setEditing('displayName')}
                    onCancel={() => setEditing(null)}
                  >
              <input
                value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={NAME_MAX}
                      className="h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-violet-500"
                    />
                  </InfoRow>

                  <InfoRow
                    label={t('settings.username')}
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
                        maxLength={24}
                        className="h-9 min-w-0 flex-1 bg-transparent pr-3 text-sm text-white outline-none"
                      />
                    </div>
                  </InfoRow>

                  <div className="flex min-w-0 items-start justify-between gap-2 border-b border-white/[0.05] pb-3">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="text-[11px] font-medium text-zinc-500">{t('settings.email')}</p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-white">
                        {profile.email || '—'}
                      </p>
                    </div>
                    {emailVerified ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                        <Check size={12} /> {t('settings.verified')}
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200">
                        {t('settings.pending')}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 border-b border-white/[0.05] pb-3">
                    <p className="text-[11px] font-medium text-zinc-500">{t('settings.birthDate')}</p>
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
                      className="mt-1 h-10 w-full min-w-0 max-w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none [color-scheme:dark] focus:border-violet-500"
                    />
                    {calculatedAge != null ? (
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {t('settings.ageYears', { age: calculatedAge })}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-zinc-500">{t('settings.birthRequired')}</p>
                    )}
                  </div>

                  {editing ? (
                    <button
                      type="button"
                      disabled={busy || avatarBusy || !hasChanges}
                      onClick={() => void save()}
                      className="h-10 w-full rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busy ? t('settings.saving') : t('settings.saveChanges')}
                    </button>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                disabled={busy || avatarBusy || !hasChanges}
                onClick={() => void save()}
                className="mt-4 h-11 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy
                  ? t('settings.saving')
                  : avatarBusy
                    ? t('settings.uploadingPhoto')
                    : t('settings.saveProfile')}
              </button>
            </Card>

            <Card title={t('settings.accountVerification')} subtitle={t('settings.accountVerificationSub')}>
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
                    {emailVerified ? t('settings.accountVerified') : t('settings.verificationPending')}
                  </span>
                  <span className="block text-xs text-zinc-400">
                    {emailVerified
                      ? t('settings.accountVerifiedHint')
                      : t('settings.verificationPendingHint')}
                  </span>
                </span>
                <ChevronRight size={16} className="text-zinc-500" />
              </div>
            </Card>

            <RowLink
              icon={<Lock size={18} />}
              title={t('settings.changePassword')}
              subtitle={t('settings.changePasswordSub')}
              onClick={() => void onChangePassword()}
            />

            <Card title={t('settings.deleteAccount')} subtitle={t('settings.deleteAccountSub')}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-500">
                  {t('settings.deleteAccountHint')}
                </p>
                <DeleteAccount inline />
              </div>
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
          <Card className="h-fit">
            <header className="mb-4 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/20 text-violet-300">
                <Users size={18} />
              </span>
              <div>
                <h2 className="text-base font-bold text-white">{t('settings.referral')}</h2>
                <p className="text-[11px] text-zinc-500">{t('settings.referralSub')}</p>
              </div>
            </header>

            <div className="grid grid-cols-2 gap-2">
              <div className="lb-settings-stat rounded-xl p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  {t('settings.yourReferrals')}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-white">
                  <Users size={16} className="text-violet-400" /> 0
                </p>
              </div>
              <div className="lb-settings-stat rounded-xl p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  {t('settings.coinsEarned')}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-white">
                  <span className="text-amber-400">●</span> 0
                </p>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold text-white">{t('settings.howItWorks')}</p>
              <ol className="mt-3 space-y-3">
                {[
                  t('settings.inviteFriends'),
                  t('settings.theySignUp'),
                  t('settings.bothEarn'),
                ].map((step, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-zinc-300">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold text-white">{t('settings.yourReferralLink')}</p>
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
                  {copied ? t('settings.copied') : t('settings.copy')}
                </button>
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold text-white">{t('settings.shareLink')}</p>
              <div className="flex flex-wrap gap-2">
                <ShareCircle label="WhatsApp" onClick={() => shareReferral('wa')} tone="bg-emerald-500/20 text-emerald-300">
                  <WhatsAppBrandIcon />
                </ShareCircle>
                <ShareCircle label="Instagram" onClick={() => shareReferral('more')} tone="bg-pink-500/20 text-pink-300">
                  <InstagramBrandIcon />
                </ShareCircle>
                <ShareCircle label="Facebook" onClick={() => shareReferral('fb')} tone="bg-blue-500/20 text-blue-300">
                  <FacebookBrandIcon />
                </ShareCircle>
                <ShareCircle label="X" onClick={() => shareReferral('x')} tone="bg-zinc-500/30 text-zinc-200">
                  <XBrandIcon />
                </ShareCircle>
                <ShareCircle label={t('settings.more')} onClick={() => shareReferral('more')} tone="bg-white/10 text-zinc-300">
                  <MoreHorizontal size={16} />
                </ShareCircle>
              </div>
            </div>

            <button
              type="button"
              className="mt-5 flex w-full items-center justify-center gap-1 text-sm font-semibold text-violet-300 hover:underline"
            >
              {t('settings.viewMyReferrals')} <ChevronRight size={14} />
            </button>
          </Card>
          <RowLink
            icon={<Share2 size={18} />}
            title={t('actions.shareProfile')}
            subtitle={t('settings.shareProfileSub')}
            onClick={() => shareOwnProfile()}
          />
          <RowLink
            icon={<LogOut size={18} />}
            title={t('settings.logOut')}
            subtitle={t('settings.logOutSub')}
            onClick={() => void logout()}
          />
          <LanguageControl variant="row" />
          </div>
        </div>
      ) : null}

      {tab === 'privacidad' ? (
        <div className="space-y-4">
          <Card title={t('settings.privacyTitle')} subtitle={t('settings.privacySub')}>
            <div className="space-y-3">
              <ToggleRow
                title={t('settings.morePrivate')}
                subtitle={t('settings.morePrivateSub')}
                checked={privateProfile}
                onChange={setPrivateProfile}
              />
              <RowLink
                icon={<Lock size={18} />}
                title={t('settings.changePassword')}
                subtitle={t('settings.changePasswordMail')}
                onClick={() => void onChangePassword()}
              />
              <RowLink
                icon={<Shield size={18} />}
                title={t('settings.sessionsDevices')}
                subtitle={t('settings.sessionsDevicesSub')}
                to="/legal/privacidad"
              />
            </div>
          </Card>
          <Card title={t('settings.callsTitle')} subtitle={t('settings.callsSub')}>
            <CallSettingsPanel />
          </Card>
        </div>
      ) : null}

      {tab === 'notificaciones' ? (
        <Card title={t('settings.notificationsTitle')} subtitle={t('settings.notificationsSub')}>
          <div className="space-y-3">
            <ToggleRow
              title={t('settings.notifyFriendsLive')}
              subtitle={t('settings.notifyFriendsLiveSub')}
              checked={notifyLive}
              onChange={setNotifyLive}
            />
            <ToggleRow
              title={t('settings.notifyPrivateMessages')}
              subtitle={t('settings.notifyPrivateMessagesSub')}
              checked={notifyMsg}
              onChange={setNotifyMsg}
            />
            <ToggleRow
              title={t('settings.notifyGiftsActivity')}
              subtitle={t('settings.notifyGiftsActivitySub')}
              checked={notifyGifts}
              onChange={setNotifyGifts}
            />
          </div>
        </Card>
      ) : null}

      {tab === 'idioma' ? (
        <Card title={t('language.title')} subtitle={t('language.subtitle')}>
          <LanguageSelector />
        </Card>
      ) : null}

      {tab === 'preferencias' && profile ? (
        <div className="space-y-4">
          <Card title={t('settings.preferencesTitle')} subtitle={t('settings.preferencesSub')}>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
            <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-zinc-300">{t('settings.bio')}</span>
              <textarea
                value={bio}
                  onChange={(e) => setBio(e.target.value)}
                rows={4}
                maxLength={280}
                  className="min-h-[100px] w-full resize-none rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-zinc-300">{t('settings.mainCategory')}</span>
              <select
                value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none [color-scheme:dark] focus:border-violet-500"
              >
                {LIVE_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                      {item.emoji} {t(categoryMessageKey(item.id))}
                  </option>
                ))}
              </select>
            </label>
              <button
                type="submit"
                disabled={busy || avatarBusy || !hasChanges}
                className="h-11 w-full rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? t('settings.saving') : t('settings.savePreferences')}
              </button>
            </form>
          </Card>
          <MyReelsPanel username={profile.handle} />
        </div>
      ) : null}

      {tab === 'billetera' && profile ? (
        <Card title={t('settings.tabWallet')} subtitle={t('settings.walletSub')}>
          <p className="text-3xl font-bold text-cyan-300">
            {profile.coinsBalance.toLocaleString(bcp47For(t.locale))}{' '}
            <span className="text-base font-semibold text-zinc-400">coins</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/billetera"
              className="inline-flex h-11 items-center rounded-xl bg-violet-600 px-4 text-sm font-bold text-white"
            >
              {t('settings.openWallet')}
            </Link>
            <Link
              to="/billetera"
              className="inline-flex h-11 items-center rounded-xl border border-emerald-500/40 px-4 text-sm font-bold text-emerald-300"
            >
              {t('nav.withdraw')}
            </Link>
          </div>
        </Card>
      ) : null}

      {profile ? (
        <p className="text-center text-xs text-zinc-600">
          <Link to={`/u/${encodeURIComponent(profile.handle)}`} className="text-cyan-400 hover:underline">
            {t('settings.viewPublicProfile')}
          </Link>
          {showSuperAdminLink ? (
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
  const t = useT();
  return (
    <div className="min-w-0 border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-[11px] font-medium text-zinc-500">{label}</p>
          {editing ? <div className="mt-1 min-w-0">{children}</div> : (
            <p className="mt-0.5 truncate text-sm font-semibold text-white">{value}</p>
          )}
          </div>
        {editing ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300"
          >
            {t('common.cancel')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            {t('common.edit')}
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

function WhatsAppBrandIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.55 2 2.08 6.45 2.08 11.94c0 1.78.46 3.45 1.28 4.9L2 22l5.31-1.39a10 10 0 0 0 4.73 1.2h.01c5.49 0 9.96-4.45 9.96-9.94 0-2.66-1.04-5.16-2.96-7.0zm-7.01 15.29h-.01a8.26 8.26 0 0 1-4.21-1.15l-.3-.18-3.15.82.84-3.07-.2-.32a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.26-8.23 2.2 0 4.28.86 5.84 2.42a8.18 8.18 0 0 1 2.42 5.83c0 4.54-3.7 8.26-8.23 8.26zm4.52-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74 1.76.76 2.18.83 2.96.7.45-.08 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.10-.23-.17-.48-.29z" />
    </svg>
  );
}

function InstagramBrandIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </svg>
  );
}

function FacebookBrandIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14C17.17 2.05 15.92 2 14.89 2 11.95 2 10 3.79 10 7.15V9.5H7.5v4H10V22h4z" />
    </svg>
  );
}

function XBrandIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.24 2H21l-6.51 7.44L22 22h-6.17l-4.83-6.31L5.7 22H3l6.97-7.96L2 2h6.32l4.36 5.77L18.24 2zm-1.08 18.1h1.7L6.93 3.81H5.1l12.06 16.29z" />
    </svg>
  );
}

/** Botón rojo del mockup + diálogo de confirmación existente. */
function DeleteAccount({ inline = false }: { inline?: boolean }) {
  const t = useT();
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
          <Trash2 size={15} /> {t('settings.deleteMyAccount')}
        </button>
      ) : (
        <div className="min-w-[14rem]">
          <DeleteAccountSection />
        </div>
      )}
    </div>
  );
}
