import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@liveboom/dataconnect';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyD6yhYWmqccpziTBaAWnZ0lCvppUnIYS8M',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'liveboom-app.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'liveboom-app',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1092886082330',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1092886082330:web:45b234f0daf42b30a8b2a3',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const dataConnect = getDataConnect(firebaseApp, connectorConfig);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('email');
googleProvider.addScope('profile');
