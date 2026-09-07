import { ApiError, api } from './api';
import { CallBusyError } from './callAvailability';
import { auth } from './firebase';

export type CallTokenSession = {
  serverUrl: string;
  token: string;
  roomName: string;
  callId: string;
  chatId?: string;
  type?: 'audio' | 'video';
};

export type LiveKitGrantPeek = {
  identity: string;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
};

export function callRoomNameFromCall(callId?: string | null, chatId?: string | null) {
  const id = String(callId || '').trim();
  if (id) return `call_${id}`.slice(0, 64);
  return `dm_${String(chatId || '')}`.slice(0, 64);
}

export function peekLiveKitGrant(token: string | null | undefined): LiveKitGrantPeek | null {
  if (!token || typeof token !== 'string' || token.split('.').length < 2) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as {
      sub?: string;
      video?: { room?: string; canPublish?: boolean; canSubscribe?: boolean };
    };
    return {
      identity: String(payload.sub || ''),
      room: String(payload.video?.room || ''),
      canPublish: Boolean(payload.video?.canPublish),
      canSubscribe: payload.video?.canSubscribe !== false,
    };
  } catch {
    return null;
  }
}

export function logCallConnect(stage: string, extra: Record<string, unknown> = {}) {
  const token = typeof extra.token === 'string' ? extra.token : '';
  const grant = peekLiveKitGrant(token);
  const { token: _omitToken, ...safe } = extra;
  console.info('[CallConnect]', stage, {
    callId: extra.callId ?? null,
    roomName: extra.roomName ?? grant?.room ?? null,
    callerId: extra.callerId ?? null,
    receiverId: extra.receiverId ?? null,
    identity: extra.identity ?? grant?.identity ?? null,
    tokenGenerated: Boolean(token || extra.tokenGenerated),
    liveKitUrlPresent: Boolean(extra.liveKitUrlPresent ?? extra.serverUrl),
    callStatus: extra.callStatus ?? null,
    ...safe,
    token: undefined,
  });
}

export function describeLiveKitError(error: unknown) {
  const err = error as {
    name?: string;
    message?: string;
    reason?: string | number;
    code?: string | number;
    cause?: { message?: string; name?: string };
  };
  return {
    name: String(err?.name || 'Error'),
    message: String(err?.message || (typeof error === 'string' ? error : '')),
    reason: err?.reason != null ? String(err.reason) : null,
    code: err?.code != null ? String(err.code) : null,
    cause: err?.cause?.message || err?.cause?.name || null,
  };
}

export function shouldHangupOnLiveKitError(error: unknown): boolean {
  const info = describeLiveKitError(error);
  const blob = `${info.name} ${info.message} ${info.reason || ''} ${info.code || ''}`.toLowerCase();
  if (/cancel|cancelled|canceled|clientinitiated|duplicate/.test(blob)) return false;
  if (
    /microphone|camera|device|notallowederror|notfounderror|notreadableerror|overconstrained|media device/.test(
      blob,
    )
  ) {
    return false;
  }
  return (
    info.name === 'ConnectionError' ||
    info.name === 'ConnectError' ||
    /websocket|invalid token|unauthorized|not allowed to join|server url|could not connect|failed to connect|connectionerror|establish pc|peerconnection|\bice\b|dtls/.test(
      blob,
    )
  );
}

function assertCallTokenSession(
  session: CallTokenSession,
  expected: { callId?: string; roomName?: string; identity?: string },
) {
  if (typeof session.token !== 'string' || session.token.split('.').length < 3) {
    throw new Error('Token LiveKit inválido');
  }
  if (!String(session.serverUrl || '').trim()) {
    throw new Error('LIVEKIT_URL ausente');
  }
  const grant = peekLiveKitGrant(session.token);
  if (expected.identity && grant?.identity && grant.identity !== expected.identity) {
    console.error('[CallConnect] identity mismatch', {
      tokenIdentity: grant.identity,
      expected: expected.identity,
      callId: session.callId,
    });
  }
  if (expected.roomName && grant?.room && grant.room !== expected.roomName) {
    console.error('[CallConnect] roomName mismatch', {
      fromToken: grant.room,
      expected: expected.roomName,
      fromApi: session.roomName || null,
      callId: session.callId,
    });
  }
  if (expected.callId && session.callId && session.callId !== expected.callId) {
    console.error('[CallConnect] callId mismatch', {
      fromApi: session.callId,
      expected: expected.callId,
    });
  }
  return grant;
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
  extra?: { authorizationId?: string | null; giftId?: string | null; chatId?: string | null },
): Promise<CallTokenSession> {
  const me = auth.currentUser?.uid || null;
  logCallConnect('tokenGenerated', {
    type,
    chatId: extra?.chatId || null,
    callerId: me,
    receiverId: targetUid,
    identity: me,
    tokenGenerated: false,
    liveKitUrlPresent: false,
    callStatus: 'start-request',
  });
  try {
    const session = await api<CallTokenSession>('/api/calls/start', {
      method: 'POST',
      body: JSON.stringify({
        targetUid,
        type,
        chatId: extra?.chatId || undefined,
        authorizationId: extra?.authorizationId || undefined,
        giftId: extra?.giftId || undefined,
      }),
    });
    const grant = assertCallTokenSession(session, {
      callId: session.callId,
      roomName: session.roomName,
      identity: me || undefined,
    });
    logCallConnect('tokenGenerated', {
      callId: session.callId,
      roomName: session.roomName || grant?.room,
      callerId: me,
      receiverId: targetUid,
      identity: grant?.identity || me,
      tokenGenerated: true,
      liveKitUrlPresent: Boolean(session.serverUrl),
      canPublish: grant?.canPublish ?? null,
      canSubscribe: grant?.canSubscribe ?? null,
      callStatus: 'start',
    });
    return session;
  } catch (error) {
    logLiveKitError('token', error, { callerId: me, receiverId: targetUid });
    throw error;
  }
}

export async function requestCallToken(callId: string, chatId: string): Promise<CallTokenSession> {
  const me = auth.currentUser?.uid || null;
  const roomName = callRoomNameFromCall(callId, chatId);
  logCallConnect('tokenGenerated', {
    callId,
    roomName,
    identity: me,
    tokenGenerated: false,
    liveKitUrlPresent: false,
    callStatus: 'join-request',
  });
  try {
    const session = await api<CallTokenSession>('/api/livekit/token', {
      method: 'POST',
      body: JSON.stringify({ callId, chatId }),
    });
    const grant = assertCallTokenSession(session, {
      callId,
      roomName: session.roomName || roomName,
      identity: me || undefined,
    });
    logCallConnect('tokenGenerated', {
      callId: session.callId || callId,
      roomName: session.roomName || grant?.room || roomName,
      identity: grant?.identity || me,
      tokenGenerated: true,
      liveKitUrlPresent: Boolean(session.serverUrl),
      canPublish: grant?.canPublish ?? null,
      canSubscribe: grant?.canSubscribe ?? null,
      callStatus: 'join',
    });
    return session;
  } catch (error) {
    logLiveKitError('token', error, { callId, roomName, identity: me });
    throw error;
  }
}
