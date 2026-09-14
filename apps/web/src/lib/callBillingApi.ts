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
  estimatedRemainingSeconds?: number | null;
  isLowBalance?: boolean;
  chargedDelta?: number;
  duplicate?: boolean;
  insufficient?: boolean;
  shouldEnd?: boolean;
  stopped?: boolean;
};

export async function quoteCallBilling(callType: PlatformCallType | string) {
  return api<{
    balance: number;
    rateBlasts: number;
    enoughToStart: boolean;
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
}) {
  return api<CallBillingSession>('/api/calls/billing/start', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function syncCallBilling(input: { callId: string; connectedSeconds: number }) {
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
