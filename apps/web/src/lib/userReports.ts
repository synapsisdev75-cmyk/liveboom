import { api } from './api';

export type UserReportResult = {
  ok: boolean;
  reportId: string;
  emailSent: boolean;
};

export type FeedbackCategory = 'general' | 'child_safety' | 'abuse' | 'bug' | 'other';

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

/** Comentarios / denuncias dentro de la app (sin salir), p. ej. Configuración → Reportar. */
export async function submitInAppFeedback(input: {
  category: FeedbackCategory;
  message: string;
}): Promise<UserReportResult> {
  return api<UserReportResult>('/api/reports/feedback', {
    method: 'POST',
    body: JSON.stringify({
      category: input.category,
      message: input.message,
    }),
    signal: AbortSignal.timeout(25_000),
  });
}
