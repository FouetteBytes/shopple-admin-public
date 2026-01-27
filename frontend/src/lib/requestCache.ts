/**
 * Request cache and deduplication layer.
 *
 * Prevents duplicate in-flight requests and provides short-term caching
 * to reduce unnecessary API calls when multiple components need the same data.
 *
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class RequestCache {
  private inFlightRequests = new Map<string, Promise<any>>();
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5000; // 5 seconds

  /**
  * Fetch data with deduplication and caching.
  *
   * @param key - Unique identifier for this request
   * @param fetcher - Function that returns a Promise with the data
   * @param ttl - Time to live in milliseconds (default: 5000ms)
   * @returns Promise with the requested data
   */
  async fetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    // Check the cache first.
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      console.log(`[REQUEST CACHE] ✓ Cache hit for "${key}"`);
      return cached.data as T;
    }

    // Check whether the request is already in flight.
    if (this.inFlightRequests.has(key)) {
      console.log(`[REQUEST CACHE] ⚡ Deduplicating request for "${key}"`);
      return this.inFlightRequests.get(key) as Promise<T>;
    }

    // Execute a new request.
    console.log(`[REQUEST CACHE] ↻ Fetching fresh data for "${key}"`);
    const promise = fetcher();
    this.inFlightRequests.set(key, promise);

    try {
      const data = await promise;
      
      // Cache the result.
      this.cache.set(key, {
        data,
        timestamp: Date.now()
      });

      // Clean up in-flight tracking.
      this.inFlightRequests.delete(key);
      
      return data;
    } catch (error) {
      // Clean up on error.
      this.inFlightRequests.delete(key);
      throw error;
    }
  }

  /**
  * Clear a specific cache entry.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    console.log(`[REQUEST CACHE] ️  Invalidated cache for "${key}"`);
  }

  /**
  * Clear all cached data.
   */
  clear(): void {
    this.cache.clear();
    this.inFlightRequests.clear();
    console.log('[REQUEST CACHE] ️  Cleared all cache entries');
  }

  /**
  * Get current cache statistics.
   */
  getStats() {
    return {
      cachedItems: this.cache.size,
      inFlightRequests: this.inFlightRequests.size
    };
  }

  /**
  * Clean up expired cache entries.
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > this.DEFAULT_TTL * 2) {
        this.cache.delete(key);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`[REQUEST CACHE]  Cleaned up ${cleaned} expired entries`);
    }
  }
}

// Export the singleton instance.
export const requestCache = new RequestCache();

// Set up periodic cleanup every 30 seconds.
if (typeof window !== 'undefined') {
  setInterval(() => {
    requestCache.cleanup();
  }, 30000);
}

// Helper function for API requests.
export async function cachedFetch<T>(
  url: string,
  options?: RequestInit,
  ttl?: number
): Promise<T> {
  const cacheKey = `${url}-${JSON.stringify(options || {})}`;
  
  return requestCache.fetch(
    cacheKey,
    async () => {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    ttl
  );
}
