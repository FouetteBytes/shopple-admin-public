/**
 * Intelligent caching utility for reducing API calls and improving performance
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

class IntelligentCache {
  private storage: Storage;
  private prefix: string;

  constructor(useSessionStorage = false) {
    this.storage = useSessionStorage ? sessionStorage : localStorage;
    this.prefix = 'app_cache_';
  }

  /**
   * Set cache with automatic expiry
   */
  set<T>(key: string, data: T, ttlMinutes: number = 30): void {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + (ttlMinutes * 60 * 1000)
    };

    try {
      this.storage.setItem(this.prefix + key, JSON.stringify(item));
    } catch (error) {
      console.warn('Cache storage failed:', error);
      // If storage is full, try to clear old items
      this.clearExpired();
      try {
        this.storage.setItem(this.prefix + key, JSON.stringify(item));
      } catch (retryError) {
        console.error('Cache storage failed after cleanup:', retryError);
      }
    }
  }

  /**
   * Get cached data if not expired
   */
  get<T>(key: string): T | null {
    try {
      const itemStr = this.storage.getItem(this.prefix + key);
      if (!itemStr) return null;

      const item: CacheItem<T> = JSON.parse(itemStr);
      
      // Check if expired
      if (Date.now() > item.expiry) {
        this.remove(key);
        return null;
      }

      return item.data;
    } catch (error) {
      console.warn('Cache retrieval failed:', error);
      this.remove(key);
      return null;
    }
  }

  /**
   * Check if cache has valid (non-expired) data
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Remove specific cache item
   */
  remove(key: string): void {
    this.storage.removeItem(this.prefix + key);
  }

  /**
   * Clear all expired cache items
   */
  clearExpired(): void {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) {
        try {
          const itemStr = this.storage.getItem(key);
          if (itemStr) {
            const item: CacheItem<any> = JSON.parse(itemStr);
            if (Date.now() > item.expiry) {
              keysToRemove.push(key);
            }
          }
        } catch (error) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => this.storage.removeItem(key));
  }

  /**
   * Clear all cache items with this prefix
   */
  clearAll(): void {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => this.storage.removeItem(key));
  }

  /**
   * Clear all cache items that match a pattern
   */
  clearPattern(pattern: string): void {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) {
        const actualKey = key.replace(this.prefix, '');
        if (actualKey.includes(pattern)) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => this.storage.removeItem(key));
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; items: number; expired: number } {
    let size = 0;
    let items = 0;
    let expired = 0;

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) {
        items++;
        const itemStr = this.storage.getItem(key);
        if (itemStr) {
          size += itemStr.length;
          try {
            const item: CacheItem<any> = JSON.parse(itemStr);
            if (Date.now() > item.expiry) {
              expired++;
            }
          } catch (error) {
            expired++;
          }
        }
      }
    }

    return { size, items, expired };
  }

  /**
   * Get detailed cache statistics
   */
  statistics(): {
    totalEntries: number;
    storageSize: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    let totalEntries = 0;
    let storageSize = 0;
    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) {
        totalEntries++;
        const itemStr = this.storage.getItem(key);
        if (itemStr) {
          storageSize += itemStr.length;
          try {
            const item: CacheItem<any> = JSON.parse(itemStr);
            if (oldestTimestamp === null || item.timestamp < oldestTimestamp) {
              oldestTimestamp = item.timestamp;
            }
            if (newestTimestamp === null || item.timestamp > newestTimestamp) {
              newestTimestamp = item.timestamp;
            }
          } catch (error) {
            // Skip invalid items
          }
        }
      }
    }

    return {
      totalEntries,
      storageSize: Math.round(storageSize / 1024), // KB
      oldestEntry: oldestTimestamp ? new Date(oldestTimestamp) : null,
      newestEntry: newestTimestamp ? new Date(newestTimestamp) : null,
    };
  }

  /**
   * Cleanup utility for app initialization
   */
  async cleanup(): Promise<void> {
    console.log('️ Initializing cache system...');
    
    try {
      // Clean expired entries from both caches
      this.clearExpired();
      
      // Log cache statistics
      const localStats = this.getStats();
      const sessionStats = this.getStats();
      
      console.log(' Cache Statistics:');
      console.log('- Local Cache:', {
        entries: localStats.items,
        size: `${(localStats.size / 1024).toFixed(2)}KB`,
        oldestEntry: localStats.expired,
        newestEntry: localStats.items - localStats.expired
      });
      console.log('- Session Cache:', {
        entries: sessionStats.items,
        size: `${(sessionStats.size / 1024).toFixed(2)}KB`,
        oldestEntry: sessionStats.expired,
        newestEntry: sessionStats.items - sessionStats.expired
      });
      
      console.log('✅ Cache system initialized successfully');
    } catch (error) {
      console.error('❌ Cache initialization failed:', error);
    }
  }
}

// Create singleton instances
export const localCache = new IntelligentCache(false);
export const sessionCache = new IntelligentCache(true);

// Cache key generators
export const cacheKeys = {
  priceStats: () => 'price_stats',
  enhancedProducts: (page: number, filters: string) => `enhanced_products_${page}_${filters}`,
  priceHistory: (productId: string) => `price_history_${productId}`,
  currentPrices: (productId: string) => `current_prices_${productId}`,
  supermarkets: () => 'supermarkets',
  productOverview: (filters: string) => `product_overview_${filters}`,
};

// Auto-cleanup on app start
localCache.clearExpired();
sessionCache.clearExpired();

// Cleanup utility for app initialization
export const initializeCacheSystem = async () => {
  console.log('️ Initializing cache system...');
  
  try {
    // Clean expired entries from both caches
    await localCache.cleanup();
    await sessionCache.cleanup();
    
    // Log cache statistics
    const localStats = await localCache.statistics();
    const sessionStats = await sessionCache.statistics();
    
    console.log(' Cache Statistics:');
    console.log('- Local Cache:', {
      entries: localStats.totalEntries,
      size: `${localStats.storageSize}KB`,
      oldestEntry: localStats.oldestEntry,
      newestEntry: localStats.newestEntry
    });
    console.log('- Session Cache:', {
      entries: sessionStats.totalEntries,
      size: `${sessionStats.storageSize}KB`,
      oldestEntry: sessionStats.oldestEntry,
      newestEntry: sessionStats.newestEntry
    });
    
    console.log('✅ Cache system initialized successfully');
  } catch (error) {
    console.error('❌ Cache initialization failed:', error);
  }
};

// Auto-cleanup function to run periodically
export const startCacheCleanupTimer = () => {
  // Clean up every 30 minutes
  const cleanupInterval = setInterval(async () => {
    console.log(' Running scheduled cache cleanup...');
    try {
      await localCache.cleanup();
      await sessionCache.cleanup();
      console.log('✅ Scheduled cleanup completed');
    } catch (error) {
      console.error('❌ Scheduled cleanup failed:', error);
    }
  }, 30 * 60 * 1000); // 30 minutes

  // Return cleanup function
  return () => {
    clearInterval(cleanupInterval);
    console.log(' Cache cleanup timer stopped');
  };
};
