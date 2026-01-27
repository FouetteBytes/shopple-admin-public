import { NextRequest, NextResponse } from 'next/server';
import SessionManager from '@/lib/session-manager';
import { auditLogger } from '@/lib/audit-logger';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = SessionManager.getSessionCookie(request);
    const clientIP = SessionManager.getClientIP(request);

    if (sessionCookie) {
      const session = await SessionManager.validateSession(sessionCookie, clientIP);
      
      if (session) {
        // Log logout
        await auditLogger.logSecurityEvent({
          event: 'admin_logout',
          severity: 'LOW',
          adminId: session.uid,
          adminEmail: session.email,
          clientIP,
          details: {
            sessionId: session.sessionId,
            sessionDuration: Date.now() - session.createdAt,
            userAgent: request.headers.get('user-agent') || 'unknown',
          },
        });

        // Destroy session
        await SessionManager.destroySession(sessionCookie);
      }
    }

    // Create response and clear session cookie
    const response = NextResponse.json({
      message: 'Logout successful',
      timestamp: new Date().toISOString(),
    });

    SessionManager.clearSessionCookie(response);
    
    // Enhanced cache control headers to prevent any caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
    response.headers.set('Last-Modified', new Date().toUTCString());
    response.headers.set('ETag', '""');
    
    // Additional security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    
    // Clear authentication headers
    response.headers.set('Clear-Site-Data', '"cache", "cookies", "storage"');

    return response;

  } catch (error: any) {
    console.error('Logout API error:', error);
    
    // Even if there's an error, create a response that clears the session
    const response = NextResponse.json({
      message: 'Logout completed',
      error: 'Session cleanup may have failed',
    }, { status: 200 });
    
    SessionManager.clearSessionCookie(response);
    
    // Same cache control headers
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
    response.headers.set('Clear-Site-Data', '"cache", "cookies", "storage"');
    
    return response;
  }
}
