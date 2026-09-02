let firestoreDb = undefined;

function loadServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (raw) {
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
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\\n/g, '\n');
  const projectId = String(process.env.FIREBASE_PROJECT_ID || 'liveboom-app').trim();
  if (clientEmail && privateKey) {
    return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
  }
  return null;
}

function getFirestoreDb() {
  if (firestoreDb !== undefined) return firestoreDb;
  try {
    const { cert, getApps, initializeApp } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    if (getApps().length === 0) {
      const sa = loadServiceAccount();
      const projectId =
        (sa && (sa.project_id || sa.projectId)) ||
        process.env.FIREBASE_PROJECT_ID ||
        'liveboom-app';
      if (sa) {
        initializeApp({
          credential: cert({
            projectId,
            clientEmail: sa.client_email || sa.clientEmail,
            privateKey: sa.private_key || sa.privateKey,
          }),
          projectId,
        });
      } else {
        initializeApp({ projectId });
      }
    }
    firestoreDb = getFirestore();
  } catch (error) {
    console.warn('[firebaseAdmin] Firestore no disponible:', error.message);
    firestoreDb = null;
  }
  return firestoreDb;
}

function firestoreConfigured() {
  return Boolean(getFirestoreDb());
}

module.exports = {
  getFirestoreDb,
  firestoreConfigured,
};
