/**
 * Reset levelXp to 0 for every user in Firestore.
 * Usage: node scripts/reset-level-xp.js
 */
require('dotenv').config();
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function loadServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

function initAdmin() {
  if (getApps().length > 0) return getFirestore();
  const sa = loadServiceAccount();
  if (sa) {
    initializeApp({ credential: cert(sa), projectId: sa.project_id || 'liveboom-app' });
  } else {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'liveboom-app' });
  }
  return getFirestore();
}

async function main() {
  const db = initAdmin();
  const snap = await db.collection('users').get();
  if (snap.empty) {
    console.log('No users found.');
    return;
  }

  let batch = db.batch();
  let ops = 0;
  let total = 0;

  for (const doc of snap.docs) {
    batch.update(doc.ref, { levelXp: 0 });
    ops += 1;
    total += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`Reset levelXp to 0 for ${total} users.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
