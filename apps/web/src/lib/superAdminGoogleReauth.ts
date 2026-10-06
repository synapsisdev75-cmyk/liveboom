import {
  GoogleAuthProvider,
  getRedirectResult,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
} from 'firebase/auth';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { auth } from './firebase';
import { normalizeEmail } from './superAdmin';

type NativeGoogleAuthPlugin = {
  signInWithGoogle: (options?: {
    useCredentialManager?: boolean;
  }) => Promise<{ credential?: { idToken?: string | null } | null }>;
};

const FirebaseAuthentication = registerPlugin<NativeGoogleAuthPlugin>('FirebaseAuthentication');

const REDIRECT_PENDING_KEY = 'lb.superAdminVaultRedirect.v1';

type ExpectedSuperAdmin = {
  expectedUid: string;
  expectedEmail: string;
};

/** Ventana de Google bloqueada o cerrada: no es credencial incorrecta, no cuenta como intento fallido. */
const CANCEL_CODES = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/redirect-cancelled-by-user',
  'auth/user-cancelled',
]);

/** Navegadores sin ventanas emergentes (WebView embebido, algunos móviles): pasar a redirección. */
const POPUP_UNAVAILABLE_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
]);

function errorCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code || '') : '';
}

export function isGoogleReauthCancel(err: unknown): boolean {
  return CANCEL_CODES.has(errorCode(err));
}

export function googleReauthErrorMessage(err: unknown): string {
  const code = errorCode(err);
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Cerraste la ventana de Google antes de terminar. Intenta de nuevo.';
  }
  if (code === 'auth/popup-blocked') {
    return 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes e intenta de nuevo.';
  }
  if (code === 'auth/redirect-cancelled-by-user' || code === 'auth/user-cancelled') {
    return 'Cancelaste la confirmación con Google.';
  }
  if (code === 'auth/user-mismatch') {
    return 'Debes confirmar exactamente la misma cuenta Google del Super Admin.';
  }
  return err instanceof Error ? err.message : 'No se pudo abrir con Google';
}

function buildProvider(expectedEmail: string) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'login',
    login_hint: normalizeEmail(expectedEmail),
  });
  provider.addScope('email');
  provider.addScope('profile');
  return provider;
}

async function assertFreshSuperAdmin(input: ExpectedSuperAdmin): Promise<{ authTimeMs: number }> {
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

/**
 * Apertura real de bóveda: Google vuelve a pedir cuenta/contraseña (login).
 * Debe coincidir el mismo UID + email del Super Admin actual.
 * Si el navegador no permite ventanas emergentes, sale a Google por redirección y la
 * página termina la apertura al volver (`completeSuperAdminRedirectReauth`).
 */
export async function reauthenticateSuperAdminWithGoogle(
  input: ExpectedSuperAdmin,
): Promise<{ authTimeMs: number }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No hay sesión de Google/Firebase activa.');
  }
  if (user.uid !== input.expectedUid) {
    throw new Error('La sesión actual no coincide con el Super Admin.');
  }

  const provider = buildProvider(input.expectedEmail);

  if (Capacitor.isNativePlatform()) {
    const native = await FirebaseAuthentication.signInWithGoogle().catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error || '');
      if (!/credential\s*manager|GetCredentialUnsupported/i.test(msg)) throw error;
      return FirebaseAuthentication.signInWithGoogle({ useCredentialManager: false });
    });
    const idToken = String(native.credential?.idToken || '').trim();
    if (!idToken) {
      throw new Error(
        'Google no devolvió token. Revisa SHA-1/SHA-256 y el cliente OAuth de la app.',
      );
    }
    const credential = GoogleAuthProvider.credential(idToken);
    await reauthenticateWithCredential(user, credential);
  } else {
    try {
      await reauthenticateWithPopup(user, provider);
    } catch (err) {
      if (!POPUP_UNAVAILABLE_CODES.has(errorCode(err))) throw err;
      sessionStorage.setItem(
        REDIRECT_PENDING_KEY,
        JSON.stringify({ uid: input.expectedUid, at: Date.now() }),
      );
      await reauthenticateWithRedirect(user, provider);
    }
  }

  return assertFreshSuperAdmin(input);
}

/** Al volver de Google por redirección: valida la cuenta y devuelve null si no había apertura pendiente. */
export async function completeSuperAdminRedirectReauth(
  input: ExpectedSuperAdmin,
): Promise<{ authTimeMs: number } | null> {
  const raw = sessionStorage.getItem(REDIRECT_PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(REDIRECT_PENDING_KEY);
  let pending: { uid?: string; at?: number } = {};
  try {
    pending = JSON.parse(raw) as { uid?: string; at?: number };
  } catch {
    return null;
  }
  if (pending.uid !== input.expectedUid || Date.now() - Number(pending.at || 0) > 10 * 60_000) {
    return null;
  }
  const result = await getRedirectResult(auth);
  if (!result) return null;
  return assertFreshSuperAdmin(input);
}
