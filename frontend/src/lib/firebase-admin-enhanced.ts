/**
 * Enhanced Firebase Admin SDK Integration
 * Implements comprehensive authentication features based on Firebase Admin documentation
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth, UserRecord, ListUsersResult, CreateRequest, UpdateRequest } from 'firebase-admin/auth';
import { auditLogger } from './audit-logger';
import { securityManager } from './security-manager';

// Initialize Firebase Admin SDK
let _adminApp: App | undefined;
let _adminAuth: Auth | undefined;

// Helper function to parse private key from environment variable
// Handles various formats: with/without quotes, escaped newlines
function parsePrivateKey(key: string | undefined): string {
  if (!key) return '';
  // Remove surrounding quotes if present
  let cleaned = key.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  // Replace literal \n with actual newlines
  return cleaned.replace(/\\n/g, '\n');
}

try {
  if (!getApps().length) {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
      _adminApp = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    }
  } else {
    _adminApp = getApps()[0];
  }
  
  if (_adminApp) {
    _adminAuth = getAuth(_adminApp);
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
  // Don't throw error here to allow build to pass
}

export const adminApp = _adminApp as App;
export const adminAuth = _adminAuth as Auth;

// Custom claims interface
export interface CustomClaims {
  admin?: boolean;
  superAdmin?: boolean;
  role?: string;
  permissions?: string[];
  lastPasswordChange?: number;
  mfaEnabled?: boolean;
  sessionVersion?: number;
}

// Enhanced user record interface
export interface EnhancedUserRecord extends UserRecord {
  customClaims: CustomClaims;
  lastActivity?: number;
  loginAttempts?: number;
  lockedUntil?: number;
}

// Session management interface
export interface AdminSession {
  uid: string;
  email: string;
  role: string;
  permissions: string[];
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
}

// Active sessions storage (in production, use Redis or database)
const activeSessions = new Map<string, AdminSession>();

export class FirebaseAdminService {
  private auth: Auth;

  constructor() {
    this.auth = adminAuth;
  }

  // ============ USER MANAGEMENT ============

  /**
   * Create a new user with enhanced security
   */
  async createUser(userData: {
    email: string;
    password: string;
    displayName?: string;
    role: 'user' | 'admin' | 'super_admin';
    permissions?: string[];
  }): Promise<UserRecord> {
    try {
      const createRequest: CreateRequest = {
        email: userData.email,
        password: userData.password,
        displayName: userData.displayName,
        emailVerified: false,
        disabled: false,
      };

      const userRecord = await this.auth.createUser(createRequest);

      // Set custom claims
      const customClaims: CustomClaims = {
        admin: userData.role === 'admin' || userData.role === 'super_admin',
        superAdmin: userData.role === 'super_admin',
        role: userData.role,
        permissions: userData.permissions || [],
        lastPasswordChange: Date.now(),
        mfaEnabled: false,
        sessionVersion: 1,
      };

      await this.auth.setCustomUserClaims(userRecord.uid, customClaims);

      // Log user creation
      await auditLogger.logSecurityEvent({
        event: 'user_created',
        severity: 'MEDIUM',
        adminId: userRecord.uid,
        adminEmail: userData.email,
        clientIP: 'system',
        details: {
          role: userData.role,
          permissions: userData.permissions,
        },
      });

      return userRecord;
    } catch (error: any) {
      console.error('Error creating user:', error);
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  /**
   * Update user with enhanced validation
   */
  async updateUser(uid: string, updates: {
    email?: string;
    password?: string;
    displayName?: string;
    disabled?: boolean;
    emailVerified?: boolean;
  }): Promise<UserRecord> {
    try {
      const userRecord = await this.auth.updateUser(uid, updates);

      // If password was updated, increment session version to invalidate all sessions
      if (updates.password) {
        const existingClaims = userRecord.customClaims || {};
        const newClaims: CustomClaims = {
          ...existingClaims,
          lastPasswordChange: Date.now(),
          sessionVersion: (existingClaims.sessionVersion || 0) + 1,
        };

        await this.auth.setCustomUserClaims(uid, newClaims);
        
        // Invalidate all active sessions for this user
        this.invalidateUserSessions(uid);
      }

      // Log user update
      await auditLogger.logSecurityEvent({
        event: 'user_updated',
        severity: 'MEDIUM',
        adminId: uid,
        adminEmail: updates.email || userRecord.email || 'unknown',
        clientIP: 'system',
        details: {
          updates: Object.keys(updates),
          passwordChanged: !!updates.password,
        },
      });

      return userRecord;
    } catch (error: any) {
      console.error('Error updating user:', error);
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  /**
   * Delete user with audit logging
   */
  async deleteUser(uid: string): Promise<void> {
    try {
      const userRecord = await this.auth.getUser(uid);
      
      await this.auth.deleteUser(uid);
      
      // Invalidate all sessions
      this.invalidateUserSessions(uid);

      // Log user deletion
      await auditLogger.logSecurityEvent({
        event: 'user_deleted',
        severity: 'HIGH',
        adminId: uid,
        adminEmail: userRecord.email || 'unknown',
        clientIP: 'system',
        details: {
          displayName: userRecord.displayName,
        },
      });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  /**
   * List users with pagination
   */
  async listUsers(maxResults: number = 1000, pageToken?: string): Promise<ListUsersResult> {
    try {
      return await this.auth.listUsers(maxResults, pageToken);
    } catch (error: any) {
      console.error('Error listing users:', error);
      throw new Error(`Failed to list users: ${error.message}`);
    }
  }

  /**
   * Get user by UID
   */
  async getUser(uid: string): Promise<UserRecord> {
    try {
      return await this.auth.getUser(uid);
    } catch (error: any) {
      console.error('Error getting user:', error);
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<UserRecord> {
    try {
      return await this.auth.getUserByEmail(email);
    } catch (error: any) {
      console.error('Error getting user by email:', error);
      throw new Error(`Failed to get user by email: ${error.message}`);
    }
  }

  // ============ CUSTOM CLAIMS MANAGEMENT ============

  /**
   * Set custom claims for a user
   */
  async setCustomClaims(uid: string, claims: CustomClaims): Promise<void> {
    try {
      await this.auth.setCustomUserClaims(uid, claims);

      // Log custom claims change
      await auditLogger.logSecurityEvent({
        event: 'custom_claims_updated',
        severity: 'HIGH',
        adminId: uid,
        adminEmail: 'system',
        clientIP: 'system',
        details: {
          newClaims: claims,
        },
      });
    } catch (error: any) {
      console.error('Error setting custom claims:', error);
      throw new Error(`Failed to set custom claims: ${error.message}`);
    }
  }

  /**
   * Update user role and permissions
   */
  async updateUserRole(uid: string, role: string, permissions: string[] = []): Promise<void> {
    try {
      const userRecord = await this.auth.getUser(uid);
      const existingClaims = userRecord.customClaims || {};

      const newClaims: CustomClaims = {
        ...existingClaims,
        admin: role === 'admin' || role === 'super_admin',
        superAdmin: role === 'super_admin',
        role,
        permissions,
        sessionVersion: (existingClaims.sessionVersion || 0) + 1,
      };

      await this.setCustomClaims(uid, newClaims);

      // Invalidate all sessions to force re-authentication with new claims
      this.invalidateUserSessions(uid);
    } catch (error: any) {
      console.error('Error updating user role:', error);
      throw new Error(`Failed to update user role: ${error.message}`);
    }
  }

  // ============ TOKEN MANAGEMENT ============

  /**
   * Verify ID token with enhanced validation
   */
  async verifyIdToken(idToken: string, checkRevoked: boolean = true): Promise<any> {
    try {
      const decodedToken = await this.auth.verifyIdToken(idToken, checkRevoked);
      
      // Check if session is still valid
      const session = activeSessions.get(decodedToken.uid);
      if (session && session.expiresAt < Date.now()) {
        this.invalidateUserSessions(decodedToken.uid);
        throw new Error('Session expired');
      }

      return decodedToken;
    } catch (error: any) {
      console.error('Error verifying ID token:', error);
      throw new Error(`Failed to verify token: ${error.message}`);
    }
  }

  /**
   * Create custom token
   */
  async createCustomToken(uid: string, additionalClaims?: object): Promise<string> {
    try {
      return await this.auth.createCustomToken(uid, additionalClaims);
    } catch (error: any) {
      console.error('Error creating custom token:', error);
      throw new Error(`Failed to create custom token: ${error.message}`);
    }
  }

  /**
   * Revoke refresh tokens (force logout)
   */
  async revokeRefreshTokens(uid: string): Promise<void> {
    try {
      await this.auth.revokeRefreshTokens(uid);
      
      // Invalidate all active sessions
      this.invalidateUserSessions(uid);

      // Log token revocation
      await auditLogger.logSecurityEvent({
        event: 'tokens_revoked',
        severity: 'HIGH',
        adminId: uid,
        adminEmail: 'system',
        clientIP: 'system',
        details: {
          reason: 'admin_action',
        },
      });
    } catch (error: any) {
      console.error('Error revoking refresh tokens:', error);
      throw new Error(`Failed to revoke refresh tokens: ${error.message}`);
    }
  }

  // ============ SESSION MANAGEMENT ============

  /**
   * Create a new admin session
   */
  async createSession(uid: string, ipAddress: string, userAgent: string): Promise<AdminSession> {
    try {
      const user = await this.getUser(uid);
      const customClaims = user.customClaims as CustomClaims || {};

      const session: AdminSession = {
        uid,
        email: user.email || '',
        role: customClaims.role || 'user',
        permissions: customClaims.permissions || [],
        sessionId: this.generateSessionId(),
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        lastActivity: Date.now(),
        ipAddress,
        userAgent,
      };

      activeSessions.set(uid, session);

      // Log session creation
      await auditLogger.logSecurityEvent({
        event: 'session_created',
        severity: 'LOW',
        adminId: uid,
        adminEmail: user.email || 'unknown',
        clientIP: ipAddress,
        details: {
          sessionId: session.sessionId,
          role: session.role,
          userAgent,
        },
      });

      return session;
    } catch (error: any) {
      console.error('Error creating session:', error);
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  /**
   * Validate and refresh session
   */
  async validateSession(uid: string): Promise<AdminSession | null> {
    const session = activeSessions.get(uid);
    
    if (!session) {
      return null;
    }

    if (session.expiresAt < Date.now()) {
      activeSessions.delete(uid);
      return null;
    }

    // Update last activity
    session.lastActivity = Date.now();
    activeSessions.set(uid, session);

    return session;
  }

  /**
   * Invalidate user sessions
   */
  invalidateUserSessions(uid: string): void {
    activeSessions.delete(uid);
  }

  /**
   * Get active sessions for a user
   */
  getActiveSessions(uid: string): AdminSession[] {
    const session = activeSessions.get(uid);
    return session ? [session] : [];
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============ SECURITY UTILITIES ============

  /**
   * Check if user has specific permission
   */
  async hasPermission(uid: string, permission: string): Promise<boolean> {
    try {
      const user = await this.getUser(uid);
      const customClaims = user.customClaims as CustomClaims || {};
      
      return customClaims.permissions?.includes(permission) || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if user is admin
   */
  async isAdmin(uid: string): Promise<boolean> {
    try {
      const user = await this.getUser(uid);
      const customClaims = user.customClaims as CustomClaims || {};
      
      return customClaims.admin || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if user is super admin
   */
  async isSuperAdmin(uid: string): Promise<boolean> {
    try {
      const user = await this.getUser(uid);
      const customClaims = user.customClaims as CustomClaims || {};
      
      return customClaims.superAdmin || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Bulk user operations
   */
  async bulkUpdateUsers(operations: Array<{
    uid: string;
    updates: {
      email?: string;
      password?: string;
      displayName?: string;
      disabled?: boolean;
      emailVerified?: boolean;
    };
  }>): Promise<void> {
    try {
      const promises = operations.map(op => this.updateUser(op.uid, op.updates));
      await Promise.all(promises);
    } catch (error: any) {
      console.error('Error in bulk update:', error);
      throw new Error(`Failed to bulk update users: ${error.message}`);
    }
  }
}

// Export singleton instance
export const firebaseAdminService = new FirebaseAdminService();
