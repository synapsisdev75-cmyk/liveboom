import { Capacitor } from '@capacitor/core';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { api } from './api';
import { shouldSuppressMobileChatTrayNotify } from './chatNotifyContext';
import { db } from './firebase';
import {
  isNativeAndroidApp,
  showNativeSystemNotification,
} from './nativeLiveMedia';

type PushChannel = 'messages' | 'friends' | 'live' | 'calls' | 'general';

let registeredUid: string | null = null;
let registering = false;
let lastTokenSaved = '';

function tokenDocId(token: string): string {
  // Firestore doc id seguro (sin /)
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) | 0;
  }
  return `t_${Math.abs(hash).toString(36)}_${token.slice(-8).replace(/[^a-zA-Z0-9]/g, '')}`;
}

async function persistToken(uid: string, token: string): Promise<void> {
  const id = tokenDocId(token);
  await setDoc(
    doc(db, 'users', uid, 'fcmTokens', id),
    {
      token,
      platform: Capacitor.getPlatform(),
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    },
    { merge: true },
  );
  lastTokenSaved = token;
  console.log('[push] token saved', id);
}

function channelFromData(data: Record<string, string> | undefined): 'messages' | 'friends' | 'calls' | 'general' {
  const raw = String(data?.channel || data?.type || '').toLowerCase();
  if (raw.includes('message')) return 'messages';
  if (raw.includes('live') || raw.includes('friend')) return 'friends';
  if (raw.includes('call')) return 'calls';
  return 'general';
}

async function ensureAndroidChannels(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const channels = [
      { id: 'liveboom_messages', name: 'Mensajes', description: 'Mensajes privados', importance: 5 },
      { id: 'liveboom_live', name: 'Amigos en LIVE', description: 'Cuando un amigo transmite', importance: 5 },
      { id: 'liveboom_friends', name: 'Amigos', description: 'Solicitudes y actividad', importance: 4 },
      { id: 'liveboom_calls', name: 'Llamadas', description: 'Llamadas entrantes', importance: 5 },
      { id: 'liveboom_general', name: 'General', description: 'Avisos LiveBoom', importance: 3 },
    ] as const;
    for (const ch of channels) {
      await PushNotifications.createChannel({
        id: ch.id,
        name: ch.name,
        description: ch.description,
        importance: ch.importance,
        visibility: 1,
        sound: 'default',
        vibration: true,
      }).catch(() => undefined);
    }
  } catch {
    /* plugin no instalado aún */
  }
}

/**
 * Registra el dispositivo para push FCM (notificaciones con la app cerrada).
 * Solo Android Capacitor.
 */
export async function registerPushNotifications(uid: string | null | undefined): Promise<void> {
  if (!uid || !isNativeAndroidApp()) return;
  if (registering) return;
  registering = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await ensureAndroidChannels();

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      console.warn('[push] permission denied', perm);
      return;
    }

    await PushNotifications.removeAllListeners().catch(() => undefined);

    await PushNotifications.addListener('registration', (ev) => {
      const token = String(ev.value || '').trim();
      if (!token) return;
      if (token === lastTokenSaved && registeredUid === uid) return;
      void persistToken(uid, token).catch((err) => {
        console.warn('[push] save token', err);
      });
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registrationError', err);
    });

    // Con la app en primer plano Android no muestra el banner FCM solo:
    // lo replicamos como notificación nativa (estilo Facebook/WhatsApp).
    // Si ya estás dentro del chat del remitente → no banner (doble aviso).
    await PushNotifications.addListener('pushNotificationReceived', (ev) => {
      const title = String(ev.title || 'LiveBoom');
      const body = String(ev.body || '');
      const data = (ev.data || {}) as Record<string, string>;
      const channel = channelFromData(data);
      if (
        channel === 'messages' &&
        shouldSuppressMobileChatTrayNotify({
          chatId: data.chatId || null,
          peerUid: data.fromUid || null,
        })
      ) {
        return;
      }
      void showNativeSystemNotification({
        channel,
        title,
        body: body || 'Nueva notificación',
      });
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (ev) => {
      const href = String(ev.notification?.data?.href || '').trim();
      if (href && typeof window !== 'undefined') {
        window.location.assign(href.startsWith('/') ? href : `/${href}`);
      }
    });

    await PushNotifications.register();
    registeredUid = uid;
    console.log('[push] register() called for', uid.slice(0, 8));
  } catch (err) {
    console.warn('[push] register failed', err);
  } finally {
    registering = false;
  }
}

/** Dispara push al API (fire-and-forget). */
export function enqueuePushNotify(input: {
  recipientUids: string[];
  title: string;
  body: string;
  channel?: PushChannel;
  href?: string;
  type?: string;
  /** Chat abierto: el receptor puede silenciar el banner si está dentro. */
  chatId?: string;
  fromUid?: string;
}): void {
  const recipientUids = [...new Set(input.recipientUids.filter(Boolean))].slice(0, 50);
  if (!recipientUids.length) return;
  const channel = input.channel || 'general';
  const data: Record<string, string> = {
    href: input.href || '/',
    type: input.type || 'general',
    channel,
  };
  if (input.chatId) data.chatId = input.chatId;
  if (input.fromUid) data.fromUid = input.fromUid;
  void api<{ ok?: boolean; sent?: number; skipped?: boolean }>('/api/push/notify', {
    method: 'POST',
    body: JSON.stringify({
      recipientUids,
      title: input.title,
      body: input.body,
      channel,
      data,
    }),
  })
    .then((res) => {
      console.log('[push] notify api ok', {
        sent: res.sent,
        skipped: res.skipped,
        recipients: recipientUids.length,
      });
    })
    .catch((err) => {
      console.warn('[push] notify api', err);
    });
}
