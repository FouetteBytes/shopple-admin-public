import { useEffect, useState } from 'react';
import api, { crawlerAPI } from '@/lib/api';

interface PricingStats {
  success: boolean;
  supermarket_stats: Record<string, number>;
  category_stats: Record<string, { count: number; products: string[] }>;
  brand_stats: Record<string, { count: number; products: string[] }>;
}

interface CacheStatus {
  size: number;
  hitRate: number;
  storageUsed: string;
  totalRequests?: number;
  cacheHits?: number;
  cacheMisses?: number;
}

interface CrawlerStatus {
  active_crawlers: number;
  status?: string;
  message?: string;
}

interface DashboardData {
  pricingStats: PricingStats | null;
  cacheStatus: CacheStatus | null;
  crawlerStatus: CrawlerStatus | null;
  loading: boolean;
  errors: {
    pricing?: string;
    cache?: string;
    crawler?: string;
  };
}

/**
 * Custom hook to fetch all dashboard data in parallel
 * This prevents sequential API calls from blocking the UI
 */
export const useDashboardData = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<DashboardData>({
    pricingStats: null,
    cacheStatus: null,
    crawlerStatus: null,
    loading: true,
    errors: {},
  });

  const refresh = () => setRefreshKey((prev) => prev + 1);

  useEffect(() => {
    const fetchAllData = async () => {
      setData((prev) => ({ ...prev, loading: true }));

      // Fetch all data in parallel using Promise.allSettled
      // This allows all requests to run simultaneously
      const [pricingResult, cacheResult, crawlerResult] = await Promise.allSettled([
        api.getPricingStats(),
        api.getCacheStatus(),
        crawlerAPI.getStatus(),
      ]);

      const errors: { pricing?: string; cache?: string; crawler?: string } = {};

      // Handle pricing stats result
      let pricingStats: PricingStats | null = null;
      if (pricingResult.status === 'fulfilled') {
        pricingStats = pricingResult.value;
      } else {
        console.error('Failed to fetch pricing stats:', pricingResult.reason);
        errors.pricing = pricingResult.reason?.message || 'Failed to load pricing data';
      }

      // Handle cache status result
      let cacheStatus: CacheStatus | null = null;
      if (cacheResult.status === 'fulfilled') {
        cacheStatus = cacheResult.value;
      } else {
        console.error('Failed to fetch cache status:', cacheResult.reason);
        errors.cache = cacheResult.reason?.message || 'Failed to load cache data';
      }

      // Handle crawler status result
      let crawlerStatus: CrawlerStatus | null = null;
      if (crawlerResult.status === 'fulfilled') {
        crawlerStatus = crawlerResult.value;
      } else {
        console.error('Failed to fetch crawler status:', crawlerResult.reason);
        errors.crawler = crawlerResult.reason?.message || 'Failed to load crawler data';
      }

      setData({
        pricingStats,
        cacheStatus,
        crawlerStatus,
        loading: false,
        errors,
      });
    };

    fetchAllData();
  }, [refreshKey]);

  return { ...data, refresh };
};
