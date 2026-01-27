import type { LimitMode } from '@/types/crawler'

// API service for communicating with Python backend
function resolveApiBaseUrl(): string {
  // 1. Runtime Configuration (Browser-side)
  // This allows the Docker image to be built once and configured at runtime via env-config.js
  if (typeof window !== 'undefined' && (window as any).__ENV__?.NEXT_PUBLIC_BACKEND_URL) {
    return (window as any).__ENV__.NEXT_PUBLIC_BACKEND_URL.replace(/\/$/, '');
  }

  // 2. Server-side internal URL (Docker networking)
  if (typeof window === 'undefined' && process.env.INTERNAL_BACKEND_URL) {
    return process.env.INTERNAL_BACKEND_URL.replace(/\/$/, '');
  }

  // 3. Build-time Configuration (Next.js default)
  const explicitUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, '');
  }


  const relativePath = process.env.NEXT_PUBLIC_BACKEND_RELATIVE_PATH?.trim();
  if (relativePath) {
    const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    return normalizedPath.replace(/\/$/, '');
  }

  // When no backend URL is configured, use same-origin requests
  // This is the default for Kubernetes/Ingress deployments where 
  // frontend and backend are behind the same domain
  if (process.env.NODE_ENV !== 'production') {
    console.warn('NEXT_PUBLIC_BACKEND_URL is not configured; defaulting to same-origin requests');
  }
  return '';
}

// Export as a function so it re-evaluates each time (for runtime config)
export function getApiBaseUrl(): string {
  return resolveApiBaseUrl();
}

// Also export as constant for backward compatibility
// But note: this is evaluated once at module load, so runtime config won't work
export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Authenticated fetch wrapper that includes session cookies
 * Use this for all API calls that require authentication
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',  // Always send session cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Authenticated fetch that also parses JSON response
 * Throws on non-2xx responses with error details
 */
export async function authFetchJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await authFetch(url, options);
  return parseJsonResponse(response);
}

async function parseJsonResponse(response: Response) {
  let data: any = null;
  try {
    data = await response.json();
  } catch (error) {
    // Some responses may not include JSON bodies; that's fine.
  }

  if (!response.ok) {
    const errorMessage = data?.error || data?.message || response.statusText || 'Request failed';
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).details = data;
    throw error;
  }

  return data;
}

export const systemAPI = {
  getServicesStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/api/system/services`, {
      credentials: 'include'  // Send session cookies for authentication
    });
    return parseJsonResponse(response);
  },
  restartService: async (serviceId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/system/services/${serviceId}/restart`, {
      method: 'POST',
      credentials: 'include'  // Send session cookies for authentication
    });
    return parseJsonResponse(response);
  },
  
  // OpenSearch storage management
  getOpenSearchStorage: async () => {
    const response = await fetch(`${API_BASE_URL}/api/audit/storage`, {
      credentials: 'include'
    });
    return parseJsonResponse(response);
  },
  optimizeOpenSearchStorage: async () => {
    const response = await fetch(`${API_BASE_URL}/api/audit/optimize`, {
      method: 'POST',
      credentials: 'include'
    });
    return parseJsonResponse(response);
  },
  cleanupOpenSearchStorage: async (percentage: number = 30) => {
    const response = await fetch(`${API_BASE_URL}/api/audit/cleanup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percentage })
    });
    return parseJsonResponse(response);
  },
  
  // OpenSearch product index
  getProductIndexStats: async () => {
    const response = await fetch(`${API_BASE_URL}/api/products/opensearch/stats`, {
      credentials: 'include'
    });
    return parseJsonResponse(response);
  },
  reindexProducts: async () => {
    const response = await fetch(`${API_BASE_URL}/api/products/opensearch/reindex`, {
      method: 'POST',
      credentials: 'include'
    });
    return parseJsonResponse(response);
  }
};

export const classificationAPI = {
  // Upload and classify products with detailed SSE streaming
  classifyProducts: async (
    products: any[],
    onProgress: (data: any) => void,
    useCacheForLookup: boolean = true,
    storeCacheAfterClassification: boolean = true,
    modelOverrides?: {
      groq?: string;
      openrouter?: string;
      cerebras?: string;
      gemini?: string;
    },
    options?: {
      signal?: AbortSignal;
      onJobId?: (jobId: string) => void;
    }
  ) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/classify`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          products,
          use_cache: useCacheForLookup,
          store_in_cache: storeCacheAfterClassification,
          model_overrides: modelOverrides || {},
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error('Classification failed');
      }

      // Handle streaming response for detailed progress updates
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let results: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk
          .split('\n')
          .filter((line) => line.trim() && line.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.replace('data: ', ''));

            // Pass all events to the progress handler for detailed processing
            onProgress(data);

            // Capture job id on first init event
            if (data.type === 'init' && data.job_id && options?.onJobId) {
              options.onJobId(data.job_id);
            }

            // Collect results for final return
            if (data.type === 'result') {
              results.push(data.result);
            } else if (data.type === 'complete') {
              return data.results || results;
            } else if (data.type === 'stopped') {
              // Early stop: return partial results if provided
              return data.results_so_far || results;
            }
          } catch (e) {
            console.error('Error parsing stream data:', e);
          }
        }
      }

      return results;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // Stop an active classification job on the backend
  stopClassification: async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/classify/stop/${jobId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to stop classification job');
      return await response.json();
    } catch (error) {
      console.error('Stop Classification API Error:', error);
      throw error;
    }
  },

  // Health check
  healthCheck: async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  // Get cache status
  getCacheStatus: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/cache/stats`);
      if (!response.ok) throw new Error('Failed to get cache status');
      return await response.json();
    } catch (error) {
      console.error('Cache API Error:', error);
      throw error;
    }
  },

  // Clear cache
  clearCache: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/cache/clear`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to clear cache');
      return await response.json();
    } catch (error) {
      console.error('Cache API Error:', error);
      throw error;
    }
  },

  // Save user-edited classified data to cache
  saveEditedDataToCache: async (products: any[]) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/cache/save-edited`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ products }),
      });
      if (!response.ok) throw new Error('Failed to save edited data to cache');
      return await response.json();
    } catch (error) {
      console.error('Cache Save API Error:', error);
      throw error;
    }
  },

  // Get crawler status
  getCrawlerStatus: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/status`);
      if (!response.ok) throw new Error('Failed to get crawler status');
      return await response.json();
    } catch (error) {
      console.error('Crawler API Error:', error);
      throw error;
    }
  },

  // Get product statistics
  getProductStats: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/stats`);
      if (!response.ok) throw new Error('Failed to get product statistics');
      return await response.json();
    } catch (error) {
      console.error('Product Stats API Error:', error);
      throw error;
    }
  },

  // Get pricing overview statistics
  getPricingStats: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/prices/overview/enhanced`);
      if (!response.ok) throw new Error('Failed to get pricing statistics');
      return await response.json();
    } catch (error) {
      console.error('Pricing Stats API Error:', error);
      throw error;
    }
  },

  saveResultsToCloud: async (
    payload: {
      results: any[]
      supermarket: string
      classification_date?: string
      custom_name?: string
      use_current_date?: boolean
      metadata?: Record<string, any>
    }
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/classification/storage/upload`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || 'Failed to save classification results to cloud')
    }
    return response.json()
  },

  listCloudResults: async () => {
    const response = await fetch(`${API_BASE_URL}/api/classification/storage/list`, {
      credentials: 'include',
    })
    if (!response.ok) {
      throw new Error('Failed to load classification cloud files')
    }
    return response.json()
  },

  downloadCloudResult: async (cloudPath: string) => {
    const response = await fetch(`${API_BASE_URL}/api/classification/storage/download`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloud_path: cloudPath })
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || 'Failed to download classification cloud file')
    }
    return response.json()
  },

  deleteCloudResult: async (cloudPath: string) => {
    const response = await fetch(`${API_BASE_URL}/api/classification/storage/delete`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloud_path: cloudPath })
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || 'Failed to delete classification cloud file')
    }
    return response.json()
  },

  updateCloudMetadata: async (cloudPath: string, updates: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE_URL}/api/classification/storage/update`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloud_path: cloudPath, updates })
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || 'Failed to update cloud metadata')
    }
    return response.json()
  },

  manualUploadCloudResult: async (payload: {
    results: any[]
    supermarket?: string
    classification_date?: string
    custom_name?: string
    filename?: string
  }) => {
    const response = await fetch(`${API_BASE_URL}/api/classification/storage/upload/manual`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || 'Failed to upload manual classification results')
    }
    return response.json()
  },

  listHistory: async (limit = 100) => {
    const response = await fetch(`${API_BASE_URL}/api/classification/history?limit=${limit}`, {
      credentials: 'include',
    })
    if (!response.ok) {
      throw new Error('Failed to load classification history')
    }
    return response.json()
  },

  createHistoryEvent: async (eventType: string, summary: string, details: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE_URL}/api/classification/history/event`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, summary, details })
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || 'Failed to create history event')
    }
    return response.json()
  },
};

// Crawler API service
export const crawlerAPI = {
  // Get system status
  getStatus: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/status`);
      if (!response.ok) throw new Error('Failed to get crawler status');
      return await response.json();
    } catch (error) {
      console.error('Crawler Status API Error:', error);
      throw error;
    }
  },

  // Get available crawlers
  getAvailableCrawlers: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/available`);
      if (!response.ok) throw new Error('Failed to get available crawlers');
      return await response.json();
    } catch (error) {
      console.error('Available Crawlers API Error:', error);
      throw error;
    }
  },

  // Start a single crawler
  startCrawler: async (
    store: string,
    category: string,
    maxItems?: number,
    headlessMode?: boolean,
    limitMode?: LimitMode
  ) => {
    try {
      const payload: Record<string, unknown> = { store, category };
      if (typeof maxItems === 'number') {
        payload.max_items = maxItems;
      }
      if (typeof headlessMode === 'boolean') {
        payload.headless_mode = headlessMode;
      }
      if (limitMode) {
        payload.limit_mode = limitMode;
      }
      const response = await fetch(`${API_BASE_URL}/api/crawler/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to start crawler');
      return await response.json();
    } catch (error) {
      console.error('Start Crawler API Error:', error);
      throw error;
    }
  },

  // Start multiple crawlers
  startMultipleCrawlers: async (
    crawlerSpecs: Array<{ store: string; category: string; max_items?: number; headless_mode?: boolean; limit_mode?: LimitMode }>,
    options?: { mode?: 'parallel' | 'sequential'; wait_for_completion?: boolean }
  ) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/start-multiple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          crawlers: crawlerSpecs,
          mode: options?.mode,
          wait_for_completion: options?.wait_for_completion,
        }),
      });
      if (!response.ok) throw new Error('Failed to start crawlers');
      return await response.json();
    } catch (error) {
      console.error('Start Multiple Crawlers API Error:', error);
      throw error;
    }
  },

  startCrawlerGroup: async (payload: {
    mode: 'store' | 'category' | 'all' | 'custom';
    batch_mode?: 'parallel' | 'sequential';
    store?: string;
    category?: string;
    stores?: string[];
    categories?: string[];
    crawlers?: Array<{ store: string; category: string; max_items?: number; headless_mode?: boolean; limit_mode?: LimitMode }>;
    max_items?: number;
    headless_mode?: boolean;
    limit_mode?: LimitMode;
  }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/start-group`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to start crawler group');
      return await response.json();
    } catch (error) {
      console.error('Start Crawler Group API Error:', error);
      throw error;
    }
  },

  // Stop a specific crawler
  stopCrawler: async (crawlerId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/stop/${crawlerId}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to stop crawler');
      return await response.json();
    } catch (error) {
      console.error('Stop Crawler API Error:', error);
      throw error;
    }
  },

  // Stop all crawlers
  stopAllCrawlers: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/stop-all`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to stop all crawlers');
      return await response.json();
    } catch (error) {
      console.error('Stop All Crawlers API Error:', error);
      throw error;
    }
  },

  // Get status of a specific crawler
  getCrawlerStatus: async (crawlerId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/status/${crawlerId}`);
      if (!response.ok) throw new Error('Failed to get crawler status');
      return await response.json();
    } catch (error) {
      console.error('Get Crawler Status API Error:', error);
      throw error;
    }
  },

  // Get status of all crawlers
  getAllCrawlerStatuses: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/status-all`);
      if (!response.ok) throw new Error('Failed to get all crawler statuses');
      return await response.json();
    } catch (error) {
      console.error('Get All Crawler Statuses API Error:', error);
      throw error;
    }
  },

  // Get results for a specific crawler
  getCrawlerResults: async (crawlerId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/results/${crawlerId}`);
      if (!response.ok) throw new Error('Failed to get crawler results');
      return await response.json();
    } catch (error) {
      console.error('Get Crawler Results API Error:', error);
      throw error;
    }
  },

  // Get all crawler results
  getAllResults: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/results`);
      if (!response.ok) throw new Error('Failed to get all results');
      return await response.json();
    } catch (error) {
      console.error('Get All Results API Error:', error);
      throw error;
    }
  },


  // List output files
  getOutputFiles: async () => {
    try {
      // Try the storage files endpoint first
      const response = await fetch(`${API_BASE_URL}/api/crawler/storage/files`);
      if (!response.ok) {
        // Fallback to the output files endpoint
        const fallbackResponse = await fetch(`${API_BASE_URL}/api/crawler/output-files`);
        if (!fallbackResponse.ok) throw new Error('Failed to get output files');
        return await fallbackResponse.json();
      }
      return await response.json();
    } catch (error) {
      console.error('Get Output Files API Error:', error);
      throw error;
    }
  },

  // Load specific file content
  loadFile: async (store: string, filename: string, category?: string) => {
    try {
      // If category is not provided, try to extract it from the filename or use a default
      const actualCategory = category || 'general';

      const response = await fetch(`${API_BASE_URL}/api/crawler/storage/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'view_file',
          store: store,
          category: actualCategory,
          filename: filename,
        }),
      });

      if (!response.ok) throw new Error('Failed to load file');
      return await response.json();
    } catch (error) {
      console.error('Load File API Error:', error);
      throw error;
    }
  },

  // Delete specific file
  deleteFile: async (store: string, filename: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/delete-file/${store}/${filename}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete file');
      return await response.json();
    } catch (error) {
      console.error('Delete File API Error:', error);
      throw error;
    }
  },

  // Aggregate crawler results
  aggregateResults: async (crawlerIds: string[]) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/aggregate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ crawler_ids: crawlerIds }),
      });
      if (!response.ok) throw new Error('Failed to aggregate results');
      return await response.json();
    } catch (error) {
      console.error('Aggregate Results API Error:', error);
      throw error;
    }
  },

  // Clear crawler results
  clearResults: async (resultIds?: string[], clearAll?: boolean) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/clear-results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          result_ids: resultIds || [],
          clear_all: clearAll || false,
        }),
      });
      if (!response.ok) throw new Error('Failed to clear results');
      return await response.json();
    } catch (error) {
      console.error('Clear Results API Error:', error);
      throw error;
    }
  },

  // Clear crawler activities (frontend compatibility)
  clearActivities: async (activityIds?: string[], clearAll?: boolean) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/clear-activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activity_ids: activityIds || [],
          clear_all: clearAll || false,
        }),
      });
      if (!response.ok) throw new Error('Failed to clear activities');
      return await response.json();
    } catch (error) {
      console.error('Clear Activities API Error:', error);
      throw error;
    }
  },

  // Delete single result
  deleteResult: async (resultId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/result/${resultId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete result');
      return await response.json();
    } catch (error) {
      console.error('Delete Result API Error:', error);
      throw error;
    }
  },

  listSchedules: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/schedules`);
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('List Schedules API Error:', error);
      throw error;
    }
  },

  createSchedule: async (payload: any) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Create Schedule API Error:', error);
      throw error;
    }
  },

  updateSchedule: async (scheduleId: string, payload: any) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Update Schedule API Error:', error);
      throw error;
    }
  },

  deleteSchedule: async (scheduleId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/schedules/${scheduleId}`, {
        method: 'DELETE',
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Delete Schedule API Error:', error);
      throw error;
    }
  },

  toggleSchedule: async (scheduleId: string, enabled: boolean) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/schedules/${scheduleId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Toggle Schedule API Error:', error);
      throw error;
    }
  },

  runScheduleNow: async (scheduleId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/crawler/schedules/${scheduleId}/run`, {
        method: 'POST',
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Run Schedule Now API Error:', error);
      throw error;
    }
  },
};

export default classificationAPI;

// Keys API service (secure)
export const keysAPI = {
  status: async () => {
    const res = await fetch(`${API_BASE_URL}/api/keys/status`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to get keys status');
    return res.json();
  },
  set: async (payload: Partial<{ groq: string; openrouter: string; gemini: string; cerebras: string }>) => {
    const res = await fetch(`${API_BASE_URL}/api/keys/set`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to save keys');
    return res.json();
  },
  test: async (provider: 'groq'|'openrouter'|'gemini'|'cerebras', model?: string) => {
    const res = await fetch(`${API_BASE_URL}/api/keys/test`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model }),
    });
    // Even on 400 we want the error JSON to show a helpful message
    try {
      const data = await res.json();
      return data;
    } catch {
      if (!res.ok) throw new Error('Failed to test key');
      return { ok: false } as any;
    }
  },
  reload: async () => {
    const res = await fetch(`${API_BASE_URL}/api/keys/reload`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to reload keys');
    return res.json();
  },
  allowedModels: async (): Promise<Record<string, string[]>> => {
    const res = await fetch(`${API_BASE_URL}/api/keys/allowed-models`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to get allowed models');
    return res.json();
  },
  defaultModels: async (): Promise<Record<string, string | null>> => {
    const res = await fetch(`${API_BASE_URL}/api/keys/default-models`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to get default models');
    return res.json();
  },
  saveAllowedModels: async (payload: Record<string, string[]> | { models: Record<string, string[]>; defaults?: Record<string, string | null> }) => {
    const res = await fetch(`${API_BASE_URL}/api/keys/allowed-models`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || 'Failed to update allowed models');
    }
    // Handle both legacy and new response formats
    return data as { ok: boolean; models: Record<string, string[]>; defaults?: Record<string, string | null> };
  },
};
