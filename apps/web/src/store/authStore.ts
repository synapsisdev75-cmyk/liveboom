import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { api, getApiBase, postAuthSync, mapPostgresUser, type SessionUser } from '../lib/api';
import { ensureFirestoreProfile, fetchFirestoreProfile, updateFirestoreProfileFields } from '../lib/profileFirestore';
import { readPendingBirthDate, storePendingBirthYear } from '../lib/birthDate';
import { disconnectSocket } from '../lib/socket';

type AuthState = {
  ready: boolean;
  firebaseUser: FirebaseUser | null;
  profile: SessionUser | null;
  error: string | null;
  busy: boolean;
  hydrate: () => () => void;
  syncProfile: () => Promise<void>;
  setCoins: (coins: number) => void;
  setProfile: (profile: SessionUser) => void;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (name: string, email: string, password: string, birthYear: number) => Promise<void>;
  signInGoogle: (birthYear?: number) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

function mapAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('email-already-in-use')) return 'Ese correo ya tiene una cuenta.';
  if (code.includes('invalid-credential') || code.includes('wrong-password')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (code.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (code.includes('popup-closed')) return 'Se cerró la ventana de Google.';
  if (code.includes('unauthorized-domain')) {
    return 'Este dominio no está autorizado en Firebase Auth.';
  }
  if (code.includes('permission-denied') || /insufficient permissions/i.test(String((error as Error)?.message || ''))) {
    return 'Firebase bloqueó el acceso. Cierra sesión, vuelve a entrar o espera unos segundos e intenta de nuevo.';
  }
  return error instanceof Error ? error.message : 'No se pudo autenticar.';
}

async function syncWithBackend(user: FirebaseUser) {
  const apiBase = getApiBase();
  const email = user.email ?? `${user.uid}@users.liveboom.local`;
  const googlePhoto = String(user.photoURL || '').trim() || null;
  const pendingBirth = readPendingBirthDate(user.uid);

  try {
    let fsProfile =
      (await fetchFirestoreProfile(user.uid)) ??
      (await ensureFirestoreProfile({
        uid: user.uid,
        email,
        displayName: user.displayName,
        photoURL: googlePhoto,
      }));

    if (fsProfile) {
      // Si el doc ya existía sin foto, ensureFirestoreProfile la rellena; relee por si acaso.
      if (!fsProfile.avatarUrl && googlePhoto) {
        fsProfile =
          (await ensureFirestoreProfile({
            uid: user.uid,
            email,
            displayName: user.displayName,
            photoURL: googlePhoto,
          })) ?? fsProfile;
      }

      // Fecha pendiente del registro → guardar en Firestore si aún no hay birthDate
      if (!fsProfile.birthDate && pendingBirth) {
        await updateFirestoreProfileFields(user.uid, { birthDate: pendingBirth }).catch(() => undefined);
        fsProfile = { ...fsProfile, birthDate: pendingBirth };
      }

      // Preferir foto de Google en sesión si Firestore no tiene avatar
      if (!fsProfile.avatarUrl && googlePhoto) {
        fsProfile = { ...fsProfile, avatarUrl: googlePhoto };
      }

      try {
        const token = await user.getIdToken();
        await postAuthSync(token);
        const response = await fetch(`${apiBase}/api/users/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const data = (await response.json().catch(() => ({}))) as Parameters<
          typeof mapPostgresUser
        >[0];
        if (response.ok && data.coinsBalance != null) {
          return {
            ...fsProfile,
            coins: data.coinsBalance,
            coinsBalance: data.coinsBalance,
            avatarUrl: fsProfile.avatarUrl || data.avatarUrl || googlePhoto,
            birthDate: fsProfile.birthDate || data.birthDate || pendingBirth,
          };
        }
      } catch {
        // coins opcionales desde API
      }
      return fsProfile;
    }
  } catch {
    // fallback al API si Firestore no responde
  }

  try {
    const token = await user.getIdToken();
    const synced = await postAuthSync(token);
    try {
      const response = await fetch(`${apiBase}/api/users/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = (await response.json().catch(() => ({}))) as Parameters<
        typeof mapPostgresUser
      >[0];
      if (response.ok && data.id && data.firebaseUid && data.username) {
        const mapped = mapPostgresUser(data);
        return {
          ...mapped,
          avatarUrl: mapped.avatarUrl || googlePhoto,
          birthDate: mapped.birthDate || pendingBirth,
        };
      }
    } catch {
      // perfil completo opcional tras sync
    }
    return {
      ...synced,
      avatarUrl: synced.avatarUrl || googlePhoto,
      birthDate: synced.birthDate || pendingBirth,
    };
  } catch {
    return profileFromFirebase(user, pendingBirth);
  }
}

function profileFromFirebase(user: FirebaseUser, pendingBirth?: string | null): SessionUser {
  const handle = user.email?.split('@')[0] ?? user.uid.slice(0, 8);
  return {
    id: user.uid,
    firebaseUid: user.uid,
    email: user.email ?? `${user.uid}@users.liveboom.local`,
    displayName: user.displayName ?? handle,
    handle,
    avatarUrl: user.photoURL,
    bio: null,
    birthDate: pendingBirth ?? null,
    category: null,
    coins: 0,
    coinsBalance: 0,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  firebaseUser: null,
  profile: null,
  error: null,
  busy: false,

  hydrate: () =>
    onAuthStateChanged(auth, (user) => {
      void (async () => {
        if (!user) {
          set({ firebaseUser: null, profile: null, ready: true });
          return;
        }
        try {
          const profile = await syncWithBackend(user);
          set({ firebaseUser: user, profile, ready: true, error: null });
        } catch (error) {
          set({ firebaseUser: user, ready: true, error: mapAuthError(error) });
        }
      })();
    }),

  syncProfile: async () => {
    const user = auth.currentUser;
    if (!user) return;
    const profile = await syncWithBackend(user);
    set({ profile });
  },

  setCoins: (coins) => {
    const profile = get().profile;
    if (!profile) return;
    set({ profile: { ...profile, coins, coinsBalance: coins } });
  },

  setProfile: (profile) => set({ profile }),

  signInEmail: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const profile = await syncWithBackend(cred.user);
      set({ firebaseUser: cred.user, profile });
    } catch (error) {
      set({ error: mapAuthError(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  signUpEmail: async (name, email, password, birthYear) => {
    set({ busy: true, error: null });
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      storePendingBirthYear(cred.user.uid, birthYear);
      const profile = await syncWithBackend(cred.user);
      set({ firebaseUser: cred.user, profile });
    } catch (error) {
      set({ error: mapAuthError(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  signInGoogle: async (birthYear) => {
    set({ busy: true, error: null });
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (birthYear && Number.isFinite(birthYear)) {
        storePendingBirthYear(cred.user.uid, birthYear);
      }
      const profile = await syncWithBackend(cred.user);
      set({ firebaseUser: cred.user, profile });
    } catch (error) {
      set({ error: mapAuthError(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  logout: async () => {
    disconnectSocket();
    await signOut(auth);
    set({ firebaseUser: null, profile: null });
  },

  deleteAccount: async () => {
    set({ busy: true, error: null });
    try {
      await api('/api/users/account', { method: 'DELETE' });
      const user = auth.currentUser;
      if (user) {
        try {
          await deleteUser(user);
        } catch {
          // puede requerir reautenticación; los datos del servidor ya se borraron
        }
      }
      disconnectSocket();
      await signOut(auth);
      set({ firebaseUser: null, profile: null });
    } catch (error) {
      set({ error: mapAuthError(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },
}));
