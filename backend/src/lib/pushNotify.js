const { getMessaging } = require('firebase-admin/messaging');
const { getApps } = require('firebase-admin/app');
const { getAdminDb } = require('./firestoreAdmin');

const CHANNELS = {
  messages: 'liveboom_messages',
  friends: 'liveboom_friends',
  live: 'liveboom_live',
  calls: 'liveboom_calls',
  general: 'liveboom_general',
};

function messaging() {
  if (getApps().length === 0) {
    getAdminDb(); // asegura initializeApp
  }
  return getMessaging();
}

async function listTokensForUids(uids) {
  const db = getAdminDb();
  const unique = [...new Set((uids || []).map((u) => String(u || '').trim()).filter(Boolean))];
  const tokens = [];
  const tokenOwners = new Map();

  await Promise.all(
    unique.map(async (uid) => {
      try {
        const snap = await db.collection('users').doc(uid).collection('fcmTokens').get();
        snap.forEach((doc) => {
          const token = String(doc.data()?.token || doc.id || '').trim();
          if (!token || token.length < 20) return;
          tokens.push(token);
          tokenOwners.set(token, { uid, docId: doc.id });
        });
      } catch (err) {
        console.warn('[push] list tokens', uid, err.message);
      }
    }),
  );

  return { tokens: [...new Set(tokens)], tokenOwners };
}

async function deleteBadToken(token, meta) {
  if (!meta?.uid) return;
  try {
    const db = getAdminDb();
    await db.collection('users').doc(meta.uid).collection('fcmTokens').doc(meta.docId).delete();
  } catch {
    /* ignore */
  }
}

/**
 * Envía notificación FCM (aparece en pantalla bloqueada aunque la app esté cerrada).
 */
async function sendPushToUsers({
  recipientUids,
  title,
  body,
  channel = 'general',
  data = {},
}) {
  const { tokens, tokenOwners } = await listTokensForUids(recipientUids);
  if (!tokens.length) {
    console.warn('[push] no FCM tokens for recipients', recipientUids.length);
    return { sent: 0, failed: 0, skipped: true, tokens: 0 };
  }

  const channelId = CHANNELS[channel] || CHANNELS.general;
  const stringData = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v == null) return;
    stringData[String(k)] = String(v);
  });
  // Capacitor / Android necesitan channel en data para enrutado en foreground.
  if (!stringData.channel) stringData.channel = String(channel || 'general');

  let sent = 0;
  let failed = 0;

  // Enviar en lotes de 400 (límite FCM multicast práctico)
  const chunkSize = 400;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    try {
      const res = await messaging().sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: String(title || 'LiveBoom').slice(0, 80),
          body: String(body || '').slice(0, 180),
        },
        data: stringData,
        android: {
          priority: 'high',
          notification: {
            channelId,
            sound: 'default',
            priority: 'high',
            defaultVibrateTimings: true,
            visibility: 'public',
            // No forzar icono inválido (rompe banners en varios OEM).
            // Usa el default_notification_icon del Manifest.
          },
        },
      });
      sent += res.successCount;
      failed += res.failureCount;
      res.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = r.error?.code || '';
        console.warn('[push] token fail', code, r.error?.message);
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token')
        ) {
          const token = chunk[idx];
          void deleteBadToken(token, tokenOwners.get(token));
        }
      });
    } catch (err) {
      console.error('[push] sendEachForMulticast', err.message);
      failed += chunk.length;
    }
  }

  console.log('[push] result', { sent, failed, tokens: tokens.length, channel: channelId });
  return { sent, failed, skipped: false, tokens: tokens.length };
}

module.exports = {
  sendPushToUsers,
  CHANNELS,
};
