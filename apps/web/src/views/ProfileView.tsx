import { updateProfile } from 'firebase/auth';
import { Camera } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MyReelsPanel } from '../components/feed/MyReelsPanel';
import { DeleteAccountSection } from '../components/account/DeleteAccountSection';
import { api, mapPostgresUser, type SessionUser } from '../lib/api';
import {
  adultCutoffDate,
  ageFromIsoDate,
  clearPendingBirth,
  readPendingBirthDate,
} from '../lib/birthDate';
import { LIVE_CATEGORIES } from '../lib/categories';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';

const fieldClass =
  'h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

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

function cropToAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
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

export function ProfileView() {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const setToast = useUiStore((state) => state.setToast);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [username, setUsername] = useState(profile?.handle ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '');
  const [category, setCategory] = useState(profile?.category ?? 'musica');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxBirthDate = useMemo(() => adultCutoffDate(), []);
  const calculatedAge = useMemo(() => (birthDate ? ageFromIsoDate(birthDate) : null), [birthDate]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setUsername(profile.handle);
    setBio(profile.bio ?? '');
    setBirthDate(profile.birthDate ?? '');
    setCategory(profile.category ?? 'musica');
    setAvatarUrl(profile.avatarUrl ?? '');
  }, [profile]);

  useEffect(() => {
    if (!firebaseUser) return;
    if (firebaseUser.displayName && !displayName) {
      setDisplayName(firebaseUser.displayName);
    }
    if (firebaseUser.photoURL && !avatarUrl) {
      setAvatarUrl(firebaseUser.photoURL);
    }
    const pending = readPendingBirthDate(firebaseUser.uid);
    if (pending && !birthDate) {
      setBirthDate(pending);
    }
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (!profile) return;
    void api<ProfilePayload>('/api/users/profile')
      .then((user) => {
        const next: SessionUser = mapPostgresUser(user);
        setProfile({ ...next, coins: profile.coins, coinsBalance: profile.coinsBalance });
        setDisplayName(user.displayName || user.username);
        setUsername(user.username);
        setBio(user.bio ?? '');
        setBirthDate(user.birthDate ?? readPendingBirthDate(profile.firebaseUid) ?? '');
        setCategory(user.category ?? 'musica');
        setAvatarUrl(user.avatarUrl ?? firebaseUser?.photoURL ?? '');
      })
      .catch(() => undefined);
  }, [profile?.firebaseUid, setProfile]);

  async function onPickAvatar(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await cropToAvatar(file);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la imagen');
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!firebaseUser || !profile) return;

    const handle = username.trim().replace(/^@/, '').toLowerCase();
    const name = displayName.trim();
    setError(null);

    if (!name) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!avatarUrl.trim()) {
      setError('Agrega una foto de perfil.');
      return;
    }
    if (!USERNAME_RE.test(handle)) {
      setError('El usuario debe tener 3-24 caracteres (a-z, 0-9, _).');
      return;
    }
    if (!bio.trim()) {
      setError('La biografía es obligatoria.');
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
      const updated = await api<ProfilePayload>('/api/users/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          username: handle,
          displayName: name,
          bio: bio.trim(),
          avatarUrl: avatarUrl.trim(),
          birthDate,
          category,
        }),
      });
      const next = mapPostgresUser(updated);
      setProfile({ ...next, coins: profile.coinsBalance, coinsBalance: profile.coinsBalance });
      clearPendingBirth(firebaseUser.uid);
      const firebasePatch: { displayName: string; photoURL?: string } = { displayName: name };
      if (updated.avatarUrl?.startsWith('http')) {
        firebasePatch.photoURL = updated.avatarUrl;
      }
      await updateProfile(firebaseUser, firebasePatch).catch(() => undefined);
      setToast('Perfil guardado correctamente.', 'success');
      window.setTimeout(() => setToast(null), 2800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el perfil');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <form onSubmit={(event) => void save(event)} className="rounded-xl bg-zinc-900 p-4 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Cuenta</p>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Editar perfil</h1>
        {profile ? (
          <Link
            to={`/u/${encodeURIComponent(profile.handle)}`}
            className="mt-3 inline-block text-sm font-semibold text-cyan-400 hover:underline"
          >
            ← Volver a mi perfil
          </Link>
        ) : null}

        {profile ? (
          <div className="mt-6 grid gap-5 sm:mt-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative mx-auto h-20 w-20 shrink-0 overflow-hidden rounded-full bg-zinc-950 ring-2 ring-cyan-500/40 sm:mx-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-zinc-600">
                    <Camera size={22} />
                  </span>
                )}
              </div>
              <label className="grid min-w-0 flex-1 gap-1.5 text-sm">
                <span className="font-medium text-zinc-300">Foto de perfil</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void onPickAvatar(event.target.files?.[0])}
                  className="text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-zinc-950"
                />
              </label>
            </div>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-zinc-300">Nombre</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Tu nombre público"
                className={fieldClass}
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-zinc-300">Nombre de usuario</span>
              <div className="flex overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500">
                <span className="grid place-items-center px-3 text-cyan-400">@</span>
                <input
                  value={username.replace(/^@/, '')}
                  onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))}
                  placeholder="username"
                  className="h-11 flex-1 bg-transparent pr-3 text-sm text-white outline-none"
                />
              </div>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-zinc-300">Biografía</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={4}
                maxLength={280}
                placeholder="Cuéntale a tus viewers quién eres"
                className="min-h-[108px] w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-zinc-300">Categoría principal</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className={`${fieldClass} [color-scheme:dark]`}
              >
                {LIVE_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.emoji} {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-zinc-300">Fecha de nacimiento</span>
              <input
                type="date"
                value={birthDate}
                max={maxBirthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                className={`${fieldClass} [color-scheme:dark] accent-cyan-500`}
              />
              {calculatedAge != null ? (
                <span className="text-xs text-cyan-400">Edad: {calculatedAge} años</span>
              ) : (
                <span className="text-xs text-zinc-500">Debes ser mayor de 18 años.</span>
              )}
            </label>

            {error ? <p className="text-sm text-fuchsia-400">{error}</p> : null}

            <button
              type="submit"
              disabled={busy}
              className="h-11 rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-sm font-bold text-zinc-950 disabled:opacity-60"
            >
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-400">
            {firebaseUser ? (
              'Completa tu perfil para empezar a transmitir.'
            ) : (
              <>
                <Link to="/login" className="text-cyan-400 underline">
                  Inicia sesión
                </Link>{' '}
                para editar tu perfil.
              </>
            )}
          </p>
        )}
      </form>
      {profile ? <MyReelsPanel username={profile.handle} /> : null}
      {profile ? <DeleteAccountSection /> : null}
    </div>
  );
}
