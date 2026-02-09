import { API_BASE_URL, getApiBaseUrl } from './api';

export interface ProductCatalogueMatch {
  id: string;
  name?: string;
  original_name?: string;
  brand_name?: string;
  category?: string;
  variety?: string;
  size?: string | number | null;
  sizeRaw?: string | null;
  sizeUnit?: string | null;
  image_url?: string | null;
  similarity?: number;
  matchReasons?: string[];
  isDuplicate?: boolean;
}

export async function searchCatalogue(
  query: string,
  options?: {
    limit?: number;
    signal?: AbortSignal;
    category?: string;
    brand?: string;
  }
): Promise<ProductCatalogueMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Build URL safely - handle both absolute URLs and relative paths
  const baseUrl = getApiBaseUrl();
  const searchPath = '/api/products';
  const params = new URLSearchParams();
  params.set('search', trimmed);
  params.set('page', '1');
  params.set('per_page', String(options?.limit ?? 15));
  if (options?.category) params.set('category', options.category);
  if (options?.brand) params.set('brand', options.brand);
  
  // If baseUrl is empty (same-origin), use relative path
  const url = baseUrl ? `${baseUrl}${searchPath}?${params.toString()}` : `${searchPath}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal: options?.signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Product search failed');
  }

  const data = await response.json();
  return (data.products as ProductCatalogueMatch[]) ?? [];
}
