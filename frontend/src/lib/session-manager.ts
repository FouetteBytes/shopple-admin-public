/**
 * Enhanced Session Management System
 * Implements Firebase session cookies for persistent authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminApp, adminAuth } from './firebase-admin-enhanced';
import { auditLogger } from './audit-logger';

// Session configuration
const SESSION_CONFIG = {
  cookieName: 'admin-session',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' && process.env.DISABLE_SECURE_COOKIES !== 'true',
  sameSite: 'strict' as const,
  domain: process.env.COOKIE_DOMAIN,
};

export interface SessionData {
  uid: string;
  email: string;
  role: string;
  permissions: string[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  mustResetPassword?: boolean;
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
  sessionCookie: string;
}

export class SessionManager {
  private static adminAuth = adminAuth;

  /**
   * Create Firebase session cookie after successful authentication
   */
  static async createSession(
    idToken: string,
    ipAddress: string,
    userAgent: string
  ): Promise<SessionData> {
    try {
      // Create session cookie with 24 hour expiration
      const expiresIn = 24 * 60 * 60 * 1000; // 24 hours
      const sessionCookie = await this.adminAuth.createSessionCookie(idToken, { expiresIn });
      
      // Verify the session cookie to get claims
      const decodedClaims = await this.adminAuth.verifySessionCookie(sessionCookie, true);
      
      // Create session data
      const sessionData: SessionData = {
        uid: decodedClaims.uid,
        email: decodedClaims.email || '',
        role: decodedClaims.role || 'user',
        permissions: decodedClaims.permissions || [],
        isAdmin: decodedClaims.admin || false,
        isSuperAdmin: decodedClaims.superAdmin || false,
        mustResetPassword: decodedClaims.forcePasswordReset === true,
        sessionId: this.generateSessionId(),
        createdAt: Date.now(),
        lastActivity: Date.now(),
        ipAddress,
        userAgent,
        sessionCookie,
      };

      // Log session creation
      await auditLogger.logSecurityEvent({
        event: 'admin_session_created',
        severity: 'LOW',
        adminId: decodedClaims.uid,
        adminEmail: decodedClaims.email || '',
        clientIP: ipAddress,
        details: {
          sessionId: sessionData.sessionId,
          role: sessionData.role,
          userAgent,
        },
      });

      return sessionData;
    } catch (error: any) {
      console.error('Error creating session:', error);
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  /**
   * Validate session using Firebase session cookie
   */
  static async validateSession(sessionCookie: string, ipAddress: string): Promise<SessionData | null> {
    try {
      if (!sessionCookie) {
        return null;
      }

      // Verify session cookie with Firebase Admin SDK
      const decodedClaims = await this.adminAuth.verifySessionCookie(sessionCookie, true);
      
      // Create session data from claims
      const sessionData: SessionData = {
        uid: decodedClaims.uid,
        email: decodedClaims.email || '',
        role: decodedClaims.role || 'user',
        permissions: decodedClaims.permissions || [],
        isAdmin: decodedClaims.admin || false,
        isSuperAdmin: decodedClaims.superAdmin || false,
        mustResetPassword: decodedClaims.forcePasswordReset === true,
        sessionId: this.generateSessionId(),
        createdAt: decodedClaims.iat * 1000, // Convert to milliseconds
        lastActivity: Date.now(),
        ipAddress,
        userAgent: 'server',
        sessionCookie,
      };

      return sessionData;
    } catch (error: any) {
      // Only log errors that aren't expired sessions (normal logout/timeout)
      if (error?.errorInfo?.code !== 'auth/session-cookie-expired') {
        console.error('Error validating session:', error);
      }
      return null;
    }
  }

  /**
   * Destroy session by revoking tokens
   */
  static async destroySession(sessionCookie: string): Promise<void> {
    try {
      if (!sessionCookie) {
        return;
      }

      // Verify session cookie to get user ID
      const decodedClaims = await this.adminAuth.verifySessionCookie(sessionCookie, false);
      
      // Revoke refresh tokens to invalidate all sessions
      await this.adminAuth.revokeRefreshTokens(decodedClaims.uid);

      // Log session destruction
      await auditLogger.logSecurityEvent({
        event: 'admin_session_destroyed',
        severity: 'LOW',
        adminId: decodedClaims.uid,
        adminEmail: decodedClaims.email || '',
        clientIP: 'server',
        details: {
          reason: 'logout',
        },
      });
    } catch (error: any) {
      console.error('Error destroying session:', error);
      // Continue even if destruction fails
    }
  }

  /**
   * Set session cookie in response
   */
  static setSessionCookie(response: NextResponse, sessionData: SessionData): void {
    const options = {
      maxAge: SESSION_CONFIG.maxAge,
      httpOnly: SESSION_CONFIG.httpOnly,
      secure: SESSION_CONFIG.secure,
      sameSite: SESSION_CONFIG.sameSite,
      domain: SESSION_CONFIG.domain,
    };

    response.cookies.set(SESSION_CONFIG.cookieName, sessionData.sessionCookie, options);
  }

  /**
   * Get session cookie from request
   */
  static getSessionCookie(request: NextRequest): string | null {
    return request.cookies.get(SESSION_CONFIG.cookieName)?.value || null;
  }

  /**
   * Clear session cookie from response
   */
  static clearSessionCookie(response: NextResponse): void {
    response.cookies.set(SESSION_CONFIG.cookieName, '', {
      maxAge: 0,
      httpOnly: true,
      secure: SESSION_CONFIG.secure,
      sameSite: SESSION_CONFIG.sameSite,
      domain: SESSION_CONFIG.domain,
    });
  }

  /**
   * Get session ID from request (for legacy compatibility)
   */
  static getSessionId(request: NextRequest): string | null {
    return this.getSessionCookie(request);
  }

  /**
   * Get client IP address
   */
  static getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    const connectingIP = request.headers.get('x-connecting-ip');
    
    return forwarded?.split(',')[0] || realIP || connectingIP || 'unknown';
  }

  /**
   * Get user agent
   */
  static getUserAgent(request: NextRequest): string {
    return request.headers.get('user-agent') || 'unknown';
  }

  /**
   * Generate unique session ID
   */
  private static generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all active sessions (simplified version for admin management)
   */
  static async getAllActiveSessions(): Promise<any[]> {
    // Firebase session cookies do not provide a server-side session store.
    // Implement persistent session tracking in a database if required.
    // Return an empty array until a backing store is available.
    return [];
  }

  /**
   * Revoke user session by forcing token revocation
   */
  static async revokeUserSession(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Revoke all refresh tokens for the user
      await this.adminAuth.revokeRefreshTokens(userId);
      
      return { 
        success: true, 
        message: `All sessions revoked for user ${userId}` 
      };
    } catch (error) {
      console.error('Error revoking user session:', error);
      return { 
        success: false, 
        message: 'Failed to revoke user session' 
      };
    }
  }

  /**
   * Clean up expired sessions (for compatibility)
   */
  static cleanupExpiredSessions(): void {
    // With Firebase session cookies, cleanup is handled automatically
    // This method is kept for compatibility
  }
}

export default SessionManager;
