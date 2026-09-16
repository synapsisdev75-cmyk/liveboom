import {
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { auth } from './firebase';
import { normalizeEmail } from './superAdmin';

type NativeGoogleAuthPlugin = {
  signInWithGoogle: () => Promise<{ credential?: { idToken?: string | null } | null }>;
};

const FirebaseAuthentication = registerPlugin<NativeGoogleAuthPlugin>('FirebaseAuthentication');

/**
 * Apertura real de bóveda: Google vuelve a pedir cuenta/contraseña (login).
 * Debe coincidir el mismo UID + email del Super Admin actual.
 */
export async function reauthenticateSuperAdminWithGoogle(input: {
  expectedUid: string;
  expectedEmail: string;
}): Promise<{ authTimeMs: number }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No hay sesión de Google/Firebase activa.');
  }
  if (user.uid !== input.expectedUid) {
    throw new Error('La sesión actual no coincide con el Super Admin.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'login',
    login_hint: normalizeEmail(input.expectedEmail),
  });
  provider.addScope('email');
  provider.addScope('profile');

  if (Capacitor.isNativePlatform()) {
    const native = await FirebaseAuthentication.signInWithGoogle();
    const idToken = String(native.credential?.idToken || '').trim();
    if (!idToken) {
      throw new Error(
        'Google no devolvió token. Revisa SHA-1/SHA-256 y el cliente OAuth de la app.',
      );
    }
    const credential = GoogleAuthProvider.credential(idToken);
    await reauthenticateWithCredential(user, credential);
  } else {
    await reauthenticateWithPopup(user, provider);
  }

  const fresh = auth.currentUser;
  if (!fresh || fresh.uid !== input.expectedUid) {
    throw new Error('La reautenticación de Google no coincide con tu cuenta.');
  }
  const email = normalizeEmail(fresh.email);
  if (!email || email !== normalizeEmail(input.expectedEmail)) {
    throw new Error('Debes confirmar exactamente la misma cuenta Google del Super Admin.');
  }

  const token = await fresh.getIdTokenResult(true);
  const authTimeMs = Date.parse(token.authTime);
  if (!Number.isFinite(authTimeMs) || Date.now() - authTimeMs > 5 * 60_000) {
    throw new Error('La autenticación de Google no es reciente. Intenta de nuevo.');
  }

  return { authTimeMs };
}
