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
  Palette,
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
  | 'apariencia'
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

const TABS: Array<{ id: SettingsTab; labelKey: 'settings.tabAccount' | 'settings.tabPrivacy' | 'settings.tabNotifications' | 'settings.tabPreferences' | 'settings.tabWallet' | 'settings.tabAppearance' | 'settings.tabLanguage'; icon: typeof User }> = [
  { id: 'cuenta', labelKey: 'settings.tabAccount', icon: User },
  { id: 'privacidad', labelKey: 'settings.tabPrivacy', icon: Shield },
  { id: 'notificaciones', labelKey: 'settings.tabNotifications', icon: Bell },
  { id: 'preferencias', labelKey: 'settings.tabPreferences', icon: Eye },
  { id: 'idioma', labelKey: 'settings.tabLanguage', icon: Languages },
  { id: 'billetera', labelKey: 'settings.tabWallet', icon: Wallet },
  { id: 'apariencia', labelKey: 'settings.tabAppearance', icon: Palette },
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

      {tab === 'apariencia' ? (
        <Card title={t('settings.tabAppearance')} subtitle={t('settings.appearanceSub')}>
          <p className="text-sm text-zinc-400">
            {t('settings.appearanceSub')}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {['dark', 'auto', 'light'].map((id, i) => (
              <button
                key={id}
                type="button"
                disabled={i !== 0}
                className={`rounded-xl border px-3 py-4 text-xs font-bold ${
                  i === 0
                    ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                    : 'border-white/10 text-zinc-600'
                }`}
              >
                {id === 'dark' ? t('appearance.dark') : id === 'light' ? t('appearance.light') : t('appearance.mode')}
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
              {t('settings.logOut')}
            </button>
          ) : null}
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
