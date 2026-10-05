import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { auth, googleProvider, microsoftProvider } from '../lib/firebase';
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
import { checkSignupEmail, emailCheckMessage } from '../lib/emailCheck';
import { t } from '../i18n';

type NativeGoogleAuthPlugin = {
  signInWithGoogle: () => Promise<{ credential?: { idToken?: string | null } | null }>;
  signOut: () => Promise<void>;
};

/** Bridge nativo (@capacitor-firebase/authentication). En web no se usa. */
const FirebaseAuthentication = registerPlugin<NativeGoogleAuthPlugin>('FirebaseAuthentication');

type AuthState = {
  ready: boolean;
  firebaseUser: FirebaseUser | null;
  profile: SessionUser | null;
  /** Cuenta de correo nueva con sesión en Firebase pero sin verificar: no entra a la app. */
  pendingVerifyUser: FirebaseUser | null;
  error: string | null;
  busy: boolean;
  /** Reloj local del último guardado de perfil (evita snapshots viejos). */
  profileWriteAt: number;
  hydrate: () => () => void;
  syncProfile: () => Promise<void>;
  setCoins: (coins: number) => void;
  setBlastBalances: (balances: {
    purchasedBlastBalance: number;
    earnedBlastBalance: number;
    coinsBalance?: number;
  }) => void;
  setProfile: (profile: SessionUser) => void;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (name: string, email: string, password: string, birthYear: number) => Promise<void>;
  signInGoogle: (birthYear?: number) => Promise<void>;
  signInMicrosoft: (birthYear?: number) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  /** Recarga el usuario; si ya verificó, abre la sesión y devuelve true. */
  refreshEmailVerification: () => Promise<boolean>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

/** Las cuentas con correo creadas antes de esta fecha siguen entrando sin verificar. */
const EMAIL_VERIFY_REQUIRED_SINCE = Date.parse('2026-10-05T23:00:00Z');

function needsEmailVerification(user: FirebaseUser): boolean {
  if (user.emailVerified) return false;
  if (!user.providerData.some((p) => p.providerId === 'password')) return false;
  const created = Date.parse(user.metadata.creationTime || '');
  return Number.isFinite(created) && created >= EMAIL_VERIFY_REQUIRED_SINCE;
}

async function sendVerification(user: FirebaseUser) {
  const continueUrl =
    typeof window !== 'undefined' && /^https:/.test(window.location.origin) && !Capacitor.isNativePlatform()
      ? `${window.location.origin}/login`
      : null;
  try {
    auth.useDeviceLanguage();
  } catch {
    /* ignore */
  }
  if (continueUrl) {
    try {
      await sendEmailVerification(user, { url: continueUrl });
      return;
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (!/continue-uri|unauthorized/i.test(code)) throw error;
    }
  }
  await sendEmailVerification(user);
}

let activateSession: ((user: FirebaseUser) => void) | null = null;

function mapAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('email-already-in-use')) return t('auth.emailInUse');
  if (code.includes('invalid-email')) return emailCheckMessage('invalid_format');
  if (code.includes('too-many-requests')) return emailCheckMessage('too_many_requests');
  if (code.includes('invalid-credential') || code.includes('wrong-password')) {
    return t('auth.badCredentials');
  }
  if (code.includes('weak-password')) return t('auth.weakPassword');
  if (code.includes('account-exists-with-different-credential')) {
    return 'Ese correo ya tiene una cuenta con otro método (Google o correo y contraseña). Entra con ese método.';
  }
  if (code.includes('operation-not-allowed')) {
    return 'Este método de inicio de sesión aún no está habilitado. Usa Google o correo.';
  }
  if (code.includes('popup-blocked')) {
    return 'El navegador bloqueó la ventana de inicio de sesión. Permite ventanas emergentes e inténtalo de nuevo.';
  }
  if (code.includes('popup-closed')) return t('auth.googleClosed');
  if (code.includes('cancelled') || /cancel/i.test(String((error as Error)?.message || ''))) {
    return t('auth.googleCancelled');
  }
  if (code.includes('unauthorized-domain')) {
    return t('auth.unauthorizedDomain');
  }
  if (code.includes('permission-denied') || /insufficient permissions/i.test(String((error as Error)?.message || ''))) {
    return t('auth.permissionDenied');
  }
  const msg = error instanceof Error ? error.message : '';
  if (/Developer console is not set up correctly|10:\s*\[28444\]|ApiException:\s*10/i.test(msg)) {
    return 'Google Play no reconoce esta app todavía (SHA / OAuth). Revisa google-services.json y los SHA de Play App Signing en Firebase.';
  }
  if (/12501|sign.?in.*canceled|user.*cancel/i.test(msg)) {
    return t('auth.googleCancelled');
  }
  if (/network|timeout|unavailable/i.test(msg)) {
    return 'No hay conexión con Google. Revisa internet e inténtalo de nuevo.';
  }
  return msg || t('auth.authFailed');
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
          // Billetera dual: Firestore es fuente de verdad (comprados/ganados).
          // No pisar earned/purchased con un total opaco del API en memoria.
          return {
            ...fsProfile,
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
      purchasedBlastBalance: incoming.purchasedBlastBalance ?? prev.purchasedBlastBalance,
      earnedBlastBalance: incoming.earnedBlastBalance ?? prev.earnedBlastBalance,
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
    purchasedBlastBalance: incoming.purchasedBlastBalance ?? prev.purchasedBlastBalance,
    earnedBlastBalance: incoming.earnedBlastBalance ?? prev.earnedBlastBalance,
    earnedBlastSpent: incoming.earnedBlastSpent ?? prev.earnedBlastSpent,
    earnedBlastWithdrawn: incoming.earnedBlastWithdrawn ?? prev.earnedBlastWithdrawn,
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
    purchasedBlastBalance: 0,
    earnedBlastBalance: 0,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  firebaseUser: null,
  profile: null,
  pendingVerifyUser: null,
  error: null,
  busy: false,
  profileWriteAt: 0,

  hydrate: () => {
    let unsubDoc: (() => void) | null = null;
    let cancelled = false;
    const activate = (user: FirebaseUser) => {
      unsubDoc?.();
      unsubDoc = null;
      void (async () => {
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
    };
    activateSession = activate;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubDoc?.();
      unsubDoc = null;
      if (!user) {
        set({ firebaseUser: null, profile: null, pendingVerifyUser: null, ready: true, profileWriteAt: 0 });
        return;
      }
      if (needsEmailVerification(user)) {
        set({ firebaseUser: null, profile: null, pendingVerifyUser: user, ready: true });
        return;
      }
      set({ pendingVerifyUser: null });
      activate(user);
    });
    return () => {
      cancelled = true;
      if (activateSession === activate) activateSession = null;
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
    const next = Math.max(0, Math.floor(Number(coins) || 0));
    set({
      profile: {
        ...profile,
        coins: next,
        coinsBalance: next,
      },
    });
  },

  setBlastBalances: (balances) => {
    const profile = get().profile;
    if (!profile) return;
    const purchased = Math.max(0, Math.floor(Number(balances.purchasedBlastBalance) || 0));
    const earned = Math.max(0, Math.floor(Number(balances.earnedBlastBalance) || 0));
    const total =
      balances.coinsBalance != null
        ? Math.max(0, Math.floor(Number(balances.coinsBalance) || 0))
        : purchased + earned;
    set({
      profile: {
        ...profile,
        coins: total,
        coinsBalance: total,
        purchasedBlastBalance: purchased,
        earnedBlastBalance: earned,
      },
    });
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
      if (needsEmailVerification(cred.user)) {
        set({ firebaseUser: null, profile: null, pendingVerifyUser: cred.user });
        return;
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

  signUpEmail: async (name, email, password, birthYear) => {
    set({ busy: true, error: null });
    try {
      const check = await checkSignupEmail(email);
      if (!check.ok) {
        const message = emailCheckMessage(check.reason, check.suggestion);
        set({ error: message });
        throw new Error(message);
      }
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name });
      storePendingBirthYear(cred.user.uid, birthYear);
      set({ firebaseUser: null, profile: null, pendingVerifyUser: cred.user });
      await sendVerification(cred.user).catch((error) => {
        console.warn('[auth] verification email', error);
      });
    } catch (error) {
      if (!get().error) set({ error: mapAuthError(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  signInMicrosoft: async (birthYear) => {
    set({ busy: true, error: null });
    try {
      const cred = await signInWithPopup(auth, microsoftProvider);
      const user = cred.user;
      if (birthYear && Number.isFinite(birthYear)) {
        storePendingBirthYear(user.uid, birthYear);
      }
      const profile = await syncWithBackend(user);
      set({ firebaseUser: user, profile });
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      set({
        error: code.includes('popup-closed') || code.includes('cancelled-popup')
          ? 'Se cerró la ventana de Microsoft.'
          : mapAuthError(error),
      });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  resendVerificationEmail: async () => {
    const user = get().pendingVerifyUser ?? auth.currentUser;
    if (!user) return;
    set({ busy: true, error: null });
    try {
      await sendVerification(user);
    } catch (error) {
      set({ error: mapAuthError(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  refreshEmailVerification: async () => {
    const user = get().pendingVerifyUser ?? auth.currentUser;
    if (!user) return false;
    try {
      await user.reload();
    } catch {
      return false;
    }
    const fresh = auth.currentUser ?? user;
    if (!fresh.emailVerified) return false;
    await fresh.getIdToken(true).catch(() => undefined);
    set({ pendingVerifyUser: null, error: null });
    if (activateSession) {
      activateSession(fresh);
    } else {
      const profile = await syncWithBackend(fresh);
      set({ firebaseUser: fresh, profile, ready: true });
    }
    return true;
  },

  signInGoogle: async (birthYear) => {
    set({ busy: true, error: null });
    try {
      let user: FirebaseUser;
      if (Capacitor.isNativePlatform()) {
        // WebView no soporta signInWithPopup: usamos plugin nativo + credential Firebase.
        const native = await FirebaseAuthentication.signInWithGoogle();
        const idToken = String(native.credential?.idToken || '').trim();
        if (!idToken) {
          throw new Error(
            'Google no devolvió un token. Verifica SHA-1/SHA-256 de la app en Firebase Authentication.',
          );
        }
        const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
        user = cred.user;
      } else {
        const cred = await signInWithPopup(auth, googleProvider);
        user = cred.user;
      }
      if (birthYear && Number.isFinite(birthYear)) {
        storePendingBirthYear(user.uid, birthYear);
      }
      const profile = await syncWithBackend(user);
      set({ firebaseUser: user, profile });
    } catch (error) {
      set({ error: mapAuthError(error) });
      throw error;
    } finally {
      set({ busy: false });
    }
  },

  logout: async () => {
    const uid = auth.currentUser?.uid || null;
    const email = auth.currentUser?.email || null;
    try {
      const { useSuperAdminVaultStore } = await import('./superAdminVaultStore');
      await useSuperAdminVaultStore.getState().lock(uid, email);
    } catch {
      /* ignore */
    }
    disconnectSocket();
    if (Capacitor.isNativePlatform()) {
      try {
        await FirebaseAuthentication.signOut();
      } catch {
        // ignore native sign-out errors
      }
    }
    await signOut(auth);
    set({ firebaseUser: null, profile: null, pendingVerifyUser: null });
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
