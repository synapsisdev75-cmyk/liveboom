import { updateProfile } from 'firebase/auth';
import { Camera } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, mapPostgresUser, type SessionUser } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';

const fieldClass =
  'h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

type ProfilePayload = {
  id: string;
  firebaseUid: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  birthDate: string | null;
  coinsBalance: number;
  createdAt: string;
  updatedAt: string;
};

function adultCutoffDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
}

function ageFrom(isoDate: string) {
  const birth = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

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

  const [username, setUsername] = useState(profile?.handle ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxBirthDate = useMemo(() => adultCutoffDate(), []);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.handle);
    setBio(profile.bio ?? '');
    setBirthDate(profile.birthDate ?? '');
    setAvatarUrl(profile.avatarUrl ?? '');
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    void api<ProfilePayload>('/api/users/profile')
      .then((user) => {
        const next: SessionUser = mapPostgresUser(user);
        setProfile({ ...next, coins: profile.coins, coinsBalance: profile.coinsBalance });
        setUsername(user.username);
        setBio(user.bio ?? '');
        setBirthDate(user.birthDate ?? '');
        setAvatarUrl(user.avatarUrl ?? '');
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
    setError(null);

    if (!avatarUrl.trim()) {
      setError('Agrega una imagen o URL de avatar.');
      return;
    }
    if (!USERNAME_RE.test(handle)) {
      setError('El usuario debe tener 3-20 caracteres (a-z, 0-9, _).');
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
    const age = ageFrom(birthDate);
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
          bio: bio.trim(),
          avatarUrl: avatarUrl.trim(),
          birthDate,
        }),
      });
      const next = mapPostgresUser(updated);
      setProfile({ ...next, coins: profile.coinsBalance, coinsBalance: profile.coinsBalance });
      const firebasePatch: { displayName: string; photoURL?: string } = { displayName: handle };
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
      <form onSubmit={(event) => void save(event)} className="rounded-xl bg-zinc-900 p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Cuenta</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Editar perfil</h1>
        <p className="mt-1 text-sm text-zinc-400">Estos datos se guardan en PostgreSQL.</p>

        {profile ? (
          <div className="mt-8 grid gap-5">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-zinc-950 ring-2 ring-cyan-500/40">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-zinc-600">
                    <Camera size={22} />
                  </span>
                )}
              </div>
              <label className="grid min-w-0 flex-1 gap-1.5 text-sm">
                <span className="font-medium text-zinc-300">Avatar</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void onPickAvatar(event.target.files?.[0])}
                  className="text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-zinc-950"
                />
                <input
                  value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  placeholder="https://tu-avatar.jpg"
                  className={fieldClass}
                />
              </label>
            </div>

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
              <span className="font-medium text-zinc-300">Fecha de nacimiento</span>
              <input
                type="date"
                value={birthDate}
                max={maxBirthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                className={`${fieldClass} [color-scheme:dark] accent-cyan-500`}
              />
              <span className="text-xs text-zinc-500">Debes ser mayor de 18 años.</span>
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
              'Firebase autenticó, pero falta sincronizar PostgreSQL.'
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
    </div>
  );
}
