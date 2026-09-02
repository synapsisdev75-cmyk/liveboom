import { auth } from './firebase';

function isLocalHost(value: string) {
  return /localhost|127\.0\.0\.1/.test(value);
}

function isVercelHost(value: string) {
  return /vercel\.app/i.test(value);
}

/**
 * URL del API.
 * En www (Firebase Hosting) usa el mismo origen: /api/* lo sirve Cloud Functions.
 * No apunta a Vercel.
 */
export function getApiBase(): string {
  const fromEnv = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const host =
    typeof window !== 'undefined' ? window.location.hostname : '';
  const browsingLocal = host === 'localhost' || host === '127.0.0.1';

  if (browsingLocal) {
    if (fromEnv && !isLocalHost(fromEnv) && !isVercelHost(fromEnv)) {
      return fromEnv;
    }
    if (fromEnv && isLocalHost(fromEnv)) return fromEnv;
    return 'http://localhost:4000';
  }

  if (fromEnv && !isLocalHost(fromEnv) && !isVercelHost(fromEnv)) {
    return fromEnv;
  }
  return '';
}

export class ApiError extends Error {
  readonly status: number;
  readonly data: Record<string, unknown>;
  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function token(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError(401, 'No hay sesión de Firebase');
  }
  return user.getIdToken();
}

export async function api<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const jwt = await token();
  headers.set('Authorization', `Bearer ${jwt}`);

  const { timeoutMs, ...fetchInit } = init;
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      ...fetchInit,
      headers,
      signal: fetchInit.signal ?? AbortSignal.timeout(timeoutMs ?? 12_000),
    });
  } catch {
    throw new ApiError(
      0,
      'No se pudo conectar con el servidor. Revisa tu red o intenta de nuevo.',
    );
  }
  const raw = await response.text();
  const looksHtml = /^\s*</.test(raw) || /text\/html/i.test(response.headers.get('content-type') || '');
  if (looksHtml) {
    throw new ApiError(
      response.status,
      'El API de pagos no está conectado en esta página. En Firebase, /api/payments debe llegar a Cloud Functions.',
    );
  }
  let data: { error?: string; message?: string } & T;
  try {
    data = JSON.parse(raw) as { error?: string; message?: string } & T;
  } catch {
    throw new ApiError(
      response.status,
      raw.trim()
        ? `El API de pagos no respondió JSON (${response.status}).`
        : `El servidor respondió ${response.status} sin JSON`,
    );
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error ?? data.message ?? `Error ${response.status}`,
      data as Record<string, unknown>,
    );
  }
  return data;
}

export async function apiPublic<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`);
  } catch {
    throw new ApiError(
      0,
      'No se pudo conectar con el servidor. Revisa tu red o intenta de nuevo.',
    );
  }
  const raw = await response.text();
  if (/^\s*</.test(raw)) {
    throw new ApiError(
      response.status,
      'El API de pagos no está conectado en esta página (Firebase /api).',
    );
  }
  let data: { error?: string } & T;
  try {
    data = JSON.parse(raw || '{}') as { error?: string } & T;
  } catch {
    throw new ApiError(response.status, 'El API de pagos no respondió JSON.');
  }
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? 'Error de red');
  }
  return data;
}

export type SessionUser = {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  bio: string | null;
  birthDate: string | null;
  category?: string | null;
  coins: number;
  coinsBalance: number;
  levelXp?: number;
};

type PostgresUser = {
  id: string;
  firebaseUid: string;
  email: string;
  username: string;
  displayName?: string;
  avatarUrl: string | null;
  bio: string | null;
  birthDate?: string | null;
  category?: string | null;
  coinsBalance: number;
  createdAt: string;
  updatedAt: string;
};

export function mapPostgresUser(user: PostgresUser): SessionUser {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName || user.username,
    handle: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio ?? null,
    birthDate: user.birthDate ?? null,
    category: user.category ?? null,
    coins: user.coinsBalance,
    coinsBalance: user.coinsBalance,
  };
}

export async function postAuthSync(idToken: string) {
  const response = await fetch(`${getApiBase()}/api/auth/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & Partial<PostgresUser>;
  if (!response.ok || !data.id || !data.firebaseUid) {
    throw new ApiError(response.status || 500, data.error ?? 'No se pudo sincronizar la sesión');
  }
  return mapPostgresUser(data as PostgresUser);
}

export type StreamDto = {
  id: string;
  title: string;
  category: string;
  isPrivate: boolean;
  lockPrice: number;
  coverUrl: string;
  previewUrl: string;
  viewerCount: number;
  livekitRoom: string;
  creator: {
    id: string;
    name: string;
    handle: string;
    avatar: string;
    live: boolean;
    viewers: string;
  };
};

export type GiftDto = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  accent: string;
};

export type CoinPackage = {
  id: string;
  name: string;
  coins: number;
  amountCents: number;
  popular: boolean;
};

export type TxnDto = {
  id: string;
  type: string;
  status: string;
  coins: number;
  amountCents: number | null;
  createdAt: string;
  reference: string;
};
