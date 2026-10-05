import { api } from './api';

export type AdActionType =
  | 'VIEW_SHORT'
  | 'VIEW_FULL'
  | 'VIEW_LONG'
  | 'VISIT_PROFILE'
  | 'FOLLOW'
  | 'VIEW_FOLLOW'
  | 'COMMENT'
  | 'REGISTER'
  | 'DOWNLOAD_FORM'
  | 'PURCHASE';

export type AdActionKind = 'view' | 'visit' | 'follow' | 'view_follow' | 'comment' | 'external';

export type AdSurface = 'inicio' | 'explorar' | 'clips' | 'flash';

export type SponsoredCampaign = {
  id: string;
  name: string;
  advertiser: string;
  advertiserUsername: string;
  advertiserUid: string;
  description: string;
  ctaLabel: string;
  imageUrl: string;
  videoUrl: string;
  linkUrl: string;
  actionType: AdActionType;
  actionKind: AdActionKind;
  actionLabel: string;
  points: number;
  minSeconds: number;
};

export type ClaimStatus = 'VALIDADO' | 'PENDIENTE' | 'SOSPECHOSO' | 'RECHAZADO';

export type AwardResult = {
  claimId: string;
  status: ClaimStatus;
  points: number;
  validatesAtMs: number | null;
};

export type RewardsHistoryRow = {
  id: string;
  kind: 'claim' | 'conversion';
  campaign: string;
  action: string;
  points: number;
  blast?: number;
  status: string;
  createdAtMs: number;
  validatesAtMs?: number | null;
};

export type MyRewards = {
  enabled: boolean;
  availablePoints: number;
  pendingPoints: number;
  totalBlast: number;
  totalPointsEarned: number;
  conversion: { blast: number; remaining: number; canConvert: boolean };
  limits: { dailyRewardLimit: number; usedToday: number; dailyFollowLimit: number; followsToday: number };
  history: RewardsHistoryRow[];
};

const DEVICE_KEY = 'lb.adDevice.v1';

/** Identificador estable del dispositivo (no personal) para detectar varias cuentas en un mismo equipo. */
export function adDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const raw = [
      crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      navigator.userAgent,
      `${screen.width}x${screen.height}x${window.devicePixelRatio || 1}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      navigator.hardwareConcurrency || 0,
    ].join('|');
    localStorage.setItem(DEVICE_KEY, raw.slice(0, 200));
    return raw.slice(0, 200);
  } catch {
    return '';
  }
}

export type ClientSignals = {
  webdriver?: boolean;
  emulator?: boolean;
  playbackRate?: number;
  seekedForward?: boolean;
  clockSkew?: boolean;
};

export function baseSignals(extra: ClientSignals = {}): ClientSignals {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return {
    webdriver: typeof navigator !== 'undefined' && navigator.webdriver === true,
    emulator: /sdk_gphone|Android SDK built for|Emulator|Genymotion/i.test(ua),
    ...extra,
  };
}

function post<T>(path: string, body: Record<string, unknown> = {}) {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export const adRewardsApi = {
  status: () => api<{ enabled: boolean; intervalMinutes: number; latestPublishedAtMs: number }>('/api/rewards/status'),
  me: () => api<MyRewards>('/api/rewards/me'),
  campaigns: () => api<{ campaigns: SponsoredCampaign[]; limitReached: boolean }>('/api/rewards/campaigns'),
  feed: (surface: AdSurface) =>
    api<{ campaign: SponsoredCampaign | null; intervalMinutes: number }>(
      `/api/rewards/feed?surface=${encodeURIComponent(surface)}`,
    ),
  click: (campaignId: string) => post<{ ok: boolean }>(`/api/rewards/campaigns/${campaignId}/click`),
  startSession: (campaignId: string, signals: ClientSignals) =>
    post<{ sessionId: string; minSeconds: number; heartbeatMs: number }>('/api/rewards/sessions', {
      campaignId,
      deviceId: adDeviceId(),
      signals: baseSignals(signals),
    }),
  beat: (sessionId: string, signals: ClientSignals) =>
    post<{ visibleSeconds: number; remainingSeconds: number; ready: boolean }>(
      `/api/rewards/sessions/${sessionId}/beat`,
      { visible: true, signals: baseSignals(signals) },
    ),
  complete: (sessionId: string, signals: ClientSignals) =>
    post<AwardResult>(`/api/rewards/sessions/${sessionId}/complete`, {
      deviceId: adDeviceId(),
      signals: baseSignals(signals),
    }),
  abandon: (sessionId: string) => post<{ ok: boolean }>(`/api/rewards/sessions/${sessionId}/abandon`),
  follow: (campaignId: string) =>
    post<AwardResult>(`/api/rewards/campaigns/${campaignId}/follow`, {
      deviceId: adDeviceId(),
      signals: baseSignals(),
    }),
  comment: (campaignId: string, text: string) =>
    post<AwardResult>(`/api/rewards/campaigns/${campaignId}/comment`, {
      text,
      deviceId: adDeviceId(),
      signals: baseSignals(),
    }),
  participate: (campaignId: string) =>
    post<{ redirectUrl: string; ref: string }>(`/api/rewards/campaigns/${campaignId}/participate`),
  convert: () => post<{ conversionId: string; blast: number; remainingPoints: number }>('/api/rewards/convert'),
};

export type AdminCampaign = {
  id: string;
  name: string;
  advertiser: string;
  advertiserUsername: string;
  advertiserUid: string;
  description: string;
  ctaLabel: string;
  imageUrl: string;
  videoUrl: string;
  linkUrl: string;
  actionType: AdActionType;
  points: number;
  minSeconds: number;
  startAtMs: number;
  endAtMs: number;
  budgetPoints: number;
  maxActions: number;
  maxParticipationsPerUser: number;
  allowRecurrence: boolean;
  frequencyMinutes: number;
  country: string;
  city: string;
  ageMin: number;
  ageMax: number;
  gender: 'todos' | 'mujer' | 'hombre' | 'otro';
  interests: string[];
  surfaces: AdSurface[];
  status: string;
  effectiveStatus: string;
  autoPublish: boolean;
  awardedPoints: number;
  reservedPoints: number;
  remainingPoints: number;
  actionsCount: number;
  internalCostCop: number;
  budgetCostCop: number;
  avgViewSeconds: number;
  hasWebhookSecret: boolean;
  createdAtMs: number;
  stats?: Record<string, number>;
};

export type AdActionConfig = {
  label: string;
  minSeconds: number;
  points: number;
  enabled: boolean;
  minPoints?: number;
  maxPoints?: number;
};

export type AdRewardsConfig = {
  enabled: boolean;
  pointsPerBlast: number;
  adIntervalMinutes: number;
  dailyRewardLimit: number;
  dailyFollowLimit: number;
  followHoldHours: number;
  maxAccountsPerDevice: number;
  maxAccountsPerIp: number;
  copPerEarnedBlast: number;
  actions: Record<AdActionType, AdActionConfig>;
};

export type AdminClaim = {
  id: string;
  uid: string;
  campaignId: string;
  campaignName: string;
  actionLabel: string;
  points: number;
  status: ClaimStatus;
  signals: string[];
  createdAtMs: number;
  validatesAtMs?: number;
  user?: { username: string; displayName: string } | null;
};

export type AdminLead = {
  code: string;
  uid: string;
  campaignName: string;
  status: string;
  createdAtMs: number;
  expiresAtMs: number;
  user?: { username: string; displayName: string } | null;
};

export const adRewardsAdminApi = {
  overview: () =>
    api<{ config: AdRewardsConfig; totals: Record<string, number> }>('/api/rewards/admin/overview'),
  saveConfig: (config: Partial<AdRewardsConfig>) =>
    api<{ config: AdRewardsConfig }>('/api/rewards/admin/config', { method: 'PUT', body: JSON.stringify(config) }),
  campaigns: () => api<{ campaigns: AdminCampaign[] }>('/api/rewards/admin/campaigns'),
  create: (input: Partial<AdminCampaign>) => post<{ campaign: AdminCampaign }>('/api/rewards/admin/campaigns', input),
  update: (id: string, input: Partial<AdminCampaign>) =>
    api<{ campaign: AdminCampaign }>(`/api/rewards/admin/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  setStatus: (id: string, status: string) =>
    post<{ campaign: AdminCampaign }>(`/api/rewards/admin/campaigns/${id}/status`, { status }),
  webhookSecret: (id: string) => api<{ secret: string }>(`/api/rewards/admin/campaigns/${id}/webhook`),
  leads: (id: string) => api<{ leads: AdminLead[] }>(`/api/rewards/admin/campaigns/${id}/leads`),
  confirmLead: (code: string) => post<AwardResult>(`/api/rewards/admin/leads/${code}/confirm`),
  claims: (status: string) =>
    api<{ claims: AdminClaim[] }>(`/api/rewards/admin/claims?status=${encodeURIComponent(status)}`),
  resolve: (id: string, decision: 'VALIDADO' | 'RECHAZADO', note = '') =>
    post<{ status: string }>(`/api/rewards/admin/claims/${id}/resolve`, { decision, note }),
};

export function formatPoints(n: number) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('es-CO');
}
