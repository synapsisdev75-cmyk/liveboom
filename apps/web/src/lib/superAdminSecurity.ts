import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { SUPER_ADMIN_OWNER_EMAIL, normalizeEmail } from './superAdmin';

const SECURITY_PATH = 'config/superAdminSecurity';
const SESSION_COL = 'adminSessions';
const LOCKOUT_COL = 'adminVaultLockouts';
const AUDIT_COL = 'adminAuditLogs';

export const DEFAULT_SESSION_TTL_MIN = 20;
export const DEFAULT_MAX_FAILURES = 5;
export const DEFAULT_LOCKOUT_MIN = 30;
export const IDLE_LOCK_MS = 12 * 60 * 1000;

export type SuperAdminSecurityDoc = {
  configured: boolean;
  salt: string;
  pinHash: string;
  vaultHash: string;
  sessionTtlMin: number;
  maxFailures: number;
  lockoutMinutes: number;
  version: number;
  updatedBy?: string;
};

export type AdminSessionDoc = {
  email: string;
  sessionId: string;
  deviceId: string;
  unlockedAt: Timestamp;
  expiresAt: Timestamp;
  idleDeadlineMs: number;
};

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}

export async function deriveSecretHash(secret: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 120_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return toHex(bits);
}

export function getOrCreateDeviceId(): string {
  const key = 'lb_admin_device_v1';
  try {
    const existing = localStorage.getItem(key);
    if (existing && existing.length >= 16) return existing;
    const next = randomHex(24);
    localStorage.setItem(key, next);
    return next;
  } catch {
    return randomHex(16);
  }
}

export function buildAntiReplayChallenge(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => alphabet[n % alphabet.length]).join('');
}

export async function fetchSuperAdminSecurity(): Promise<SuperAdminSecurityDoc | null> {
  const snap = await getDoc(doc(db, SECURITY_PATH));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    configured: data.configured === true || Boolean(data.pinHash),
    salt: String(data.salt || ''),
    pinHash: String(data.pinHash || ''),
    vaultHash: String(data.vaultHash || ''),
    sessionTtlMin: Math.max(5, Math.min(120, Number(data.sessionTtlMin) || DEFAULT_SESSION_TTL_MIN)),
    maxFailures: Math.max(3, Math.min(20, Number(data.maxFailures) || DEFAULT_MAX_FAILURES)),
    lockoutMinutes: Math.max(5, Math.min(180, Number(data.lockoutMinutes) || DEFAULT_LOCKOUT_MIN)),
    version: Number(data.version) || 1,
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
  };
}

export async function saveSuperAdminSecuritySetup(input: {
  pin: string;
  vaultCode: string;
  sessionTtlMin?: number;
  updatedBy: string;
}): Promise<void> {
  const pin = input.pin.trim();
  const vaultCode = input.vaultCode.trim();
  if (!/^\d{8,12}$/.test(pin)) {
    throw new Error('El PIN debe tener entre 8 y 12 dígitos.');
  }
  if (vaultCode.length < 12) {
    throw new Error('El código de bóveda debe tener al menos 12 caracteres.');
  }
  const salt = randomHex(24);
  const [pinHash, vaultHash] = await Promise.all([
    deriveSecretHash(pin, salt),
    deriveSecretHash(vaultCode, `${salt}:vault`),
  ]);
  await setDoc(
    doc(db, SECURITY_PATH),
    {
      configured: true,
      salt,
      pinHash,
      vaultHash,
      sessionTtlMin: input.sessionTtlMin ?? DEFAULT_SESSION_TTL_MIN,
      maxFailures: DEFAULT_MAX_FAILURES,
      lockoutMinutes: DEFAULT_LOCKOUT_MIN,
      version: 1,
      updatedBy: input.updatedBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getVaultLockout(
  uid: string,
): Promise<{ failures: number; lockedUntilMs: number }> {
  const snap = await getDoc(doc(db, LOCKOUT_COL, uid));
  if (!snap.exists()) return { failures: 0, lockedUntilMs: 0 };
  const data = snap.data() as Record<string, unknown>;
  const lockedUntil = data.lockedUntil;
  const lockedUntilMs =
    lockedUntil && typeof (lockedUntil as Timestamp).toMillis === 'function'
      ? (lockedUntil as Timestamp).toMillis()
      : Number(lockedUntil) || 0;
  return {
    failures: Math.max(0, Number(data.failures) || 0),
    lockedUntilMs,
  };
}

export async function registerVaultFailure(
  uid: string,
  email: string,
  maxFailures: number,
  lockoutMinutes: number,
): Promise<{ failures: number; lockedUntilMs: number }> {
  const current = await getVaultLockout(uid);
  const failures = current.failures + 1;
  const lockedUntilMs =
    failures >= maxFailures ? Date.now() + lockoutMinutes * 60_000 : current.lockedUntilMs;
  await setDoc(
    doc(db, LOCKOUT_COL, uid),
    {
      email: normalizeEmail(email),
      failures,
      lockedUntil: lockedUntilMs > Date.now() ? Timestamp.fromMillis(lockedUntilMs) : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await writeAudit({
    action: 'vault_unlock_failed',
    uid,
    email,
    meta: { failures, locked: lockedUntilMs > Date.now() },
  });
  return { failures, lockedUntilMs };
}

export async function clearVaultLockout(uid: string): Promise<void> {
  await setDoc(
    doc(db, LOCKOUT_COL, uid),
    { failures: 0, lockedUntil: null, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function verifyVaultCredentials(input: {
  pin: string;
  vaultCode: string;
  emailConfirm: string;
  expectedEmail: string;
  challenge: string;
  challengeConfirm: string;
}): Promise<SuperAdminSecurityDoc> {
  if (normalizeEmail(input.emailConfirm) !== normalizeEmail(input.expectedEmail)) {
    throw new Error('El email de confirmación no coincide.');
  }
  if (input.challengeConfirm.trim().toUpperCase() !== input.challenge.trim().toUpperCase()) {
    throw new Error('El código anti-replay no coincide.');
  }
  const security = await fetchSuperAdminSecurity();
  if (!security) {
    throw new Error('La bóveda aún no está configurada por el owner.');
  }
  const [pinHash, vaultHash] = await Promise.all([
    deriveSecretHash(input.pin.trim(), security.salt),
    deriveSecretHash(input.vaultCode.trim(), `${security.salt}:vault`),
  ]);
  // Comparación en tiempo constante aproximada
  const pinOk = timingSafeEqual(pinHash, security.pinHash);
  const vaultOk = timingSafeEqual(vaultHash, security.vaultHash);
  if (!pinOk || !vaultOk) {
    throw new Error('PIN o código de bóveda incorrectos.');
  }
  return security;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function createAdminSession(input: {
  uid: string;
  email: string;
  ttlMin: number;
}): Promise<{ sessionId: string; expiresAtMs: number; deviceId: string }> {
  const sessionId = randomHex(20);
  const deviceId = getOrCreateDeviceId();
  const expiresAtMs = Date.now() + Math.max(5, input.ttlMin) * 60_000;
  await setDoc(doc(db, SESSION_COL, input.uid), {
    email: normalizeEmail(input.email),
    sessionId,
    deviceId,
    unlockedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(expiresAtMs),
    idleDeadlineMs: Date.now() + IDLE_LOCK_MS,
    updatedAt: serverTimestamp(),
  });
  await clearVaultLockout(input.uid);
  await writeAudit({
    action: 'vault_unlocked',
    uid: input.uid,
    email: input.email,
    meta: { sessionId, deviceId, expiresAtMs, method: 'google_reauth' },
  });
  return { sessionId, expiresAtMs, deviceId };
}

export async function refreshAdminSessionIdle(uid: string, ttlMin: number): Promise<number> {
  const expiresAtMs = Date.now() + Math.max(5, ttlMin) * 60_000;
  await setDoc(
    doc(db, SESSION_COL, uid),
    {
      expiresAt: Timestamp.fromMillis(expiresAtMs),
      idleDeadlineMs: Date.now() + IDLE_LOCK_MS,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return expiresAtMs;
}

export async function destroyAdminSession(uid: string, email?: string): Promise<void> {
  try {
    await deleteDoc(doc(db, SESSION_COL, uid));
  } catch {
    /* ignore */
  }
  if (email) {
    await writeAudit({
      action: 'vault_locked',
      uid,
      email,
      meta: {},
    });
  }
}

export async function fetchAdminSession(
  uid: string,
): Promise<(AdminSessionDoc & { expiresAtMs: number }) | null> {
  const snap = await getDoc(doc(db, SESSION_COL, uid));
  if (!snap.exists()) return null;
  const data = snap.data() as AdminSessionDoc;
  const expiresAtMs = data.expiresAt?.toMillis?.() ?? 0;
  if (expiresAtMs <= Date.now()) return null;
  if (data.deviceId && data.deviceId !== getOrCreateDeviceId()) return null;
  return { ...data, expiresAtMs };
}

async function writeAudit(input: {
  action: string;
  uid: string;
  email: string;
  meta: Record<string, unknown>;
}): Promise<void> {
  try {
    await addDoc(collection(db, AUDIT_COL), {
      action: input.action,
      uid: input.uid,
      email: normalizeEmail(input.email),
      meta: input.meta,
      ownerEmail: SUPER_ADMIN_OWNER_EMAIL,
      createdAt: serverTimestamp(),
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : '',
    });
  } catch {
    /* no bloquear flujo por auditoría */
  }
}
