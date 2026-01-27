// Real Firebase service to get actual operations data
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, limit, orderBy, getDocs, enableNetwork, disableNetwork } from 'firebase/firestore';

// Firebase configuration for your real project
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "shopple-7a67b.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "shopple-7a67b",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "shopple-7a67b.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

class RealFirebaseService {
  private app: any;
  private db: any;
  private static instance: RealFirebaseService;

  constructor() {
    try {
      this.app = initializeApp(firebaseConfig);
      this.db = getFirestore(this.app);
    } catch (error) {
      console.error('Failed to initialize real Firebase:', error);
    }
  }

  static getInstance(): RealFirebaseService {
    if (!RealFirebaseService.instance) {
      RealFirebaseService.instance = new RealFirebaseService();
    }
    return RealFirebaseService.instance;
  }

  // Get real Firebase operations statistics
  async getRealOperationsStats() {
    try {
      if (!this.db) {
        throw new Error('Firebase not initialized');
      }

      // Get recent documents from various collections to estimate operations
      const collections = ['users', 'products', 'orders', 'notes', 'activities', 'logs'];
      let totalDocs = 0;
      const stats = {
        reads: 0,
        writes: 0,
        updates: 0,
        collections: {} as Record<string, number>,
        lastOperation: new Date().toISOString()
      };

      for (const collectionName of collections) {
        try {
          const q = query(
            collection(this.db, collectionName),
            orderBy('createdAt', 'desc'),
            limit(100)
          );
          
          const snapshot = await getDocs(q);
          const docCount = snapshot.size;
          totalDocs += docCount;
          
          // Estimate operations based on document counts and timestamps
          stats.collections[collectionName] = docCount;
          
          // For reads: estimate based on document access patterns
          stats.reads += docCount * 2; // Assume each doc is read twice on average
          
          // For writes: estimate based on recent document creation
          const recentDocs = snapshot.docs.filter(doc => {
            const data = doc.data();
            const createdAt = data.createdAt?.toDate?.() || new Date(data.createdAt || Date.now());
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
            return createdAt > hourAgo;
          });
          
          stats.writes += recentDocs.length;
          stats.updates += Math.floor(recentDocs.length * 0.3); // Assume 30% of writes are updates

        } catch (collectionError: any) {
          console.warn(`Could not access collection ${collectionName}:`, collectionError?.message || 'Unknown error');
          // Collection might not exist or no permissions
          stats.collections[collectionName] = 0;
        }
      }

      return {
        ...stats,
        totalOperations: stats.reads + stats.writes + stats.updates,
        totalDocuments: totalDocs,
        isConnected: true
      };

    } catch (error: any) {
      console.error('Failed to get real Firebase stats:', error);
      
      // Return fallback stats if Firebase is not accessible
      return {
        reads: 0,
        writes: 0,
        updates: 0,
        totalOperations: 0,
        totalDocuments: 0,
        collections: {} as Record<string, number>,
        lastOperation: new Date().toISOString(),
        isConnected: false,
        error: error?.message || 'Unknown error'
      };
    }
  }

  // Test Firebase connection
  async testConnection() {
    try {
      if (!this.db) {
        return { connected: false, error: 'Firebase not initialized' };
      }

      // Try to read from a simple collection
      const testQuery = query(collection(this.db, 'users'), limit(1));
      await getDocs(testQuery);
      
      return { connected: true, projectId: firebaseConfig.projectId };
    } catch (error: any) {
      return { 
        connected: false, 
        error: error?.message || 'Unknown error',
        projectId: firebaseConfig.projectId 
      };
    }
  }

  // Get Firebase project info
  getProjectInfo() {
    return {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
      storageBucket: firebaseConfig.storageBucket,
      isInitialized: !!this.db
    };
  }
}

export const realFirebaseService = RealFirebaseService.getInstance();
