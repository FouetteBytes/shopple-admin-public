// SQLite Database Manager for persistent storage in the browser
// This module only works on the client-side

interface ClearedActivity {
  id: string;
  store: string;
  category: string;
  crawler_id: string;
  original_timestamp: string;
  cleared_at: string;
  created_at: string;
}

interface ClearedResult {
  id: string;
  store: string;
  category: string;
  crawler_id: string;
  original_timestamp: string;
  cleared_at: string;
  created_at: string;
}

interface CrawlerResult {
  id: string;
  store: string;
  category: string;
  crawler_id: string;
  status: string;
  items_found: number;
  completed_at: string;
  timestamp: string;
  is_cleared: boolean;
  cleared_at?: string;
  created_at: string;
  updated_at: string;
}

// Dynamically import sql.js only on the client side
const loadSqlJs = async () => {
  if (typeof window === 'undefined') {
    // Return null for server-side
    return null;
  }
  
  try {
    const sqljs = await import('sql.js');
    return sqljs.default;
  } catch (error) {
    console.error('Failed to load sql.js:', error);
    return null;
  }
};

const getSqlJsWasmUrl = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const override = process.env.NEXT_PUBLIC_SQLJS_WASM_URL;
  if (override && override.trim().length > 0) {
    return override.trim();
  }

  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
  return `${window.location.origin}${basePath}/sql-wasm.wasm`;
};

class SQLiteManager {
  private db: any = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // SQLite database schema
  private readonly SCHEMA = {
    CLEARED_ACTIVITIES: `
      CREATE TABLE IF NOT EXISTS cleared_activities (
        id TEXT PRIMARY KEY,
        store TEXT NOT NULL,
        category TEXT NOT NULL,
        crawler_id TEXT NOT NULL,
        original_timestamp TEXT NOT NULL,
        cleared_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
    CLEARED_RESULTS: `
      CREATE TABLE IF NOT EXISTS cleared_results (
        id TEXT PRIMARY KEY,
        store TEXT NOT NULL,
        category TEXT NOT NULL,
        crawler_id TEXT NOT NULL,
        original_timestamp TEXT NOT NULL,
        cleared_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
    CRAWLER_RESULTS: `
      CREATE TABLE IF NOT EXISTS crawler_results (
        id TEXT PRIMARY KEY,
        store TEXT NOT NULL,
        category TEXT NOT NULL,
        crawler_id TEXT NOT NULL,
        status TEXT NOT NULL,
        items_found INTEGER DEFAULT 0,
        completed_at TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        is_cleared BOOLEAN DEFAULT FALSE,
        cleared_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    INDEXES: [
      'CREATE INDEX IF NOT EXISTS idx_cleared_activities_store_category ON cleared_activities(store, category);',
      'CREATE INDEX IF NOT EXISTS idx_cleared_activities_cleared_at ON cleared_activities(cleared_at);',
      'CREATE INDEX IF NOT EXISTS idx_cleared_results_store_category ON cleared_results(store, category);',
      'CREATE INDEX IF NOT EXISTS idx_cleared_results_cleared_at ON cleared_results(cleared_at);',
      'CREATE INDEX IF NOT EXISTS idx_crawler_results_store_category ON crawler_results(store, category);',
      'CREATE INDEX IF NOT EXISTS idx_crawler_results_status ON crawler_results(status);',
      'CREATE INDEX IF NOT EXISTS idx_crawler_results_is_cleared ON crawler_results(is_cleared);',
      'CREATE INDEX IF NOT EXISTS idx_crawler_results_completed_at ON crawler_results(completed_at);'
    ]
  };

  // Initialize SQLite database
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initializeDatabase();
    return this.initPromise;
  }

  private async _initializeDatabase(): Promise<void> {
    try {
      // Only run on client side
      if (typeof window === 'undefined') {
        console.log('SQLite database skipped on server side');
        return;
      }
      
      console.log('Initializing SQLite database...');
      
      // Dynamically load sql.js
      const initSqlJs = await loadSqlJs();
      if (!initSqlJs) {
        throw new Error('Failed to load sql.js');
      }
      
      const wasmUrl = getSqlJsWasmUrl();
      const fallbackBase = 'https://sql.js.org/dist/';
      const SQL = await initSqlJs({
        locateFile: (file: string) => {
          if (wasmUrl && file === 'sql-wasm.wasm') {
            return wasmUrl;
          }

          if (wasmUrl?.endsWith('sql-wasm.wasm')) {
            const base = wasmUrl.slice(0, wasmUrl.lastIndexOf('/') + 1);
            return `${base}${file}`;
          }

          return `${fallbackBase}${file}`;
        }
      });

      // Try to load existing database from localStorage
      const existingData = localStorage.getItem('sqlite_database');
      
      if (existingData) {
        try {
          const binaryData = new Uint8Array(
            atob(existingData).split('').map(char => char.charCodeAt(0))
          );
          this.db = new SQL.Database(binaryData);
          console.log('Loaded existing SQLite database from localStorage');
        } catch (error) {
          console.warn('Failed to load existing database, creating new one:', error);
          this.db = new SQL.Database();
        }
      } else {
        this.db = new SQL.Database();
        console.log('Created new SQLite database');
      }

      // Create tables and indexes
      this.db.run(this.SCHEMA.CLEARED_ACTIVITIES);
      this.db.run(this.SCHEMA.CLEARED_RESULTS);
      this.db.run(this.SCHEMA.CRAWLER_RESULTS);
      
      this.SCHEMA.INDEXES.forEach(indexSql => {
        this.db!.run(indexSql);
      });

      // Migrate old localStorage data if it exists
      await this.migrateFromLocalStorage();

      // Save database to localStorage
      this.saveToLocalStorage();

      this.initialized = true;
      console.log('SQLite database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SQLite database:', error);
      // Don't throw error to prevent breaking the app
      console.log('Falling back to localStorage-based storage');
    }
  }

  // Migrate data from old localStorage system
  private async migrateFromLocalStorage(): Promise<void> {
    if (typeof window === 'undefined' || !this.db) return;

    try {
      // Migrate cleared activities
      const oldClearedData = localStorage.getItem('clearedActivities');
      if (oldClearedData) {
        try {
          const oldActivities = JSON.parse(oldClearedData);
          if (Array.isArray(oldActivities) && oldActivities.length > 0) {
            console.log(`Migrating ${oldActivities.length} cleared activities from localStorage`);
            
            const stmt = this.db!.prepare(`
              INSERT OR REPLACE INTO cleared_activities 
              (id, store, category, crawler_id, original_timestamp, cleared_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            for (const activity of oldActivities) {
              // Skip invalid entries
              if (!activity || typeof activity !== 'object') continue;
              
              // Ensure all values are properly defined with fallbacks
              const id = activity.id || `${activity.store || 'unknown'}_${activity.category || 'unknown'}_${Date.now()}_${Math.random()}`;
              const store = activity.store || 'unknown';
              const category = activity.category || 'unknown';
              const crawlerId = activity.crawler_id || activity.id || '';
              const originalTimestamp = activity.original_timestamp || activity.timestamp || new Date().toISOString();
              const clearedAt = activity.cleared_at || new Date().toISOString();
              const createdAt = activity.created_at || activity.cleared_at || new Date().toISOString();

              stmt.run([
                id,
                store,
                category,
                crawlerId,
                originalTimestamp,
                clearedAt,
                createdAt
              ]);
            }
            
            stmt.free();
            console.log('Successfully migrated cleared activities');
          }
        } catch (parseError) {
          console.warn('Failed to parse old cleared activities, skipping migration:', parseError);
        }
        
        // Always remove the old data regardless of success/failure
        localStorage.removeItem('clearedActivities');
      }

      // Also remove other potential legacy localStorage items
      localStorage.removeItem('clearedResults');
      localStorage.removeItem('crawlerResults');
      
    } catch (error) {
      console.error('Error migrating from localStorage:', error);
      // Clear any potentially corrupted localStorage data
      try {
        localStorage.removeItem('clearedActivities');
        localStorage.removeItem('clearedResults');
        localStorage.removeItem('crawlerResults');
      } catch (clearError) {
        console.error('Failed to clear localStorage:', clearError);
      }
    }
  }

  // Save database to localStorage for persistence
  private saveToLocalStorage(): void {
    if (!this.db || typeof window === 'undefined') return;
    
    try {
      const data = this.db.export();
      const base64Data = btoa(Array.from(data as Uint8Array, (byte: number) => String.fromCharCode(byte)).join(''));
      localStorage.setItem('sqlite_database', base64Data);
    } catch (error) {
      console.error('Failed to save database to localStorage:', error);
    }
  }

  // Cleared Activities CRUD Operations
  async insertClearedActivity(activity: Omit<ClearedActivity, 'created_at'>): Promise<ClearedActivity | null> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return null;

    try {
      const now = new Date().toISOString();
      const clearedActivity: ClearedActivity = {
        ...activity,
        created_at: now
      };

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cleared_activities 
        (id, store, category, crawler_id, original_timestamp, cleared_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        clearedActivity.id,
        clearedActivity.store,
        clearedActivity.category,
        clearedActivity.crawler_id,
        clearedActivity.original_timestamp,
        clearedActivity.cleared_at,
        clearedActivity.created_at
      ]);

      stmt.free();
      this.saveToLocalStorage();
      
      console.log('Inserted cleared activity:', clearedActivity.id);
      return clearedActivity;
    } catch (error) {
      console.error('Error inserting cleared activity:', error);
      return null;
    }
  }

  async insertManyClearedActivities(activities: Omit<ClearedActivity, 'created_at'>[]): Promise<ClearedActivity[]> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return [];

    const inserted: ClearedActivity[] = [];
    const now = new Date().toISOString();

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cleared_activities 
        (id, store, category, crawler_id, original_timestamp, cleared_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const activity of activities) {
        const clearedActivity: ClearedActivity = {
          ...activity,
          created_at: now
        };

        stmt.run([
          clearedActivity.id,
          clearedActivity.store,
          clearedActivity.category,
          clearedActivity.crawler_id,
          clearedActivity.original_timestamp,
          clearedActivity.cleared_at,
          clearedActivity.created_at
        ]);

        inserted.push(clearedActivity);
      }

      stmt.free();
      this.saveToLocalStorage();
      
      console.log(`Inserted ${inserted.length} cleared activities`);
      return inserted;
    } catch (error) {
      console.error('Error inserting multiple cleared activities:', error);
      return [];
    }
  }

  async getAllClearedActivities(): Promise<ClearedActivity[]> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return [];

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM cleared_activities 
        ORDER BY cleared_at DESC
      `);

      const activities: ClearedActivity[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        activities.push({
          id: row['id'] as string,
          store: row['store'] as string,
          category: row['category'] as string,
          crawler_id: row['crawler_id'] as string,
          original_timestamp: row['original_timestamp'] as string,
          cleared_at: row['cleared_at'] as string,
          created_at: row['created_at'] as string
        });
      }

      stmt.free();
      return activities;
    } catch (error) {
      console.error('Error getting cleared activities:', error);
      return [];
    }
  }

  async isActivityCleared(store: string, category: string, timestamp: string, crawlerId?: string): Promise<boolean> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return false;

    try {
      // Generate the primary ID format used when inserting
      const activityId = `${store}_${category}_${crawlerId || 'no_id'}_${timestamp}`;
      
      // Only use exact ID match or very specific store+category+crawler_id match
      // Don't use broad store+category matching as it's too aggressive
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM cleared_activities 
        WHERE id = ? OR (store = ? AND category = ? AND crawler_id = ? AND original_timestamp = ?)
      `);

      const crawlerIdPart = crawlerId || 'no_id';
      stmt.bind([
        activityId,                    // Exact ID match
        store, category, crawlerIdPart, timestamp  // Specific match with timestamp
      ]);

      const result = stmt.step();
      const count = result ? stmt.getAsObject()['count'] as number : 0;
      
      stmt.free();
      
      if (count > 0) {
        console.log(`Activity marked as cleared: ${store}_${category} (crawler: ${crawlerIdPart}, timestamp: ${timestamp})`);
      }
      
      return count > 0;
    } catch (error) {
      console.error('Error checking if activity is cleared:', error);
      return false;
    }
  }

  async cleanupOldClearedActivities(keepCount: number = 50): Promise<void> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return;

    try {
      // Delete all but the most recent entries
      this.db.run(`
        DELETE FROM cleared_activities 
        WHERE id NOT IN (
          SELECT id FROM cleared_activities 
          ORDER BY cleared_at DESC 
          LIMIT ?
        )
      `, [keepCount]);

      this.saveToLocalStorage();
      console.log(`Cleaned up old cleared activities, keeping last ${keepCount}`);
    } catch (error) {
      console.error('Error cleaning up cleared activities:', error);
    }
  }

  async clearAllClearedActivities(): Promise<void> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return;

    try {
      this.db.run('DELETE FROM cleared_activities');
      this.saveToLocalStorage();
      console.log('Cleared all cleared activities');
    } catch (error) {
      console.error('Error clearing all cleared activities:', error);
    }
  }

  // Cleared Results CRUD Operations (separate from activities)
  async insertClearedResult(result: Omit<ClearedResult, 'created_at'>): Promise<ClearedResult | null> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return null;

    try {
      const now = new Date().toISOString();
      const clearedResult: ClearedResult = {
        ...result,
        created_at: now
      };

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cleared_results 
        (id, store, category, crawler_id, original_timestamp, cleared_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        clearedResult.id,
        clearedResult.store,
        clearedResult.category,
        clearedResult.crawler_id,
        clearedResult.original_timestamp,
        clearedResult.cleared_at,
        clearedResult.created_at
      ]);

      stmt.free();
      this.saveToLocalStorage();
      
      console.log('Inserted cleared result:', clearedResult.id);
      return clearedResult;
    } catch (error) {
      console.error('Error inserting cleared result:', error);
      return null;
    }
  }

  async insertManyClearedResults(results: Omit<ClearedResult, 'created_at'>[]): Promise<ClearedResult[]> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return [];

    const inserted: ClearedResult[] = [];
    const now = new Date().toISOString();

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cleared_results 
        (id, store, category, crawler_id, original_timestamp, cleared_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const result of results) {
        const clearedResult: ClearedResult = {
          ...result,
          created_at: now
        };

        stmt.run([
          clearedResult.id,
          clearedResult.store,
          clearedResult.category,
          clearedResult.crawler_id,
          clearedResult.original_timestamp,
          clearedResult.cleared_at,
          clearedResult.created_at
        ]);

        inserted.push(clearedResult);
      }

      stmt.free();
      this.saveToLocalStorage();
      
      console.log(`Inserted ${inserted.length} cleared results`);
      return inserted;
    } catch (error) {
      console.error('Error inserting multiple cleared results:', error);
      return [];
    }
  }

  async getAllClearedResults(): Promise<ClearedResult[]> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return [];

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM cleared_results 
        ORDER BY cleared_at DESC
      `);

      const results: ClearedResult[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          id: row['id'] as string,
          store: row['store'] as string,
          category: row['category'] as string,
          crawler_id: row['crawler_id'] as string,
          original_timestamp: row['original_timestamp'] as string,
          cleared_at: row['cleared_at'] as string,
          created_at: row['created_at'] as string
        });
      }

      stmt.free();
      return results;
    } catch (error) {
      console.error('Error getting cleared results:', error);
      return [];
    }
  }

  async isResultCleared(store: string, category: string, timestamp: string, crawlerId?: string): Promise<boolean> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return false;

    try {
      // Generate the primary ID format used when inserting
      const resultId = `${store}_${category}_${crawlerId || 'no_id'}_${timestamp}`;
      
      // Only use exact ID match or very specific match
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM cleared_results 
        WHERE id = ? OR (store = ? AND category = ? AND crawler_id = ? AND original_timestamp = ?)
      `);

      const crawlerIdPart = crawlerId || 'no_id';
      stmt.bind([
        resultId,                    // Exact ID match
        store, category, crawlerIdPart, timestamp  // Specific match with timestamp
      ]);

      const result = stmt.step();
      const count = result ? stmt.getAsObject()['count'] as number : 0;
      
      stmt.free();
      
      if (count > 0) {
        console.log(`Result marked as cleared: ${store}_${category} (crawler: ${crawlerIdPart}, timestamp: ${timestamp})`);
      }
      
      return count > 0;
    } catch (error) {
      console.error('Error checking if result is cleared:', error);
      return false;
    }
  }

  async clearAllClearedResults(): Promise<void> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return;

    try {
      this.db.run('DELETE FROM cleared_results');
      this.saveToLocalStorage();
      console.log('Cleared all cleared results');
    } catch (error) {
      console.error('Error clearing all cleared results:', error);
    }
  }

  // Database maintenance and stats
  async getStats(): Promise<{ clearedActivities: number; clearedResults: number; crawlerResults: number; databaseSize: number }> {
    await this.init();
    if (!this.db || typeof window === 'undefined') return { clearedActivities: 0, clearedResults: 0, crawlerResults: 0, databaseSize: 0 };

    try {
      const clearedActivitiesCount = this.db.exec('SELECT COUNT(*) as count FROM cleared_activities')[0]?.values[0]?.[0] as number || 0;
      const clearedResultsCount = this.db.exec('SELECT COUNT(*) as count FROM cleared_results')[0]?.values[0]?.[0] as number || 0;
      const crawlerResultsCount = this.db.exec('SELECT COUNT(*) as count FROM crawler_results')[0]?.values[0]?.[0] as number || 0;
      
      const dbData = localStorage.getItem('sqlite_database');
      const databaseSize = dbData ? dbData.length : 0;

      return {
        clearedActivities: clearedActivitiesCount,
        clearedResults: clearedResultsCount,
        crawlerResults: crawlerResultsCount,
        databaseSize
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      return { clearedActivities: 0, clearedResults: 0, crawlerResults: 0, databaseSize: 0 };
    }
  }

  // Close database connection
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.initPromise = null;
    }
  }
}

// Singleton instance
const sqliteManager = new SQLiteManager();

export { sqliteManager as SQLiteDB, type ClearedActivity, type ClearedResult, type CrawlerResult };
export default sqliteManager;
