import { NextRequest, NextResponse } from 'next/server';
import SessionManager from '@/lib/session-manager';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

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

    return NextResponse.json({ 
      status: 'ok', 
      timestamp: Date.now(),
      sessionValid: true,
      user: {
        uid: session.uid,
        email: session.email,
        role: session.role,
        isAdmin: session.isAdmin,
        isSuperAdmin: session.isSuperAdmin
      }
    });

  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }
}
