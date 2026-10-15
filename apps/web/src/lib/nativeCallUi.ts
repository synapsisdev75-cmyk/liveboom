import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Pantalla de llamada nativa del APK (llamada entrante con foto sobre el bloqueo). */
type NativeCallAction = {
  callId?: string;
  chatId?: string;
  action?: string;
  href?: string;
};

type LiveBoomCallsApi = {
  status(): Promise<{ available: boolean; fullScreen: boolean; notifications: boolean }>;
  openFullScreenSettings(): Promise<void>;
  consumeAction(): Promise<NativeCallAction>;
  endIncoming(opts: { callId?: string; release?: boolean }): Promise<void>;
  addListener(event: 'callAction', cb: (action: NativeCallAction) => void): Promise<PluginListenerHandle>;
};

const LiveBoomCalls = registerPlugin<LiveBoomCallsApi>('LiveBoomCalls');

export const NATIVE_CALL_ANSWER_EVENT = 'liveboom:native-call-answer';
const ANSWER_WINDOW_MS = 60_000;

let installed = false;
let pendingAnswer: { callId: string; at: number } | null = null;

export function hasNativeCallUi(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LiveBoomCalls');
  } catch {
    return false;
  }
}

function handleAction(raw: NativeCallAction | null | undefined) {
  const callId = String(raw?.callId || '').trim();
  if (!callId || raw?.action !== 'answer') return;
  pendingAnswer = { callId, at: Date.now() };
  window.dispatchEvent(new CustomEvent(NATIVE_CALL_ANSWER_EVENT, { detail: { callId } }));
}

/** Escucha «Contestar» tocado en la notificación nativa (también en arranque en frío). */
export function installNativeCallActions(): void {
  if (installed || typeof window === 'undefined' || !hasNativeCallUi()) return;
  installed = true;
  void LiveBoomCalls.addListener('callAction', handleAction).catch(() => undefined);
  void LiveBoomCalls.consumeAction()
    .then(handleAction)
    .catch(() => undefined);
}

/** true una sola vez si el usuario contestó esta llamada desde la notificación nativa. */
export function takeNativeCallAnswer(callId: string): boolean {
  const pending = pendingAnswer;
  if (!pending || pending.callId !== callId || Date.now() - pending.at > ANSWER_WINDOW_MS) return false;
  pendingAnswer = null;
  return true;
}

/**
 * Quita el timbre nativo. `release` también deja de mostrar la app sobre el bloqueo
 * (solo al terminar la llamada: en curso debe seguir visible como en el iPhone).
 */
export async function endNativeIncomingCall(opts: { callId?: string; release?: boolean } = {}): Promise<void> {
  if (!hasNativeCallUi()) return;
  try {
    await LiveBoomCalls.endIncoming({ callId: opts.callId || '', release: Boolean(opts.release) });
  } catch {
    /* ignore */
  }
}
