import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Env } from '../env.js';

export function initFirebaseAdmin(env: Env) {
  if (getApps().length > 0) {
    return getAuth();
  }

  const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  if (env.FIREBASE_CLIENT_EMAIL && privateKey) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      projectId: env.FIREBASE_PROJECT_ID,
    });
  } else {
    initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  }

  return getAuth();
}
