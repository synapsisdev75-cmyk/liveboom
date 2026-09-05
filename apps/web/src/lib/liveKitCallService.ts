import { ApiError, api } from './api';

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

export function formatCallApiError(error: unknown) {
  if (error instanceof ApiError) {
    const missing = Array.isArray(error.data.missing)
      ? error.data.missing.filter((item): item is string => typeof item === 'string')
      : [];
    if (missing.length > 0) return `${error.message} (falta ${missing.join(', ')})`;
    return error.message;
  }
  return error instanceof Error ? error.message : 'No se pudo iniciar la llamada';
}

export async function createCall(targetUid: string, type: 'audio' | 'video'): Promise<CallTokenSession> {
  logLiveKit('requesting token', { type });
  try {
    const session = await api<CallTokenSession>('/api/calls/start', {
      method: 'POST',
      body: JSON.stringify({ targetUid, type }),
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
