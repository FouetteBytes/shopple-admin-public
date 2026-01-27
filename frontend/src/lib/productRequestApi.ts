import { API_BASE_URL } from './api';
import { AvatarBackground, AvatarData } from './avatarTypes';

export type ProductRequestStatus = 'pending' | 'inReview' | 'approved' | 'completed' | 'rejected';
export type ProductRequestType = 'newProduct' | 'updateProduct' | 'reportError' | 'priceUpdate';

export interface StoreLocation {
  city?: string;
  branch?: string;
  aisle?: string;
  shelf?: string;
}

export interface ProductIssue {
  issueTypes?: string[];
  incorrectName?: string;
  correctName?: string;
  incorrectPrice?: string;
  correctPrice?: string;
  incorrectSize?: string;
  correctSize?: string;
  incorrectBrand?: string;
  correctBrand?: string;
  additionalDetails?: string;
}

export interface AssignedAdmin {
  adminId?: string;
  adminName?: string;
  assignedAt?: string;
}

export interface ProductRequestAdminNote {
  id: string;
  authorId?: string;
  authorName?: string;
  note: string;
  isPrivate?: boolean;
  visibility?: string;
  createdAt?: string;
}

export interface ProductRequestAttachment {
  filename: string;
  storagePath: string;
  contentType?: string;
  size?: number;
  width?: number | null;
  height?: number | null;
  uploadedAt?: string | null;
  signedUrl?: string | null;
}

export interface ProductRequestAIAnalysis {
  status?: string;
  summary?: string;
  recommendation?: string;
  confidence?: number;
  matchedProductId?: string | null;
  generatedProductId?: string | null;
  matches?: Array<{
    productId: string;
    name?: string;
    brand?: string;
    size?: string;
    category?: string;
    similarity?: number;
    reasons?: string[];
    imageUrl?: string;
    isDuplicate?: boolean;
  }>;
}

export interface ProductRequestActivity {
  id: string;
  timestamp?: string;
  action: string;
  actorId?: string;
  actorName?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface ProductRequestUserProfile {
  uid: string;
  fullName?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  effectivePhotoUrl?: string | null;
  resolvedPhotoUrl?: string | null;
  photoURL?: string | null;
  profileImageType?: string | null;
  customPhotoURL?: string | null;
  defaultImageId?: string | null;
  initials?: string | null;
  photoUpdatedAt?: string | null;
  backgroundUpdatedAt?: string | null;
  profileBackground?: AvatarBackground | null;
  avatar?: AvatarData | null;
  presence?: {
    state?: string;
    lastSeen?: string | null;
  } | null;
}

export interface ProductRequestSubmittedBy extends Record<string, unknown> {
  uid?: string;
  profile?: ProductRequestUserProfile | null;
}

export interface ProductRequestSummary {
  id: string;
  productName: string;
  brand?: string;
  store?: string;
  storeLocation?: StoreLocation | null;
  status: ProductRequestStatus;
  requestType: ProductRequestType;
  priority: string;
  createdAt?: string;
  updatedAt?: string;
  submittedBy?: ProductRequestSubmittedBy | null;
  taggedProductId?: string;
  issue?: ProductIssue | null;
  photoUrls?: string[];
  assignedTo?: AssignedAdmin | null;
  submissionSource?: string;
  aiAnalysis?: ProductRequestAIAnalysis;
  latestActivity?: {
    timestamp?: string;
    action?: string;
    actor?: string;
    actorName?: string;
    summary?: string;
  } | null;
  attachments?: ProductRequestAttachment[];
  labels?: string[];
}

export interface ProductRequestDetail extends ProductRequestSummary {
  description?: string;
  size?: string;
  categoryHint?: string;
  storeLocation?: StoreLocation | null;
  submissionSource?: string;
  submittedBy?: ProductRequestSubmittedBy | null;
  adminNotes?: ProductRequestAdminNote[];
  activity?: ProductRequestActivity[];
  attachments?: ProductRequestAttachment[];
}

export interface ProductRequestListResponse {
  items: ProductRequestSummary[];
  page: number;
  pageSize: number;
  total?: number | null;
  hasMore: boolean;
}

export interface BulkAcknowledgeResult {
  updated: number;
  failed: Array<{ id: string; reason?: string }>;
  items: ProductRequestDetail[];
}

export interface ProductRequestStats {
  status: Partial<Record<ProductRequestStatus, number>>;
  requestType: Partial<Record<ProductRequestType, number>>;
  priority: Partial<Record<string, number>>;
  recommendation?: Record<string, number>;
  totals?: {
    totalRequests?: number;
    requestsToday?: number;
    requestsThisWeek?: number;
    requestsThisMonth?: number;
    highPriority?: number;
  };
  recentRequests?: ProductRequestSummary[];
  total?: number;
}

type AdminIdentity = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

function buildAdminHeaders(admin?: AdminIdentity): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (admin?.id) headers['X-Admin-Id'] = admin.id;
  if (admin?.name) headers['X-Admin-Name'] = admin.name;
  if (admin?.email) headers['X-Admin-Email'] = admin.email;
  return headers;
}

export const productRequestsApi = {
  async list(params: {
    status?: string;
    requestType?: string;
    priority?: string;
    recommendation?: string;
    store?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ProductRequestListResponse> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.priority) query.set('priority', params.priority);
    if (params.recommendation) query.set('recommendation', params.recommendation);
    if (params.store) query.set('store', params.store);
    if (params.search) query.set('search', params.search);
    if (params.requestType) query.set('requestType', params.requestType);
    query.set('page', String(params.page ?? 1));
    query.set('pageSize', String(params.pageSize ?? 20));

    const response = await fetch(`${API_BASE_URL}/api/product-requests?${query.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to fetch product requests');
    }

    const data = await response.json();
    return {
      items: (data.items as ProductRequestSummary[]) ?? [],
      page: data.page ?? params.page ?? 1,
      pageSize: data.pageSize ?? params.pageSize ?? 20,
      total: data.total,
      hasMore: data.hasMore ?? false,
    };
  },

  async create(payload: Record<string, unknown>, admin?: AdminIdentity): Promise<ProductRequestDetail> {
    const response = await fetch(`${API_BASE_URL}/api/product-requests`, {
      method: 'POST',
      headers: buildAdminHeaders(admin),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to create product request');
    }

    const data = await response.json();
    return data.request as ProductRequestDetail;
  },

  async update(id: string, payload: Record<string, unknown>, admin?: AdminIdentity): Promise<ProductRequestDetail> {
    const response = await fetch(`${API_BASE_URL}/api/product-requests/${id}`, {
      method: 'PUT',
      headers: buildAdminHeaders(admin),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to update product request');
    }

    const data = await response.json();
    return data.request as ProductRequestDetail;
  },

  async addNote(id: string, note: string, admin?: AdminIdentity, options?: { isPrivate?: boolean }): Promise<ProductRequestDetail> {
    const response = await fetch(`${API_BASE_URL}/api/product-requests/${id}/notes`, {
      method: 'POST',
      headers: buildAdminHeaders(admin),
      body: JSON.stringify({ note, isPrivate: options?.isPrivate ?? false }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to add note');
    }

    const data = await response.json();
    return data.request as ProductRequestDetail;
  },


  async get(id: string, options?: { signal?: AbortSignal }): Promise<ProductRequestDetail> {
    // Add a timeout to prevent indefinite waits.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout.
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/product-requests/${id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: options?.signal || controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        throw new Error('Request not found');
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to load product request');
      }

      const data = await response.json();
      return data.request as ProductRequestDetail;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out - please try again');
      }
      throw err;
    }
  },

  async getStats(): Promise<ProductRequestStats> {
    const response = await fetch(`${API_BASE_URL}/api/product-requests/stats`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load stats');
    }

    const data = await response.json();
    return data.stats as ProductRequestStats;
  },

  async refreshMatcherCache(): Promise<{
    refreshed: boolean;
    cachedProducts: number;
    timestamp: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/api/product-requests/cache/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to refresh matcher cache');
    }

    const data = await response.json();
    return data.result;
  },

  async acknowledge(id: string, options?: { assignTo?: AssignedAdmin }, admin?: AdminIdentity): Promise<ProductRequestDetail> {
    const response = await fetch(`${API_BASE_URL}/api/product-requests/${id}/acknowledge`, {
      method: 'POST',
      headers: buildAdminHeaders(admin),
      body: JSON.stringify({ assignTo: options?.assignTo }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to acknowledge request');
    }

    const data = await response.json();
    return data.request as ProductRequestDetail;
  },

  async bulkAcknowledge(
    requestIds: string[],
    options?: { assignTo?: AssignedAdmin },
    admin?: AdminIdentity
  ): Promise<BulkAcknowledgeResult> {
    const response = await fetch(`${API_BASE_URL}/api/product-requests/acknowledge/bulk`, {
      method: 'POST',
      headers: buildAdminHeaders(admin),
      body: JSON.stringify({ requestIds, assignTo: options?.assignTo }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to bulk acknowledge requests');
    }

    const data = await response.json();
    return {
      updated: data.updated ?? 0,
      failed: (data.failed as Array<{ id: string; reason?: string }>) ?? [],
      items: (data.items as ProductRequestDetail[]) ?? [],
    };
  },
};
