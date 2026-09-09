import { api } from './api';

export type UserReportResult = {
  ok: boolean;
  reportId: string;
  emailSent: boolean;
};

export async function submitUserReport(input: {
  reportedUserId: string;
  conversationId?: string | null;
  reason: string;
}): Promise<UserReportResult> {
  return api<UserReportResult>('/api/reports', {
    method: 'POST',
    body: JSON.stringify({
      reportedUserId: input.reportedUserId,
      conversationId: input.conversationId || null,
      reason: input.reason,
    }),
    signal: AbortSignal.timeout(25_000),
  });
}
