import { api, ApiError, getApiBase } from '../lib/api';
import { auth } from '../lib/firebase';
import { chatParticipantLabel, newIdempotencyKey, type AdminChatRow } from './helpers';

export { chatParticipantLabel, newIdempotencyKey };
export type { AdminChatRow };

export type AdminUserRow = {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  levelXp: number;
  levelXpPinned: number | null;
  levelXpOrganic: number;
  coinsBalance: number;
  purchasedBlastBalance: number;
  earnedBlastBalance: number;
  earnedBlastReserved: number;
  online: boolean;
  presenceAt: string | null;
  createdAt: string | null;
  profilePath: string;
};

export type AdminChatMessage = {
  id: string;
  text: string;
  fromUid: string;
  createdAt: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  deleted: boolean;
};

export type AdminAuditLog = {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  result: string;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  meta: Record<string, unknown>;
  requestId: string;
  createdAtMs: number;
};

export type WalletSummaryLite = {
  purchasedBalance: number;
  earnedAvailable: number;
  earnedReserved: number;
  coinsBalance: number;
  withdrawableBalance: number;
};

async function adminApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'No hay sesión de Firebase');
  const jwt = await user.getIdToken();
  const headers = new Headers(init.headers);
  if (init.body != null) headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${jwt}`);
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'Consulta cancelada.');
    }
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu red o intenta de nuevo.');
  }
  const raw = await response.text();
  let data: { error?: string; message?: string } & T;
  try {
    data = JSON.parse(raw) as { error?: string; message?: string } & T;
  } catch {
    throw new ApiError(response.status, `El servidor respondió ${response.status} sin JSON`);
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

export async function fetchAdminUsersPage(input: {
  q?: string;
  cursor?: string | null;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({ limit: '40' });
  if (input.q) params.set('q', input.q);
  if (input.cursor) params.set('cursor', input.cursor);
  return adminApi<{
    users: AdminUserRow[];
    nextCursor: string | null;
    total: number;
  }>(`/api/super-admin/users?${params.toString()}`, { signal: input.signal });
}

export async function patchAdminUserXp(
  uid: string,
  body: { mode: 'set' | 'adjust' | 'clear'; value?: number; reason?: string },
) {
  return api<{
    ok: boolean;
    before: { organic: number; pinned: number | null; effective: number };
    after: { organic: number; pinned: number | null; effective: number };
  }>(`/api/super-admin/users/${encodeURIComponent(uid)}/xp`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patchAdminUserBlast(
  uid: string,
  body: { bucket: 'purchased' | 'earned'; delta: number; reason?: string; idempotencyKey: string },
) {
  return api<{
    ok: boolean;
    duplicate?: boolean;
    summary: WalletSummaryLite;
  }>(`/api/super-admin/users/${encodeURIComponent(uid)}/blast`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchAdminChatsPage(input: {
  q?: string;
  cursor?: string | null;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({ limit: '40' });
  if (input.q) params.set('q', input.q);
  if (input.cursor) params.set('cursor', input.cursor);
  return adminApi<{ chats: AdminChatRow[]; nextCursor: string | null }>(
    `/api/super-admin/chats?${params.toString()}`,
    { signal: input.signal },
  );
}

export async function fetchAdminChatMessages(chatId: string, signal?: AbortSignal) {
  return adminApi<{ messages: AdminChatMessage[] }>(
    `/api/super-admin/chats/${encodeURIComponent(chatId)}/messages`,
    { signal },
  );
}

export async function fetchAdminAuditPage(cursor?: string | null) {
  const params = new URLSearchParams({ limit: '40' });
  if (cursor) params.set('cursor', cursor);
  return adminApi<{ logs: AdminAuditLog[]; nextCursor: string | null }>(
    `/api/super-admin/audit?${params.toString()}`,
  );
}
