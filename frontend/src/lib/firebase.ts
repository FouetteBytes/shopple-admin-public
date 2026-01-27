// Firebase configuration and initialization
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase configuration sourced from environment variables.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
// Validate required configuration before initializing to avoid build-time errors.
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

    // Use session persistence for client auth; avoid persistent storage for server-managed sessions.
    if (typeof window !== 'undefined') {
      setPersistence(auth, browserSessionPersistence);
    }
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    firebaseConfigured = false;
    // Initialize with placeholders for build-time compatibility.
    app = initializeApp({ ...firebaseConfig, apiKey: 'placeholder', projectId: 'placeholder' }, 'fallback');
    auth = getAuth(app);
    db = getFirestore(app);
  }
} else {
  // Build-time placeholder initialization when env vars are unavailable.
  if (typeof window !== 'undefined') {
    console.warn('Firebase client configuration missing. Client-side Firebase features (notes, real-time updates) will not work.');
  }
  // Use placeholder config for TypeScript/build compatibility
  app = initializeApp({ apiKey: 'placeholder', projectId: 'placeholder' }, 'build-placeholder');
  auth = getAuth(app);
  db = getFirestore(app);
}

// Helper to check whether Firebase is configured beyond build-time placeholders.
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
