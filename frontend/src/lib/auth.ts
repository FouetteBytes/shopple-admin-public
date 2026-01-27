// Authentication utilities and admin verification
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  User,
  IdTokenResult,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { auth } from './firebase';

export interface AdminUser extends User {
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  customClaims?: { [key: string]: any };
}

export interface UserRecord {
  uid: string;
  email: string;
  displayName?: string;
  disabled: boolean;
  emailVerified: boolean;
  creationTime: string;
  lastSignInTime?: string;
  customClaims: { [key: string]: any };
}

// Sign in with email and password
export const signInAdmin = async (email: string, password: string): Promise<AdminUser> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Get the ID token to check custom claims
    const tokenResult: IdTokenResult = await user.getIdTokenResult();
    
    // Check if user has admin claim
    const isAdmin = tokenResult.claims.admin === true;
    const isSuperAdmin = tokenResult.claims.superAdmin === true;
    
    if (!isAdmin) {
      // Sign out the user if they don't have admin privileges
      await signOut(auth);
      throw new Error('Access denied. Admin privileges required.');
    }
    
    return {
      ...user,
      isAdmin,
      isSuperAdmin,
      customClaims: tokenResult.claims
    } as AdminUser;
  } catch (error: any) {
    console.error('Admin sign in error:', error);
    throw new Error(error.message || 'Failed to sign in');
  }
};

// Sign out
export const signOutAdmin = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error: any) {
    console.error('Sign out error:', error);
    throw new Error('Failed to sign out');
  }
};

// Check if user has admin privileges
export const checkAdminStatus = async (user: User): Promise<boolean> => {
  try {
    const tokenResult: IdTokenResult = await user.getIdTokenResult(true); // Force refresh
    return tokenResult.claims.admin === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};

// Refresh user token to get updated custom claims
export const refreshUserToken = async (user: User): Promise<AdminUser | null> => {
  try {
    const tokenResult: IdTokenResult = await user.getIdTokenResult(true); // Force refresh
    const isAdmin = tokenResult.claims.admin === true;
    const isSuperAdmin = tokenResult.claims.superAdmin === true;
    
    return {
      ...user,
      isAdmin,
      isSuperAdmin,
      customClaims: tokenResult.claims
    } as AdminUser;
  } catch (error) {
    console.error('Error refreshing user token:', error);
    return null;
  }
};

// Auth state listener
export const onAdminAuthStateChanged = (callback: (user: AdminUser | null) => void) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const adminUser = await refreshUserToken(user);
        callback(adminUser);
      } catch (error) {
        console.error('Error in auth state change:', error);
        callback(null);
      }
    } else {
      callback(null);
    }
  });
};

// Authentication errors mapping
export const getAuthErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'No admin account found with this email address.';
    case 'auth/wrong-password':
      return 'Invalid password. Please try again.';
    case 'auth/invalid-email':
      return 'Invalid email address format.';
    case 'auth/user-disabled':
      return 'This admin account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    default:
      return 'Authentication failed. Please try again.';
  }
};

// Admin management API helpers
export const adminApi = {
  // List all users (using session-based auth)
  async listUsers(): Promise<UserRecord[]> {
    const response = await fetch('/api/admin/users', { 
      credentials: 'include' // Use session cookies instead of Bearer token
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to list users');
    }
    
    const data = await response.json();
    return data.users;
  },

  // Create new user
  async createUser(userData: {
    email: string;
    password: string;
    displayName?: string;
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    forcePasswordReset?: boolean;
  }): Promise<{ message: string; user: any }> {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Use session cookies
      body: JSON.stringify(userData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create user');
    }
    
    return response.json();
  },

  // Update user (roles, status, profile)
  async updateUser(uid: string, data: {
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    disabled?: boolean;
    displayName?: string;
  }): Promise<{ message: string }> {
    const response = await fetch(`/api/admin/users/${uid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Use session cookies
      body: JSON.stringify({ uid, ...data }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update user');
    }
    
    return response.json();
  },

  // Delete user
  async deleteUser(uid: string): Promise<{ message: string }> {
    const response = await fetch(`/api/admin/users?uid=${uid}`, {
      method: 'DELETE',
      credentials: 'include', // Use session cookies
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete user');
    }
    
    return response.json();
  },

  // Change password (secure endpoint)
  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const response = await fetch('/api/admin/change-password-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Use session cookies
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to change password');
    }
    
    return response.json();
  },

  // Emergency password reset (super admin only)
  async emergencyPasswordReset(targetUserId: string, newPassword: string): Promise<{ message: string }> {
    const response = await fetch('/api/admin/emergency-reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Use session cookies
      body: JSON.stringify({ targetUserId, newPassword }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset password');
    }
    
    return response.json();
  },
};
