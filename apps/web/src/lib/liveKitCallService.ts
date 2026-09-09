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

export function normalizeLiveKitUrl(raw: string | null | undefined): string {
  let url = String(raw || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\/+$/, '');
  if (!url) return '';
  if (/^https:/i.test(url)) url = url.replace(/^https:/i, 'wss:');
  else if (/^http:/i.test(url)) url = url.replace(/^http:/i, 'ws:');
  else if (!/^wss?:\/\//i.test(url)) url = `wss://${url}`;
  return url;
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
    status?: number;
    stack?: string;
    cause?: { message?: string; name?: string };
  };
  const httpStatus =
    typeof err?.status === 'number'
      ? err.status
      : error instanceof ApiError
        ? error.status
        : null;
  return {
    name: String(err?.name || 'Error'),
    message: String(err?.message || (typeof error === 'string' ? error : '')),
    reason: err?.reason != null ? String(err.reason) : null,
    code: err?.code != null ? String(err.code) : null,
    status: httpStatus,
    cause: err?.cause?.message || err?.cause?.name || null,
    stack: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 6).join('\n') : null,
  };
}

export type CallConnectErrorKind = 'permission' | 'camera' | 'media' | 'cancelled' | 'connection';

export function classifyCallConnectError(error: unknown): CallConnectErrorKind {
  const info = describeLiveKitError(error);
  const blob = `${info.name} ${info.message} ${info.reason || ''} ${info.code || ''} ${info.status || ''}`.toLowerCase();
  if (
    /cancel|cancelled|canceled|clientinitiated|client initiated|already connected|connection already|abort/.test(
      blob,
    )
  ) {
    return 'cancelled';
  }
  if (/notallowederror|permissiondenied|permission denied|permission/.test(blob)) return 'permission';
  if (/camera/.test(blob) && !/websocket|invalid token|unauthorized|ice|dtls/.test(blob)) return 'camera';
  if (
    /microphone|audio source|getusermedia|device|notfounderror|notreadableerror|overconstrained|media device/.test(
      blob,
    )
  ) {
    return 'media';
  }
  if (
    info.name === 'ConnectionError' ||
    info.name === 'ConnectError' ||
    /websocket|invalid token|unauthorized|not allowed to join|server url|could not connect|failed to connect|connectionerror|establish pc|peerconnection|\bice\b|dtls|\b401\b|\b403\b|room not found|participant identity/.test(
      blob,
    )
  ) {
    return 'connection';
  }
  return 'media';
}

export function shouldHangupOnLiveKitError(error: unknown): boolean {
  return classifyCallConnectError(error) === 'connection';
}

export function callConnectUserMessage(kind: CallConnectErrorKind, video: boolean) {
  if (kind === 'permission') {
    return video
      ? 'LiveBoom necesita acceso a la cámara y al micrófono. Revisa los permisos del navegador.'
      : 'LiveBoom necesita acceso al micrófono. Revisa los permisos del navegador.';
  }
  if (kind === 'camera') return 'Cámara no disponible';
  if (kind === 'media') {
    return video
      ? 'No se pudo acceder a la cámara o al micrófono.'
      : 'No se pudo acceder al micrófono.';
  }
  return 'No se pudo conectar la llamada.';
}

function assertCallTokenSession(
  session: CallTokenSession,
  expected: { callId?: string; roomName?: string; identity?: string },
) {
  if (typeof session.token !== 'string' || session.token.split('.').length < 3) {
    throw new Error('Token LiveKit inválido');
  }
  session.serverUrl = normalizeLiveKitUrl(session.serverUrl);
  if (!session.serverUrl) {
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
  const info = describeLiveKitError(error);
  const err = error instanceof ApiError ? error : null;
  console.error('[ERROR]', {
    stage,
    name: info.name,
    message: info.message,
    stack: info.stack,
    status: info.status ?? err?.status ?? null,
    code: err?.data?.code || info.code,
    callId: extra?.callId || null,
    roomName: extra?.roomName || null,
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
  extra?: { authorizationId?: string | null; giftId?: string | null; chatId?: string | null; callId?: string | null },
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
        callId: extra?.callId || undefined,
        authorizationId: extra?.authorizationId || undefined,
        giftId: extra?.giftId || undefined,
      }),
    });
    const grant = assertCallTokenSession(session, {
      callId: session.callId,
      roomName: session.roomName,
      identity: me || undefined,
    });
    console.info('[CALL CREATE]', {
      callId: session.callId,
      callerId: me,
      receiverId: targetUid,
      type,
    });
    console.info('[TOKEN]', {
      roomName: session.roomName || grant?.room || null,
      identity: grant?.identity || me,
      tokenGenerated: true,
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
    console.info('[TOKEN]', {
      roomName: session.roomName || grant?.room || roomName,
      identity: grant?.identity || me,
      tokenGenerated: true,
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
