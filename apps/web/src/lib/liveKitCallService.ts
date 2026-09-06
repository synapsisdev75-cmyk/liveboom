import { ApiError, api } from './api';
import { CallBusyError } from './callAvailability';

export type CallTokenSession = {
  serverUrl: string;
  token: string;
  roomName: string;
  callId: string;
  chatId?: string;
  type?: 'audio' | 'video';
};

function logLiveKit(stage: string, extra?: Record<string, unknown>) {
  console.info('[LiveKit]', stage, extra || '');
}

function logLiveKitError(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const err = error instanceof ApiError ? error : null;
  console.error('[LiveKit ERROR]', {
    stage,
    errorCode: err?.status || err?.data?.code || 'UNKNOWN',
    callId: extra?.callId || null,
    roomName: extra?.roomName || null,
    message: err?.message || (error instanceof Error ? error.message : 'error'),
  });
}

export function formatCallApiError(error: unknown, ctx?: { handle?: string }) {
  if (error instanceof CallBusyError) return error.message;
  if (error instanceof ApiError) {
    const code = String(error.data?.code || '');
    if (code === 'USER_ALREADY_IN_CALL') return 'Ya tienes una llamada en curso.';
    if (code === 'USER_BUSY') {
      const handle = String(ctx?.handle || error.data?.handle || '').replace(/^@/, '');
      return handle ? `@${handle} está ocupado en otra llamada.` : 'Esta persona está ocupada en otra llamada.';
    }
    const missing = Array.isArray(error.data.missing)
      ? error.data.missing.filter((item): item is string => typeof item === 'string')
      : [];
    if (missing.length > 0) return `${error.message} (falta ${missing.join(', ')})`;
    const msg = String(error.message || '');
    if (/^\d{3}\b/.test(msg) || /livekit|room occupied|api error|\b409\b/i.test(msg)) {
      return 'No se pudo iniciar la llamada. Intenta de nuevo.';
    }
    return msg || 'No se pudo iniciar la llamada';
  }
  return error instanceof Error ? error.message : 'No se pudo iniciar la llamada';
}

export async function releaseCallSession(callId: string | null | undefined) {
  const id = String(callId || '').trim();
  if (!id) return;
  try {
    await api('/api/calls/release', {
      method: 'POST',
      body: JSON.stringify({ callId: id }),
    });
  } catch {
    /* la presencia local ya se libera al colgar */
  }
}

export function readCallBusyCode(error: unknown): 'USER_BUSY' | 'USER_ALREADY_IN_CALL' | null {
  if (error instanceof CallBusyError) return error.code;
  if (error instanceof ApiError) {
    const code = String(error.data?.code || '');
    if (code === 'USER_BUSY' || code === 'USER_ALREADY_IN_CALL') return code;
  }
  return null;
}

export async function createCall(
  targetUid: string,
  type: 'audio' | 'video',
  extra?: { authorizationId?: string | null; giftId?: string | null },
): Promise<CallTokenSession> {
  logLiveKit('requesting token', { type });
  try {
    const session = await api<CallTokenSession>('/api/calls/start', {
      method: 'POST',
      body: JSON.stringify({
        targetUid,
        type,
        authorizationId: extra?.authorizationId || undefined,
        giftId: extra?.giftId || undefined,
      }),
    });
    logLiveKit('token received', { callId: session.callId, roomName: session.roomName });
    return session;
  } catch (error) {
    logLiveKitError('token', error);
    throw error;
  }
}

export async function requestCallToken(callId: string, chatId: string): Promise<CallTokenSession> {
  const roomName = `dm_${chatId}`.slice(0, 64);
  logLiveKit('requesting token', { callId, roomName });
  try {
    const session = await api<CallTokenSession>('/api/livekit/token', {
      method: 'POST',
      body: JSON.stringify({ callId, chatId }),
    });
    logLiveKit('token received', { callId: session.callId, roomName: session.roomName || roomName });
    return session;
  } catch (error) {
    logLiveKitError('token', error, { callId, roomName });
    throw error;
  }
}
