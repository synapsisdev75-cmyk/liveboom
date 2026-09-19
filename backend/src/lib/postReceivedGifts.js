/**
 * Historial de regalos por publicación (solo lectura en cliente).
 * Lo escribe el API tras un cobro confirmado. No mezcla LIVE / llamadas.
 */

const { FieldValue } = require('firebase-admin/firestore');

function safeId(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 80);
}

function publicName(value, fallback) {
  const name = String(value || '').trim().slice(0, 80);
  return name || fallback;
}

async function recordPostReceivedGift({
  postId,
  recipientUid,
  senderUid,
  senderName,
  senderUsername,
  giftId,
  giftName,
  units,
  clientId,
}) {
  const id = safeId(postId);
  const sender = String(senderUid || '').trim();
  const recipient = String(recipientUid || '').trim();
  const gift = String(giftId || '').trim().slice(0, 80);
  const qty = Math.max(1, Math.floor(Number(units) || 1));
  if (!id || !sender || !recipient || !gift || sender === recipient) return false;

  const { firestoreConfigured, getAdminDb } = require('./firestoreAdmin');
  if (!firestoreConfigured()) return false;

  const db = getAdminDb();
  const postRef = db.collection('posts').doc(id);
  const giftRef = postRef.collection('receivedGifts').doc(safeId(clientId) || `${Date.now()}`);

  return db.runTransaction(async (tx) => {
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists) return false;
    const authorUid = String(postSnap.data()?.authorUid || '');
    if (!authorUid || authorUid !== recipient) return false;

    const existing = await tx.get(giftRef);
    if (existing.exists) return true;

    tx.set(giftRef, {
      senderUid: sender,
      senderName: publicName(senderName, 'Liveboomer'),
      senderUsername: publicName(senderUsername, '').slice(0, 24),
      giftId: gift,
      giftName: publicName(giftName, gift),
      units: qty,
      status: 'confirmed',
      createdAtMs: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      postRef,
      {
        giftUnitsReceived: FieldValue.increment(qty),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  });
}

module.exports = { recordPostReceivedGift };
module.exports.recordPostReceivedGift = recordPostReceivedGift;
module.exports.default = module.exports;
