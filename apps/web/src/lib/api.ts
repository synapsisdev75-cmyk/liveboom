import { auth } from './firebase';

const ONLINE_API = 'https://liveboom.vercel.app';
const API_BASE = String(import.meta.env.VITE_API_URL || ONLINE_API).replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function token(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError(401, 'No hay sesión de Firebase');
  }
  return user.getIdToken();
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const jwt = await token();
  headers.set('Authorization', `Bearer ${jwt}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const raw = await response.text();
  let data: { error?: string; message?: string } & T;
  try {
    data = JSON.parse(raw) as { error?: string; message?: string } & T;
  } catch {
    throw new ApiError(
      response.status,
      raw.trim()
        ? `El API en línea falló (${response.status}). Intenta de nuevo en un momento.`
        : `El servidor respondió ${response.status} sin JSON`,
    );
  }
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? data.message ?? `Error ${response.status}`);
  }
  return data;
}

export async function apiPublic<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
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
  coins: number;
  coinsBalance: number;
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
    coins: user.coinsBalance,
    coinsBalance: user.coinsBalance,
  };
}

export async function postAuthSync(idToken: string) {
  const response = await fetch(`${API_BASE}/api/auth/sync`, {
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
