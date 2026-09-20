import { api, ApiError, getApiBase } from './api';
import { auth } from './firebase';

export type VerificationStatus =
  | 'not_started'
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'needs_correction'
  | 'verified'
  | 'rejected'
  | 'needs_reverification';

export type ItemStatus = 'unverified' | 'in_review' | 'verified' | 'rejected' | 'needs_correction';

export type VerificationFile = {
  id: string;
  slot: string;
  contentType: string;
  size: number;
  status?: string;
  correctionMessage?: string;
  uploadedAtMs?: number;
};

export type VerificationAccount = {
  id: string;
  bank: string;
  accountType: string;
  accountNumberMasked: string;
  holderName: string;
  status: ItemStatus;
  needsCertificate?: boolean;
  createdAtMs?: number;
  verifiedAtMs?: number | null;
};

export type VerificationCase = {
  caseId: string;
  userId?: string;
  status: VerificationStatus;
  identityStatus: ItemStatus;
  accountStatus: ItemStatus;
  identity: {
    legalName: string;
    documentType: string;
    documentNumber: string;
    documentCountry: string;
    birthDate: string;
    documentExpiry: string;
    email: string;
  };
  identityVerified: boolean;
  identityVerifiedAtMs?: number | null;
  correction?: Record<string, string>;
  consents?: { key: string; version: string; acceptedAtMs: number }[];
  files: VerificationFile[];
  accounts: VerificationAccount[];
  action: { key: string; label: string };
  biometricAvailable: boolean;
  config: VerificationConfig;
  canWithdraw: boolean;
  needsAdmin?: boolean;
  message: string;
  events?: {
    id: string;
    type: string;
    atMs: number;
    actorEmail?: string | null;
    userMessage?: string;
    internalNote?: string;
    slots?: string[];
  }[];
};

export type VerificationConfig = {
  country: string;
  minAge: number;
  slaHours: number | null;
  biometricAvailable: boolean;
  biometricNote?: string | null;
  documentTypes: { id: string; label: string; sides: string[]; hasExpiry: boolean }[];
  payoutMethods: { id: string; label: string; accountKind: string; needsCertificate: boolean }[];
  accountTypes: { id: string; label: string }[];
  extraDocuments: { id: string; label: string }[];
  consents: { key: string; version: string; title: string; body: string }[];
  maxFileBytes: number;
  allowedMime: string[];
};

export type QueueCase = {
  caseId: string;
  userId: string;
  status: VerificationStatus;
  identityStatus: ItemStatus;
  legalName: string;
  documentType: string;
  updatedAtMs?: number;
  submittedAtMs?: number | null;
  needsAdmin?: boolean;
};

export async function fetchVerificationCase() {
  return api<VerificationCase>('/api/verification');
}

export async function saveVerificationDraft(body: Record<string, unknown>) {
  return api<VerificationCase>('/api/verification', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function addVerificationAccount(body: Record<string, unknown>) {
  return api<VerificationCase>('/api/verification/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function submitVerificationCase(body: Record<string, unknown>) {
  return api<VerificationCase>('/api/verification/submit', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function uploadVerificationFile(slot: string, file: File) {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'No hay sesión de Firebase');
  const jwt = await user.getIdToken();
  const response = await fetch(
    `${getApiBase()}/api/verification/files?slot=${encodeURIComponent(slot)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-file-slot': slot,
      },
      body: await file.arrayBuffer(),
      signal: AbortSignal.timeout(60_000),
    },
  );
  const data = (await response.json().catch(() => ({}))) as VerificationCase & { error?: string };
  if (!response.ok) {
    throw new ApiError(response.status, data.error || 'No se pudo subir el archivo');
  }
  return data;
}

export async function fetchVerificationFileUrl(fileId: string, uid?: string) {
  const params = uid ? `?uid=${encodeURIComponent(uid)}` : '';
  return api<{ url: string; expiresAtMs: number; contentType?: string; slot?: string }>(
    `/api/verification/files/${encodeURIComponent(fileId)}/url${params}`,
  );
}

export async function fetchAdminVerificationQueue(cursor?: string | null, filter = 'queue') {
  const params = new URLSearchParams({ limit: '30', filter });
  if (cursor) params.set('cursor', cursor);
  return api<{ cases: QueueCase[]; nextCursor: string | null }>(
    `/api/verification/admin?${params.toString()}`,
  );
}

export async function fetchAdminVerificationCase(uid: string) {
  return api<VerificationCase>(`/api/verification/admin/${encodeURIComponent(uid)}`);
}

export async function decideVerificationCase(
  uid: string,
  body: { action: 'approve' | 'correct' | 'reject'; reason?: string; internalNote?: string; slots?: string[] },
) {
  return api<VerificationCase>(`/api/verification/admin/${encodeURIComponent(uid)}/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function prepareWithdrawal(body: {
  coins: number;
  accountId: string;
  fullName?: string;
  documentId?: string;
  payoutMethod?: string;
  accountNumber?: string;
  accountType?: string;
}) {
  return api<{
    confirmId: string;
    expiresAtMs: number;
    code: string;
    earnedBlastAmount: number;
    moneyAmountCOP: number;
    moneyAmountExact: string;
    currency: string;
    legalName: string;
    holderName?: string;
    bank?: string;
    accountType?: string;
    accountNumberMasked?: string;
    accountId?: string;
    note?: string;
  }>('/api/wallet/withdrawals/prepare', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function statusLabel(status: string | undefined) {
  switch (String(status || '')) {
    case 'verified':
      return 'Verificada';
    case 'in_review':
    case 'submitted':
      return 'En revisión';
    case 'needs_correction':
      return 'Requiere corrección';
    case 'rejected':
      return 'Rechazada';
    case 'needs_reverification':
      return 'Requiere nueva verificación';
    case 'draft':
      return 'Borrador';
    default:
      return 'Sin verificar';
  }
}

export const SLOT_LABELS: Record<string, string> = {
  id_front: 'Frente del documento',
  id_back: 'Reverso del documento',
  passport: 'Página de datos del pasaporte',
  bank_cert: 'Certificación bancaria de titularidad',
};
