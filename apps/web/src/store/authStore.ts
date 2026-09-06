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
import {
  ensureFirestoreProfile,
  fetchFirestoreProfile,
  listenFirestoreProfile,
  updateFirestoreProfileFields,
} from '../lib/profileFirestore';
import { processGiftInbox } from '../lib/giftsFirestore';
import { readPendingBirthDate, storePendingBirthYear } from '../lib/birthDate';
import { disconnectSocket } from '../lib/socket';

type AuthState = {
  ready: boolean;
  firebaseUser: FirebaseUser | null;
  profile: SessionUser | null;
  error: string | null;
  busy: boolean;
  /** Reloj local del último guardado de perfil (evita snapshots viejos). */
  profileWriteAt: number;
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
        const inboxCoins = await processGiftInbox(user.uid).catch(() => 0);
        if (inboxCoins > 0) {
          fsProfile = (await fetchFirestoreProfile(user.uid)) ?? fsProfile;
        }

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

function applyRemoteProfile(
  prev: SessionUser | null,
  incoming: SessionUser,
  writeAt: number,
): SessionUser {
  if (!prev || prev.firebaseUid !== incoming.firebaseUid) return incoming;
  const snapMs = incoming.profileUpdatedAtMs || 0;
  const localMs = prev.profileUpdatedAtMs || writeAt || 0;
  const staleIdentity = Boolean(localMs) && (!snapMs || snapMs < localMs - 2000);
  if (staleIdentity) {
    return {
      ...prev,
      coins: incoming.coinsBalance,
      coinsBalance: incoming.coinsBalance,
      levelXp: incoming.levelXp ?? prev.levelXp,
    };
  }
  return {
    ...prev,
    displayName: incoming.displayName,
    handle: incoming.handle,
    avatarUrl: incoming.avatarUrl,
    bio: incoming.bio,
    birthDate: incoming.birthDate,
    category: incoming.category,
    coins: incoming.coinsBalance,
    coinsBalance: incoming.coinsBalance,
    levelXp: incoming.levelXp ?? prev.levelXp,
    profileUpdatedAtMs: incoming.profileUpdatedAtMs ?? prev.profileUpdatedAtMs,
  };
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
  profileWriteAt: 0,

  hydrate: () => {
    let unsubDoc: (() => void) | null = null;
    let cancelled = false;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubDoc?.();
      unsubDoc = null;
      void (async () => {
        if (!user) {
          set({ firebaseUser: null, profile: null, ready: true, profileWriteAt: 0 });
          return;
        }
        const sameUser =
          get().firebaseUser?.uid === user.uid && get().profile?.firebaseUid === user.uid;
        if (!sameUser) {
          try {
            const profile = await syncWithBackend(user);
            if (cancelled) return;
            set({ firebaseUser: user, profile, ready: true, error: null });
          } catch (error) {
            if (cancelled) return;
            set({ firebaseUser: user, ready: true, error: mapAuthError(error) });
          }
        } else {
          set({ firebaseUser: user });
        }
        if (cancelled) return;
        unsubDoc = listenFirestoreProfile(user.uid, (incoming) => {
          const current = get().profile;
          set({ profile: applyRemoteProfile(current, incoming, get().profileWriteAt) });
        });
      })();
    });
    return () => {
      cancelled = true;
      unsubDoc?.();
      unsubAuth();
    };
  },

  syncProfile: async () => {
    const user = auth.currentUser;
    if (!user) return;
    const profile = await syncWithBackend(user);
    const prev = get().profile;
    set({ profile: applyRemoteProfile(prev, profile, get().profileWriteAt) });
  },

  setCoins: (coins) => {
    const profile = get().profile;
    if (!profile) return;
    set({ profile: { ...profile, coins, coinsBalance: coins } });
  },

  setProfile: (profile) =>
    set({
      profile: {
        ...profile,
        profileUpdatedAtMs: profile.profileUpdatedAtMs || Date.now(),
      },
      profileWriteAt: Date.now(),
    }),

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
