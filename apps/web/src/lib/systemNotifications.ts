import {
  cancelNativeSystemNotification,
  isNativeAndroidApp,
  showNativeSystemNotification,
} from './nativeLiveMedia';

/** Notificaciones del sistema Android (barra / pantalla bloqueada) para APK. */

const CALL_NOTIF_ID = 88001;
let lastMessageNotifAt = 0;
let lastFriendNotifAt = 0;

export async function notifyIncomingCallSystem(input: {
  name: string;
  username?: string | null;
  video: boolean;
}): Promise<void> {
  if (!isNativeAndroidApp()) return;
  const who = input.name || (input.username ? `@${input.username}` : 'Alguien');
  await showNativeSystemNotification({
    id: CALL_NOTIF_ID,
    channel: 'calls',
    title: input.video ? 'Videollamada entrante' : 'Llamada entrante',
    body: `${who} te está llamando en LiveBoom`,
  });
}

export async function clearIncomingCallSystem(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  await cancelNativeSystemNotification(CALL_NOTIF_ID);
}

export async function notifyPrivateMessageSystem(input: {
  name: string;
  preview: string;
  chatId?: string | null;
  peerUid?: string | null;
}): Promise<void> {
  if (!isNativeAndroidApp()) return;
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
  if (!isNativeAndroidApp()) return;
  const now = Date.now();
  if (now - lastFriendNotifAt < 2500) return;
  lastFriendNotifAt = now;
  await showNativeSystemNotification({
    channel: 'friends',
    title: 'Solicitud de amistad',
    body: `@${input.username} quiere ser tu amigo`,
  });
}

export async function notifyFriendLiveSystem(input: {
  name: string;
  username?: string;
}): Promise<void> {
  if (!isNativeAndroidApp()) return;
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
