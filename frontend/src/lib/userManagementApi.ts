import { API_BASE_URL } from './api';

export interface BanUserRequest {
  reason?: string;
  expiresAt?: string; // ISO string
}

async function postRequest(path: string, body?: any) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || 'Request failed');
  }

  return await response.json().catch(() => ({}));
}

export const userManagementApi = {
  banUser: async (uid: string, data: BanUserRequest) => {
    return postRequest(`/api/admin/users/${uid}/ban`, data);
  },

  unbanUser: async (uid: string) => {
    return postRequest(`/api/admin/users/${uid}/unban`);
  },

  forceLogout: async (uid: string) => {
    return postRequest(`/api/admin/users/${uid}/force-logout`);
  },
};
