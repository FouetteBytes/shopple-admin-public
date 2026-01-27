import { NextRequest, NextResponse } from 'next/server';
import SessionManager from '@/lib/session-manager';
import { auditLogger } from '@/lib/audit-logger';
import { securityManager } from '@/lib/security-manager';
import { adminAuth } from '@/lib/firebase-admin-enhanced';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Firebase REST API for email/password sign-in (works on server-side)
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_SIGN_IN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

// Helper function to get client IP
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0] || realIP || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const clientIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Check rate limiting
    const rateLimitResult = await securityManager.checkRateLimit(clientIP, 'login');

    if (!rateLimitResult.allowed) {
      await auditLogger.logSecurityEvent({
        event: 'login_rate_limit_exceeded',
        severity: 'HIGH',
        adminId: 'unknown',
        adminEmail: email,
        clientIP,
        details: {
          reason: rateLimitResult.reason,
          retryAfter: rateLimitResult.retryAfter,
        },
      });

      return NextResponse.json(
        { 
          error: 'Too many login attempts. Please try again later.',
          retryAfter: rateLimitResult.retryAfter 
        },
        { status: 429 }
      );
    }

    try {
      // Authenticate with Firebase REST API (works on server-side)
      console.log('[Login] Attempting Firebase REST API auth for:', email);
      console.log('[Login] API Key present:', !!FIREBASE_API_KEY);
      
      const firebaseResponse = await fetch(FIREBASE_SIGN_IN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      });

      const firebaseData = await firebaseResponse.json();

      if (!firebaseResponse.ok) {
        // Firebase REST API returned an error
        const errorCode = firebaseData.error?.message || 'UNKNOWN_ERROR';
        console.error('[Login] Firebase REST API error:', errorCode);
        throw { code: `auth/${errorCode.toLowerCase().replace(/_/g, '-')}`, message: errorCode };
      }

      console.log('[Login] Firebase REST API auth successful for:', email);
      const idToken = firebaseData.idToken;
      const localId = firebaseData.localId; // This is the uid

      // Verify the ID token with Admin SDK to get custom claims
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      
      // Check if user has admin privileges
      const isAdmin = decodedToken.admin === true;
      const isSuperAdmin = decodedToken.superAdmin === true;
      const mustResetPassword = decodedToken.forcePasswordReset === true;

      if (!isAdmin) {
        // User is not an admin, log failed attempt
        await auditLogger.logSecurityEvent({
          event: 'login_failed_not_admin',
          severity: 'MEDIUM',
          adminId: localId,
          adminEmail: email,
          clientIP,
          details: {
            reason: 'insufficient_privileges',
            userAgent,
          },
        });

        return NextResponse.json(
          { error: 'Access denied. Admin privileges required.' },
          { status: 403 }
        );
      }

      // Create session
      const sessionData = await SessionManager.createSession(
        idToken,
        clientIP,
        userAgent
      );

      // Log successful login
      await auditLogger.logSecurityEvent({
        event: 'admin_login_success',
        severity: 'LOW',
        adminId: localId,
        adminEmail: email,
        clientIP,
        details: {
          sessionId: sessionData.sessionId,
          role: sessionData.role,
          isSuperAdmin,
          userAgent,
          forcePasswordReset: mustResetPassword,
        },
      });

      // Create response with session cookie
      const response = NextResponse.json({
        message: 'Login successful',
        user: {
          uid: localId,
          email: email,
          displayName: firebaseData.displayName || null,
          isAdmin: true,
          isSuperAdmin,
          role: sessionData.role,
          permissions: sessionData.permissions,
          mustResetPassword,
        },
        sessionId: sessionData.sessionId,
        requirePasswordReset: mustResetPassword,
      });

      // Set session cookie
      SessionManager.setSessionCookie(response, sessionData);

      return response;

    } catch (authError: any) {
      // Log failed login attempt with detailed error
      console.error('[Login] Firebase auth error:', authError.code, authError.message);
      await auditLogger.logSecurityEvent({
        event: 'admin_login_failed',
        severity: 'MEDIUM',
        adminId: 'unknown',
        adminEmail: email,
        clientIP,
        details: {
          error: authError.code || 'unknown_error',
          message: authError.message || 'no message',
          userAgent,
        },
      });

      // Return appropriate error message
      let errorMessage = 'Login failed';
      const errorCode = authError.code || '';
      switch (errorCode) {
        case 'auth/user-not-found':
        case 'auth/email-not-found':
          errorMessage = 'No admin account found with this email address';
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-password':
        case 'auth/invalid-login-credentials':
          errorMessage = 'Invalid password';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This admin account has been disabled';
          break;
        case 'auth/too-many-requests':
        case 'auth/too-many-attempts-try-later':
          errorMessage = 'Too many failed login attempts. Please try again later';
          break;
        default:
          errorMessage = `Authentication failed: ${errorCode || 'unknown error'}`;
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      );
    }

  } catch (error: any) {
    console.error('Login API error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
