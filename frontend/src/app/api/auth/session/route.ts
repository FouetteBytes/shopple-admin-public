import { NextRequest, NextResponse } from 'next/server';
import SessionManager from '@/lib/session-manager';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = SessionManager.getSessionCookie(request);
    const clientIP = SessionManager.getClientIP(request);

    if (!sessionCookie) {
      return NextResponse.json(
        { 
          authenticated: false,
          error: 'No session cookie found' 
        },
        { status: 401 }
      );
    }

    const session = await SessionManager.validateSession(sessionCookie, clientIP);
    
    if (!session) {
      const response = NextResponse.json(
        { 
          authenticated: false,
          error: 'Invalid or expired session' 
        },
        { status: 401 }
      );

      SessionManager.clearSessionCookie(response);
      return response;
    }

    if (!session.isAdmin) {
      const response = NextResponse.json(
        { 
          authenticated: false,
          error: 'Admin privileges required' 
        },
        { status: 403 }
      );

      await SessionManager.destroySession(sessionCookie);
      SessionManager.clearSessionCookie(response);
      return response;
    }

    // Return session info
    return NextResponse.json({
      authenticated: true,
      user: {
        uid: session.uid,
        email: session.email,
        role: session.role,
        permissions: session.permissions,
        isAdmin: session.isAdmin,
        isSuperAdmin: session.isSuperAdmin,
        mustResetPassword: session.mustResetPassword === true,
      },
      session: {
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
      }
    });

  } catch (error: any) {
    console.error('Session validation error:', error);
    
    return NextResponse.json(
      { 
        authenticated: false,
        error: 'Session validation failed' 
      },
      { status: 500 }
    );
  }
}
