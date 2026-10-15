const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { getAdminDb } = require('./firestoreAdmin');
const { listTokensForUids, deleteBadToken, messaging, sendPushToUsers } = require('./pushNotify');

const RING_TTL_MS = 60 * 1000;
const DECLINE_URL = 'https://liveboomapp.com/api/calls/push-decline';

function callSecret() {
  return String(process.env.CALL_PUSH_SECRET || process.env.LIVEKIT_API_SECRET || '').trim();
}

/** Firma que autoriza el botón «Rechazar» de la notificación sin sesión de Firebase. */
function callDeclineKey(chatId, callId, uid) {
  const secret = callSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(`${chatId}:${callId}:${uid}`).digest('hex');
}

function verifyDeclineKey(chatId, callId, uid, key) {
  const expected = callDeclineKey(chatId, callId, uid);
  const given = String(key || '');
  if (!expected || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

function ringOf(data) {
  const call = data && typeof data.call === 'object' ? data.call : null;
  if (!call || call.status !== 'ringing' || !call.id || !call.toUid) return null;
  return call;
}

function httpsOrEmpty(value) {
  const url = String(value || '').trim();
  return /^https:\/\//i.test(url) ? url.slice(0, 500) : '';
}

function callData(chatId, call, extra) {
  const handle = String(call.fromHandle || '').replace(/^@/, '');
  return {
    callId: String(call.id),
    chatId: String(chatId),
    toUid: String(call.toUid),
    fromUid: String(call.fromUid || ''),
    fromName: String(call.fromName || '').slice(0, 80),
    fromHandle: handle.slice(0, 40),
    avatarUrl: httpsOrEmpty(call.fromAvatar),
    video: call.video ? '1' : '0',
    href: handle ? `/mensajes?con=${encodeURIComponent(handle)}` : '/mensajes',
    channel: 'calls',
    ...extra,
  };
}

/** Mensaje solo de datos y alta prioridad: llega con la app cerrada y la pantalla bloqueada. */
async function sendCallData(uid, data) {
  const { tokens, tokenOwners } = await listTokensForUids([uid]);
  const nativeTokens = tokens.filter((token) => tokenOwners.get(token)?.callUi);
  if (!nativeTokens.length) return 0;
  const res = await messaging().sendEachForMulticast({
    tokens: nativeTokens,
    data,
    android: { priority: 'high', ttl: RING_TTL_MS },
  });
  res.responses.forEach((r, idx) => {
    if (r.success) return;
    const code = r.error?.code || '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
      const token = nativeTokens[idx];
      void deleteBadToken(token, tokenOwners.get(token));
    }
  });
  return res.successCount;
}

async function announceIncoming(chatId, call) {
  const uid = String(call.toUid);
  const data = callData(chatId, call, {
    type: 'call_incoming',
    declineKey: callDeclineKey(chatId, String(call.id), uid),
    declineUrl: DECLINE_URL,
  });
  const native = await sendCallData(uid, data);
  // Apps sin pantalla de llamada nativa (versiones anteriores, otros sistemas): notificación con foto.
  const name = data.fromName || (data.fromHandle ? `@${data.fromHandle}` : 'LiveBoom');
  await sendPushToUsers({
    recipientUids: [uid],
    title: name,
    body: call.video ? 'Videollamada entrante' : 'Llamada entrante',
    channel: 'calls',
    data: { type: 'call_incoming', callId: data.callId, chatId: data.chatId, href: data.href, fromUid: data.fromUid },
    imageUrl: data.avatarUrl || null,
    tokenFilter: (meta) => !meta.callUi,
  });
  console.log('[call-push] incoming', { chatId, callId: data.callId, native });
}

function endOutcome(after, ringId) {
  const call = after && typeof after.call === 'object' ? after.call : null;
  if (!call || String(call.id || '') !== ringId) return 'missed';
  if (call.status === 'active') return 'answered';
  if (call.status === 'rejected') return 'declined';
  return 'missed';
}

async function announceEnded(chatId, ringCall, outcome) {
  const data = callData(chatId, ringCall, { type: 'call_ended', outcome });
  const native = await sendCallData(String(ringCall.toUid), data);
  console.log('[call-push] ended', { chatId, callId: data.callId, outcome, native });
}

/** Trigger de `chats/{chatId}`: aviso de llamada entrante y fin del timbre en el teléfono del receptor. */
async function handlePrivateCallChange(chatId, before, after) {
  const was = ringOf(before);
  const now = ringOf(after);
  if (was && (!now || String(now.id) !== String(was.id))) {
    await announceEnded(chatId, was, endOutcome(after, String(was.id)));
  }
  if (now && (!was || String(was.id) !== String(now.id))) {
    await announceIncoming(chatId, now);
  }
}

/** «Rechazar» desde la notificación: solo si la llamada sigue sonando para ese receptor. */
async function declineFromPush({ chatId, callId, uid, key }) {
  if (!chatId || !callId || !uid || !verifyDeclineKey(chatId, callId, uid, key)) {
    return { ok: false, status: 403 };
  }
  const db = getAdminDb();
  const ref = db.collection('chats').doc(String(chatId));
  const changed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const call = snap.exists ? snap.data()?.call : null;
    if (!call || String(call.id) !== String(callId) || String(call.toUid) !== String(uid)) return false;
    if (call.status !== 'ringing') return false;
    const now = Date.now();
    tx.update(ref, {
      'call.status': 'rejected',
      'call.endedAt': FieldValue.serverTimestamp(),
      'call.endedAtMs': now,
      'call.endedByOutcome': 'declined',
      'call.durationSec': 0,
    });
    return true;
  });
  return { ok: true, status: 200, changed };
}

module.exports = { handlePrivateCallChange, declineFromPush, callDeclineKey };
