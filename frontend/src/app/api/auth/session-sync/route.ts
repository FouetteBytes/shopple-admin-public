import { NextRequest, NextResponse } from 'next/server';
import SessionManager from '@/lib/session-manager';
import { adminAuth } from '@/lib/firebase-admin-enhanced';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Set up SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  const sessionCookie = SessionManager.getSessionCookie(request);
  if (!sessionCookie) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const session = await SessionManager.validateSession(
    sessionCookie, 
    SessionManager.getClientIP(request)
  );

  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const data = `data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`;
      controller.enqueue(encoder.encode(data));

      // Set up periodic ping to keep connection alive
      const pingInterval = setInterval(() => {
        try {
          const ping = `data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`;
          controller.enqueue(encoder.encode(ping));
        } catch (error) {
          console.error('Failed to send ping:', error);
          clearInterval(pingInterval);
        }
      }, 30000); // 30 seconds

      // Set up session validation interval
      const sessionCheckInterval = setInterval(async () => {
        try {
          // First check if the session cookie still exists
          const currentSessionCookie = SessionManager.getSessionCookie(request);
          if (!currentSessionCookie) {
            // Session cookie was removed
            const logoutData = `event: session-invalidated\ndata: ${JSON.stringify({ 
              type: 'session-invalidated', 
              reason: 'Session cookie expired or removed',
              timestamp: Date.now() 
            })}\n\n`;
            controller.enqueue(encoder.encode(logoutData));
            
            clearInterval(pingInterval);
            clearInterval(sessionCheckInterval);
            controller.close();
            return;
          }

          const currentSession = await SessionManager.validateSession(
            currentSessionCookie, 
            SessionManager.getClientIP(request)
          );

          if (!currentSession) {
            // Session is invalid, send logout message
            const logoutData = `event: session-invalidated\ndata: ${JSON.stringify({ 
              type: 'session-invalidated', 
              reason: 'Session expired or invalidated',
              timestamp: Date.now() 
            })}\n\n`;
            controller.enqueue(encoder.encode(logoutData));
            
            // Clean up and close
            clearInterval(pingInterval);
            clearInterval(sessionCheckInterval);
            controller.close();
            return;
          }

          // Check if user has been blocked or permissions revoked
          if (!currentSession.isAdmin) {
            const blockedData = `event: user-blocked\ndata: ${JSON.stringify({ 
              type: 'user-blocked', 
              reason: 'Admin privileges revoked',
              timestamp: Date.now() 
            })}\n\n`;
            controller.enqueue(encoder.encode(blockedData));
            
            // Clean up and close
            clearInterval(pingInterval);
            clearInterval(sessionCheckInterval);
            controller.close();
            return;
          }

          // Check if user account is disabled
          try {
            const userRecord = await adminAuth.getUser(currentSession.uid);
            if (userRecord.disabled) {
              const disabledData = `event: user-blocked\ndata: ${JSON.stringify({ 
                type: 'user-blocked', 
                reason: 'User account has been disabled',
                timestamp: Date.now() 
              })}\n\n`;
              controller.enqueue(encoder.encode(disabledData));
              
              clearInterval(pingInterval);
              clearInterval(sessionCheckInterval);
              controller.close();
              return;
            }
          } catch (userCheckError) {
            // User might have been deleted
            const deletedData = `event: user-blocked\ndata: ${JSON.stringify({ 
              type: 'user-blocked', 
              reason: 'User account no longer exists',
              timestamp: Date.now() 
            })}\n\n`;
            controller.enqueue(encoder.encode(deletedData));
            
            clearInterval(pingInterval);
            clearInterval(sessionCheckInterval);
            controller.close();
            return;
          }

        } catch (error) {
          console.error('Session validation error in SSE:', error);
          // On error, send invalidation message and close
          const errorData = `event: session-invalidated\ndata: ${JSON.stringify({ 
            type: 'session-invalidated', 
            reason: 'Session validation error',
            timestamp: Date.now() 
          })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          
          clearInterval(pingInterval);
          clearInterval(sessionCheckInterval);
          controller.close();
        }
      }, 5000); // Check every 5 seconds for more responsive updates

      // Clean up on connection close
      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        clearInterval(sessionCheckInterval);
        controller.close();
      });
    },
  });

  return new NextResponse(stream, { headers });
}

// Handle heartbeat requests
export async function POST(request: NextRequest) {
  try {
    const sessionCookie = SessionManager.getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.json({ error: 'No session' }, { status: 401 });
    }

    const session = await SessionManager.validateSession(
      sessionCookie, 
      SessionManager.getClientIP(request)
    );

    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Update session last activity
    // Note: Session activity is tracked during validation

    return NextResponse.json({ 
      status: 'ok', 
      timestamp: Date.now(),
      sessionValid: true 
    });

  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }
}
