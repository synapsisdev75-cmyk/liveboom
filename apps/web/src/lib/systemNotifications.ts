import { isAppInForeground } from './chatNotifyContext';
import {
  cancelNativeSystemNotification,
  isNativeAndroidApp,
  isNativeIosApp,
  showNativeSystemNotification,
} from './nativeLiveMedia';

/** Notificaciones del sistema (banner + sonido) en Android e iPhone. */

const CALL_NOTIF_ID = 88001;
let lastMessageNotifAt = 0;
let lastFriendNotifAt = 0;
let lastPostNotifAt = 0;

function isNativeNotifyApp() {
  return isNativeAndroidApp() || isNativeIosApp();
}

export async function notifyIncomingCallSystem(input: {
  name: string;
  username?: string | null;
  video: boolean;
}): Promise<void> {
  if (!isNativeNotifyApp() || isAppInForeground()) return;
  // En Android la pantalla nativa ya muestra la llamada con foto. En iPhone el aviso queda para segundo plano.
  const { hasNativeCallUi } = await import('./nativeCallUi');
  if (isNativeAndroidApp() && hasNativeCallUi()) return;
  const who = input.name || (input.username ? `@${input.username}` : 'Alguien');
  await showNativeSystemNotification({
    id: CALL_NOTIF_ID,
    channel: 'calls',
    title: input.video ? 'Videollamada entrante' : 'Llamada entrante',
    body: `${who} te está llamando en LiveBoom`,
  });
}

export async function clearIncomingCallSystem(opts: { callId?: string; callEnded?: boolean } = {}): Promise<void> {
  if (!isNativeNotifyApp()) return;
  await cancelNativeSystemNotification(CALL_NOTIF_ID);
  const { endNativeIncomingCall } = await import('./nativeCallUi');
  await endNativeIncomingCall({ callId: opts.callId, release: Boolean(opts.callEnded) });
}

export async function notifyPrivateMessageSystem(input: {
  name: string;
  preview: string;
  chatId?: string | null;
  peerUid?: string | null;
}): Promise<void> {
  if (!isNativeNotifyApp() || isAppInForeground()) return;
  const { shouldSuppressMobileChatTrayNotify } = await import('./chatNotifyContext');
  if (
    shouldSuppressMobileChatTrayNotify({
      chatId: input.chatId,
      peerUid: input.peerUid,
    })
  ) {
    return;
  }
  const now = Date.now();
  if (now - lastMessageNotifAt < 2500) return;
  lastMessageNotifAt = now;
  await showNativeSystemNotification({
    channel: 'messages',
    title: input.name || 'Nuevo mensaje',
    body: input.preview.slice(0, 140) || 'Te envió un mensaje',
  });
}

export async function notifyFriendRequestSystem(input: {
  username: string;
}): Promise<void> {
  if (!isNativeNotifyApp() || isAppInForeground()) return;
  const now = Date.now();
  if (now - lastFriendNotifAt < 2500) return;
  lastFriendNotifAt = now;
  await showNativeSystemNotification({
    channel: 'friends',
    title: 'Solicitud de amistad',
    body: `@${input.username} quiere ser tu amigo`,
  });
}

export async function notifyPostSystem(input: { title: string; body: string }): Promise<void> {
  if (!isNativeNotifyApp() || isAppInForeground()) return;
  const now = Date.now();
  if (now - lastPostNotifAt < 2000) return;
  lastPostNotifAt = now;
  await showNativeSystemNotification({
    channel: 'general',
    title: input.title || 'Nueva publicación',
    body: input.body.slice(0, 140) || 'Alguien publicó en LiveBoom',
  });
}

export async function notifyFriendLiveSystem(input: {
  name: string;
  username?: string;
}): Promise<void> {
  if (!isNativeNotifyApp() || isAppInForeground()) return;
  const now = Date.now();
  if (now - lastFriendNotifAt < 2000) return;
  lastFriendNotifAt = now;
  await showNativeSystemNotification({
    channel: 'friends',
    title: `${input.name} está en LIVE`,
    body: input.username
      ? `@${input.username} está transmitiendo en LiveBoom`
      : 'Tu amigo está en vivo. Toca para ver.',
  });
}
