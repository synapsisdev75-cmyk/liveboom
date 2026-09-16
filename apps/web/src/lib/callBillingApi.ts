import { api } from './api';
import type { PlatformCallType } from './callPricing';

export type CallBillingSession = {
  callId: string;
  chatId: string;
  callerId: string;
  receiverId: string;
  callType: PlatformCallType | string;
  rateBlasts: number;
  pricingLabel?: string;
  connectedSeconds: number;
  blastDue: number;
  blastAlreadyCharged: number;
  creatorValueCop: number;
  creatorValuePerBlast?: number;
  graceSeconds?: number;
  status: string;
  exhausted?: boolean;
  callerBalance: number;
  purchasedBlastBalance?: number;
  earnedBlastBalance?: number;
  estimatedRemainingSeconds?: number | null;
  isLowBalance?: boolean;
  chargedDelta?: number;
  chargedPurchased?: number;
  chargedEarned?: number;
  duplicate?: boolean;
  insufficient?: boolean;
  needsEarnedAuth?: boolean;
  shouldEnd?: boolean;
  stopped?: boolean;
  creatorEarnedBlast?: number;
  allowEarnedBlastForCall?: boolean;
  receiverPurchasedBlastBalance?: number;
  receiverEarnedBlastBalance?: number;
  receiverCoinsBalance?: number;
};

export async function quoteCallBilling(callType: PlatformCallType | string) {
  return api<{
    balance: number;
    purchasedBlastBalance?: number;
    earnedBlastBalance?: number;
    rateBlasts: number;
    enoughToStart: boolean;
    enoughPurchasedToStart?: boolean;
    estimatedRemainingSeconds: number | null;
    estimatedMinutes: number | null;
    callType: string;
    pricingLabel: string;
  }>(`/api/calls/billing/quote?callType=${encodeURIComponent(callType)}`);
}

export async function startCallBilling(input: {
  callId: string;
  chatId: string;
  receiverId: string;
  video: boolean;
  callType: PlatformCallType | string;
  allowEarnedBlastForCall?: boolean;
}) {
  return api<CallBillingSession>('/api/calls/billing/start', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function syncCallBilling(input: {
  callId: string;
  connectedSeconds: number;
  allowEarnedBlastForCall?: boolean;
}) {
  return api<CallBillingSession>('/api/calls/billing/sync', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function stopCallBilling(input: { callId: string; connectedSeconds: number }) {
  return api<CallBillingSession>('/api/calls/billing/stop', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
