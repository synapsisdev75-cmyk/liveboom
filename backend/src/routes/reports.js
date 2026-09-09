const crypto = require('crypto');
const express = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const { asFn } = require('../lib/asFn');
const { getAdminDb, firestoreConfigured } = require('../lib/firestoreAdmin');
const { sendReportEmail } = require('../lib/sendReportEmail');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

const REASON_MAX = 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;

function sanitizeReason(raw) {
  return String(raw || '')
    .replace(/\0/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, REASON_MAX);
}

function chatIdFor(a, b) {
  return [String(a), String(b)].sort().join('_');
}

function publicChip(uid, data) {
  const row = data || {};
  return {
    uid: String(uid),
    username: String(row.username || row.handle || '').replace(/^@/, '').toLowerCase(),
    displayName: String(row.displayName || row.username || 'Usuario'),
  };
}

async function assertRateLimit(db, uid) {
  const ref = db.collection('reportThrottle').doc(uid);
  const snap = await ref.get();
  const now = Date.now();
  const recent = (snap.exists && Array.isArray(snap.data().at) ? snap.data().at : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && now - value < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    const error = new Error('Demasiados reportes. Intenta de nuevo más tarde.');
    error.status = 429;
    throw error;
  }
  recent.push(now);
  await ref.set({ at: recent, updatedAt: FieldValue.serverTimestamp() });
}

router.post('/', requireAuth, async (req, res) => {
  try {
    if (!firestoreConfigured()) {
      res.status(503).json({ error: 'Reportes no disponibles en este momento' });
      return;
    }

    const reporterUid = String(req.user?.uid || '').trim();
    const reportedUserId = String(req.body?.reportedUserId || '').trim();
    const reason = sanitizeReason(req.body?.reason);

    if (!reporterUid) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }
    if (!reportedUserId || reportedUserId.length > 128) {
      res.status(400).json({ error: 'Usuario reportado inválido' });
      return;
    }
    if (reportedUserId === reporterUid) {
      res.status(400).json({ error: 'No puedes reportarte a ti mismo' });
      return;
    }
    if (!reason) {
      res.status(400).json({ error: 'Escribe el motivo del reporte.' });
      return;
    }

    const db = getAdminDb();
    await assertRateLimit(db, reporterUid);

    const [reportedSnap, reporterSnap] = await Promise.all([
      db.collection('users').doc(reportedUserId).get(),
      db.collection('users').doc(reporterUid).get(),
    ]);

    if (!reportedSnap.exists) {
      res.status(404).json({ error: 'El usuario reportado no existe' });
      return;
    }

    const reported = publicChip(reportedUserId, reportedSnap.data());
    const reporter = publicChip(reporterUid, reporterSnap.data());
    if (!reporter.username) {
      reporter.username = String(req.user.email || '').split('@')[0] || reporterUid.slice(0, 12);
      reporter.displayName = String(req.user.name || reporter.displayName);
    }

    const expectedChatId = chatIdFor(reporterUid, reportedUserId);
    const incomingChatId = String(req.body?.conversationId || '').trim();
    const conversationId = incomingChatId && incomingChatId === expectedChatId ? incomingChatId : expectedChatId;
    const timestamp = new Date().toISOString();
    const reportId = crypto.randomUUID();

    const doc = {
      reportId,
      reporterUserId: reporterUid,
      reportedUserId,
      conversationId,
      reason,
      type: 'report',
      status: 'pending',
      context: 'Chat / Mensajes',
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      emailSent: false,
      emailError: null,
      reporterSnapshot: reporter,
      reportedSnapshot: reported,
    };

    await db.collection('reports').doc(reportId).set(doc);

    let emailSent = false;
    let emailError = null;
    try {
      await sendReportEmail({
        reported,
        reporter,
        timestamp,
        conversationId,
        reason,
      });
      emailSent = true;
      await db.collection('reports').doc(reportId).set(
        { emailSent: true, emailError: null, emailSentAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    } catch (error) {
      emailError = error && error.message ? String(error.message).slice(0, 400) : 'email_failed';
      console.error('[reports] email failed', reportId, emailError);
      await db.collection('reports').doc(reportId).set(
        { emailSent: false, emailError },
        { merge: true },
      );
    }

    res.status(201).json({ ok: true, reportId, emailSent, emailError: emailSent ? null : emailError });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status === 429) {
      res.status(429).json({ error: error.message });
      return;
    }
    console.error('[reports] create failed', error);
    res.status(500).json({ error: 'No se pudo guardar el reporte' });
  }
});

module.exports = router;
module.exports.default = router;
