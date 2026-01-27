// Firebase configuration and initialization
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase configuration - you'll need to replace these with your actual Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
// Check if we have the required config before initializing
// This prevents build errors when env vars are missing during build time
const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let firebaseConfigured = false;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    firebaseConfigured = true;

    // Set persistence to session (will be cleared when browser tab is closed)
    // For server-side session management, we don't want client-side persistence
    if (typeof window !== 'undefined') {
      setPersistence(auth, browserSessionPersistence);
    }
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    firebaseConfigured = false;
    // Initialize with placeholder config for build time - will fail at runtime if used
    app = initializeApp({ ...firebaseConfig, apiKey: 'placeholder', projectId: 'placeholder' }, 'fallback');
    auth = getAuth(app);
    db = getFirestore(app);
  }
} else {
  // For build time when env vars are not available
  // Initialize with placeholder config - will show warning if used at runtime
  if (typeof window !== 'undefined') {
    console.warn('Firebase client configuration missing. Client-side Firebase features (notes, real-time updates) will not work.');
  }
  // Use placeholder config for TypeScript/build compatibility
  app = initializeApp({ apiKey: 'placeholder', projectId: 'placeholder' }, 'build-placeholder');
  auth = getAuth(app);
  db = getFirestore(app);
}

// Helper function to check if Firebase is properly configured (not just build-time placeholder)
export function isFirebaseConfigured(): boolean {
  return firebaseConfigured;
}

// Helper to get auth with configuration check
export function getFirebaseAuth(): Auth {
  return auth;
}

// Helper to get db with configuration check
export function getFirebaseDb(): Firestore {
  return db;
}

export { auth, db };
export default app;
