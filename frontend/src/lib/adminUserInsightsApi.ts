import { API_BASE_URL } from './api';
import { AvatarData, AvatarBackground } from './avatarTypes';

export interface AdminUserProfile {
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
  isBanned?: boolean;
}

export interface AdminUserPresence {
  state?: string;
  lastChanged?: string | null;
  source?: string | null;
  lastChangedMs?: number | null;
  customStatus?: string | null;
  statusEmoji?: string | null;
  statusMessage?: string | null;
}

export interface AdminUserQuickStats {
  shoppingLists: number;
  sharedLists: number;
  friends: number;
  recentSearches: number;
  aiSessions: number;
}

export interface AdminUserSummary {
  uid: string;
  profile?: AdminUserProfile | null;
  presence?: AdminUserPresence | null;
  stats?: AdminUserQuickStats;
}

export interface AdminUserSummariesResponse {
  users: AdminUserSummary[];
  updatedAt: string;
  totalCount?: number;
  onlineCount?: number;
}

export interface AdminFriendSummary {
  uid: string;
  displayName?: string | null;
  since?: string | null;
}

export interface AdminFriendsDetail {
  items: AdminFriendSummary[];
  onlineNow: string[];
  count: number;
}

export interface AdminShoppingListBudget {
  limit?: number | null;
  estimated?: number | null;
  remaining?: number | null;
  isOver?: boolean | null;
}

export interface AdminShoppingListSchedule {
  startDate?: string | null;
  endDate?: string | null;
}

export interface AdminShoppingListAssignmentHistoryEntry {
  actionType?: string | null;
  userId?: string | null;
  userName?: string | null;
  timestamp?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
}

export interface AdminShoppingListAssignment {
  itemId: string;
  assignedTo?: string | null;
  assignedBy?: string | null;
  assignedAt?: string | null;
  status?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  history?: AdminShoppingListAssignmentHistoryEntry[];
}

export interface AdminShoppingListMember {
  uid: string;
  role?: string | null;
  profile?: AdminUserProfile | null;
  invitedBy?: string | null;
  isActive?: boolean | null;
  joinedAt?: string | null;
  lastActive?: string | null;
  displayNameOverride?: string | null;
  profilePictureOverride?: string | null;
  permissions?: Record<string, unknown> | null;
}

export interface AdminShoppingListPendingInvite {
  uid: string;
  role?: string | null;
  invitedBy?: string | null;
  invitedAt?: string | null;
  message?: string | null;
}

export interface AdminShoppingListItemSummary {
  id: string;
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  notes?: string | null;
  isCompleted?: boolean | null;
  estimatedPrice?: number | null;
  addedBy?: string | null;
  addedAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  productId?: string | null;
}

export interface AdminShoppingListOwner {
  uid: string;
  profile?: AdminUserProfile | null;
}

export interface AdminShoppingListCollaborationMeta {
  isShared?: boolean | null;
  memberCount?: number | null;
  activeCount?: number | null;
  pendingCount?: number | null;
  viewerRole?: string | null;
  ownerId?: string | null;
  owner?: AdminUserProfile | null;
  settings?: Record<string, unknown> | null;
  itemAssignments?: AdminShoppingListAssignment[];
}

export interface AdminShoppingListSummary {
  id: string;
  name?: string | null;
  description?: string | null;
  iconId?: string | null;
  colorTheme?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastActivity?: string | null;
  schedule?: AdminShoppingListSchedule | null;
  totalItems?: number | null;
  completedItems?: number | null;
  distinctProducts?: number | null;
  distinctCompleted?: number | null;
  completionRate?: number | null;
  isShared?: boolean | null;
  budget?: AdminShoppingListBudget | null;
  members?: AdminShoppingListMember[];
  pendingInvites?: AdminShoppingListPendingInvite[];
  memberRoles?: Record<string, string>;
  collaboration?: AdminShoppingListCollaborationMeta | null;
  items?: AdminShoppingListItemSummary[];
  owner?: AdminShoppingListOwner | null;
}

export interface AdminSearchHistoryEntry {
  query?: string | null;
  timestamp?: string | null;
}

export interface AdminAISessionSummary {
  id: string;
  summary?: string | null;
  createdAt?: string | null;
  rating?: number | null;
  durationMs?: number | null;
  listId?: string | null;
  addedCount?: number | null;
  addedPhrases?: string[] | null;
  failedCount?: number | null;
  inputText?: string | null;
  status?: string | null;
  details?: Record<string, unknown> | null;
}

export interface AdminUserInsightsDetail {
  uid: string;
  profile?: AdminUserProfile | null;
  presence?: AdminUserPresence | null;
  shoppingLists: AdminShoppingListSummary[];
  friends: AdminFriendsDetail;
  searchHistory: AdminSearchHistoryEntry[];
  aiSessions: AdminAISessionSummary[];
  generatedAt: string;
}

export interface AdminTimelineEvent {
  type: string;
  timestamp: string;
  title?: string | null;
  source?: string | null;
  data?: Record<string, unknown> | null;
}

export interface AdminUserTimelineResponse {
  userId: string;
  events: AdminTimelineEvent[];
  generatedAt: string;
  presence?: AdminUserPresence | null;
}

export const adminUserInsightsApi = {
  async listOnlineUsers(limit?: number): Promise<AdminUserSummariesResponse> {
    const params = new URLSearchParams();
    if (typeof limit === 'number' && limit > 0) {
      params.set('limit', String(limit));
    }

    const response = await fetch(`${API_BASE_URL}/api/admin/users/online?${params.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load online users');
    }

    const data = await response.json();
    return {
      users: (data.users as AdminUserSummary[]) ?? [],
      updatedAt: data.updatedAt,
      totalCount: typeof data.totalCount === 'number' ? data.totalCount : undefined,
      onlineCount: typeof data.onlineCount === 'number' ? data.onlineCount : undefined,
    };
  },

  async getUserInsights(userId: string): Promise<AdminUserInsightsDetail> {
    const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/insights`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.status === 404) {
      throw new Error('User not found');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load user insights');
    }

    const data = await response.json();
    return data.user as AdminUserInsightsDetail;
  },

  async getUserTimeline(userId: string, limit?: number): Promise<AdminUserTimelineResponse> {
    const params = new URLSearchParams();
    if (typeof limit === 'number') {
      params.set('limit', String(limit));
    }

    const query = params.toString();
    const url = query
      ? `${API_BASE_URL}/api/admin/users/${userId}/timeline?${query}`
      : `${API_BASE_URL}/api/admin/users/${userId}/timeline`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.status === 404) {
      throw new Error('User not found');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load user timeline');
    }

    const data = await response.json();
    return data.timeline as AdminUserTimelineResponse;
  },
};
