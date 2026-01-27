// Firebase service for collecting operational usage metrics.
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, limit, orderBy, getDocs, enableNetwork, disableNetwork } from 'firebase/firestore';

// Firebase configuration for the active project.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ,
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

  // Retrieve Firebase operations statistics.
  async getRealOperationsStats() {
    try {
      if (!this.db) {
        throw new Error('Firebase not initialized');
      }

      // Retrieve recent documents to estimate operation volumes.
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
          
          // Estimate operations based on document counts and timestamps.
          stats.collections[collectionName] = docCount;
          
          // Estimate reads based on document access patterns.
          stats.reads += docCount * 2; // Assume each document is read twice on average.
          
          // Estimate writes based on recent document creation.
          const recentDocs = snapshot.docs.filter(doc => {
            const data = doc.data();
            const createdAt = data.createdAt?.toDate?.() || new Date(data.createdAt || Date.now());
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
            return createdAt > hourAgo;
          });
          
          stats.writes += recentDocs.length;
          stats.updates += Math.floor(recentDocs.length * 0.3); // Assume 30% of writes are updates.

        } catch (collectionError: any) {
          console.warn(`Could not access collection ${collectionName}:`, collectionError?.message || 'Unknown error');
          // The collection may not exist or permissions may be missing.
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
      
      // Return fallback stats when Firebase is not accessible.
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

  // Test Firebase connectivity.
  async testConnection() {
    try {
      if (!this.db) {
        return { connected: false, error: 'Firebase not initialized' };
      }

      // Attempt a read from a basic collection.
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

  // Get Firebase project metadata.
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
