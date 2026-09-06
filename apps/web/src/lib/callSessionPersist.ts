/** Sesión de llamada en sessionStorage: sobrevive al refresh, no a otra pestaña. */

export type PersistedCallSession = {
  chatId: string;
  callId: string;
  video: boolean;
  role: 'caller' | 'callee';
  connectedAt: number | null;
  peer: {
    uid: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

const KEY = 'lb_call_session_v1';

export function saveCallSession(session: PersistedCallSession | null): void {
  try {
    if (!session?.chatId || !session.callId) {
      sessionStorage.removeItem(KEY);
      return;
    }
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function readCallSession(): PersistedCallSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedCallSession>;
    if (!data?.chatId || !data.callId || !data.peer?.uid) return null;
    return {
      chatId: String(data.chatId),
      callId: String(data.callId),
      video: Boolean(data.video),
      role: data.role === 'callee' ? 'callee' : 'caller',
      connectedAt: Number(data.connectedAt) > 0 ? Number(data.connectedAt) : null,
      peer: {
        uid: String(data.peer.uid),
        username: String(data.peer.username || ''),
        displayName: String(data.peer.displayName || data.peer.username || ''),
        avatarUrl: data.peer.avatarUrl ?? null,
      },
    };
  } catch {
    return null;
  }
}

export function clearCallSession(): void {
  saveCallSession(null);
}
