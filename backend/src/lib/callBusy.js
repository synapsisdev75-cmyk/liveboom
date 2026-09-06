const { FieldValue } = require('firebase-admin/firestore');
const { getAdminDb } = require('./firestoreAdmin');

/** Alineado con apps/web/src/lib/callAvailability.ts */
const STALE_MS = 8 * 60 * 1000;

function presenceRef(db, uid) {
  return db.collection('users').doc(String(uid)).collection('presence').doc('now');
}

function isLocked(data, now, opts = {}) {
  if (!data || data.callStatus !== 'busy') return false;
  const t = Number(data.callUpdatedAtMs) || 0;
  if (t > 0 && now - t > STALE_MS) return false;
  const exceptCallId = opts.exceptCallId ? String(opts.exceptCallId) : '';
  if (exceptCallId && data.callId && String(data.callId) === exceptCallId) return false;
  const resumePeerUid = opts.resumePeerUid ? String(opts.resumePeerUid) : '';
  if (resumePeerUid && data.callPeerUid && String(data.callPeerUid) === resumePeerUid) return false;
  return true;
}

function clearPayload(now) {
  return {
    callStatus: 'available',
    callId: null,
    callChatId: null,
    callPeerUid: null,
    callUpdatedAtMs: now,
  };
}

/**
 * Reserva atómica de ocupación para caller y receiver.
 * Solo una llamada puede marcar a un usuario BUSY a la vez.
 */
async function claimUsersBusy({ callerId, receiverId, callId, chatId }) {
  const db = getAdminDb();
  const a = String(callerId || '').trim();
  const b = String(receiverId || '').trim();
  const id = String(callId || '').trim();
  if (!a || !b || !id || a === b) {
    return { ok: false, code: 'CALL_BAD_TARGET' };
  }
  const first = a < b ? a : b;
  const second = a < b ? b : a;
  const chat = String(chatId || '').trim() || null;

  return db.runTransaction(async (tx) => {
    const firstRef = presenceRef(db, first);
    const secondRef = presenceRef(db, second);
    const firstSnap = await tx.get(firstRef);
    const secondSnap = await tx.get(secondRef);
    const now = Date.now();
    const firstData = firstSnap.data() || {};
    const secondData = secondSnap.data() || {};
    const callerData = a === first ? firstData : secondData;
    const receiverData = a === first ? secondData : firstData;

    if (isLocked(callerData, now, { exceptCallId: id, resumePeerUid: b })) {
      return { ok: false, code: 'USER_ALREADY_IN_CALL' };
    }
    if (isLocked(receiverData, now, { exceptCallId: id })) {
      return { ok: false, code: 'USER_BUSY' };
    }

    const stamp = {
      callStatus: 'busy',
      callId: id,
      callChatId: chat,
      callUpdatedAtMs: now,
      online: true,
      at: FieldValue.serverTimestamp(),
    };
    tx.set(firstRef, { ...stamp, callPeerUid: first === a ? b : a }, { merge: true });
    tx.set(secondRef, { ...stamp, callPeerUid: second === a ? b : a }, { merge: true });
    return { ok: true };
  });
}

async function refreshCallBusy(uid, callId) {
  const db = getAdminDb();
  const ref = presenceRef(db, uid);
  const snap = await ref.get();
  const data = snap.data() || {};
  if (data.callStatus !== 'busy') return { ok: true };
  if (callId && data.callId && String(data.callId) !== String(callId)) return { ok: true, skipped: true };
  await ref.set({ callUpdatedAtMs: Date.now() }, { merge: true });
  return { ok: true };
}

async function releaseCallById(uid, callId) {
  const db = getAdminDb();
  const meRef = presenceRef(db, uid);
  return db.runTransaction(async (tx) => {
    const meSnap = await tx.get(meRef);
    const data = meSnap.data() || {};
    if (data.callStatus !== 'busy') return { ok: true };
    if (callId && data.callId && String(data.callId) !== String(callId)) {
      return { ok: true, skipped: true };
    }
    const peerUid = data.callPeerUid ? String(data.callPeerUid) : '';
    let peerRef = null;
    let peerSnap = null;
    if (peerUid && peerUid !== uid) {
      peerRef = presenceRef(db, peerUid);
      peerSnap = await tx.get(peerRef);
    }
    const now = Date.now();
    const clear = clearPayload(now);
    tx.set(meRef, clear, { merge: true });
    if (peerRef && peerSnap) {
      const pd = peerSnap.data() || {};
      if (pd.callStatus === 'busy' && (!pd.callId || String(pd.callId) === String(callId))) {
        tx.set(peerRef, clear, { merge: true });
      }
    }
    return { ok: true };
  });
}

module.exports = {
  STALE_MS,
  claimUsersBusy,
  refreshCallBusy,
  releaseCallById,
};
