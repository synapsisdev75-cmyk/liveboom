import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { postAuthSync, type SessionUser } from '../lib/api';
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
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (name: string, email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  logout: () => Promise<void>;
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
    return 'localhost no está autorizado en Firebase Auth. Añádelo en Authentication > Settings.';
  }
  return error instanceof Error ? error.message : 'No se pudo autenticar.';
}

async function syncWithBackend(user: FirebaseUser) {
  const token = await user.getIdToken();
  return postAuthSync(token);
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

  signInEmail: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const token = await cred.user.getIdToken();
      const profile = await postAuthSync(token);
      set({ firebaseUser: cred.user, profile });
    } catch (error) {
      set({ error: mapAuthError(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  signUpEmail: async (name, email, password) => {
    set({ busy: true, error: null });
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      const token = await cred.user.getIdToken(true);
      const profile = await postAuthSync(token);
      set({ firebaseUser: cred.user, profile });
    } catch (error) {
      set({ error: mapAuthError(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  signInGoogle: async () => {
    set({ busy: true, error: null });
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const token = await cred.user.getIdToken();
      const profile = await postAuthSync(token);
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
}));
