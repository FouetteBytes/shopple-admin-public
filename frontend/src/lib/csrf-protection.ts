/**
 * CSRF Protection System
 * Implements double-submit cookie pattern for enhanced security
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHmac } from 'crypto';

const CSRF_SECRET = process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production';
const CSRF_TOKEN_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

export class CSRFProtection {
  /**
   * Generate a secure CSRF token
   */
  static generateToken(): string {
    const randomValue = randomBytes(32).toString('hex');
    const timestamp = Date.now().toString();
    const payload = `${randomValue}.${timestamp}`;
    
    // Create HMAC signature
    const signature = createHmac('sha256', CSRF_SECRET)
      .update(payload)
      .digest('hex');
    
    return `${payload}.${signature}`;
  }

  /**
   * Verify CSRF token
   */
  static verifyToken(token: string): boolean {
    try {
      if (!token) return false;
      
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      const [randomValue, timestamp, signature] = parts;
      const payload = `${randomValue}.${timestamp}`;
      
      // Verify signature
      const expectedSignature = createHmac('sha256', CSRF_SECRET)
        .update(payload)
        .digest('hex');
      
      if (signature !== expectedSignature) return false;
      
      // Check token age (30 minutes max)
      const tokenAge = Date.now() - parseInt(timestamp);
      const maxAge = 30 * 60 * 1000; // 30 minutes
      
      return tokenAge <= maxAge;
    } catch (error) {
      console.error('CSRF token verification error:', error);
      return false;
    }
  }

  /**
   * Set CSRF token in response cookie
   */
  static setTokenCookie(response: NextResponse, token: string): void {
    response.cookies.set(CSRF_TOKEN_NAME, token, {
      httpOnly: false, // Client needs to read this for CSRF protection
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60, // 30 minutes
      path: '/',
    });
  }

  /**
   * Get CSRF token from request
   */
  static getTokenFromRequest(request: NextRequest): string | null {
    // Try header first
    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    if (headerToken) return headerToken;
    
    // Fall back to cookie
    return request.cookies.get(CSRF_TOKEN_NAME)?.value || null;
  }

  /**
   * Validate CSRF protection for a request
   */
  static validateRequest(request: NextRequest): boolean {
    // Skip CSRF for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    const cookieToken = request.cookies.get(CSRF_TOKEN_NAME)?.value;
    const headerToken = request.headers.get(CSRF_HEADER_NAME);

    // Both tokens must be present and match
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return false;
    }

    return this.verifyToken(cookieToken);
  }

  /**
   * Create middleware for CSRF protection
   */
  static middleware() {
    return (request: NextRequest): NextResponse | null => {
      if (!this.validateRequest(request)) {
        return NextResponse.json(
          { error: 'CSRF token validation failed' },
          { status: 403 }
        );
      }
      return null;
    };
  }
}

/**
 * Hook to get CSRF token for client-side use
 */
export function useCSRFToken(): {
  token: string | null;
  setToken: (token: string) => void;
  getHeaders: () => Record<string, string>;
} {
  if (typeof window === 'undefined') {
    return {
      token: null,
      setToken: () => {},
      getHeaders: () => ({}),
    };
  }

  const getCookie = (name: string): string | null => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || null;
    }
    return null;
  };

  const token = getCookie(CSRF_TOKEN_NAME);

  return {
    token,
    setToken: (newToken: string) => {
      document.cookie = `${CSRF_TOKEN_NAME}=${newToken}; path=/; SameSite=Strict${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`;
    },
    getHeaders: () => {
      const headers: Record<string, string> = {};
      if (token) {
        headers[CSRF_HEADER_NAME] = token;
      }
      return headers;
    },
  };
}
