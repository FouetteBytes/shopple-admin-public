import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin-enhanced';
import SessionManager from '@/lib/session-manager';
import { auditLogger } from '@/lib/audit-logger';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// GET: List all users
export async function GET(request: NextRequest) {
  try {
    let session = null;
    
    // Try session cookie first (new method)
    const sessionCookie = SessionManager.getSessionCookie(request);
    const clientIP = SessionManager.getClientIP(request);
    
    if (sessionCookie) {
      session = await SessionManager.validateSession(sessionCookie, clientIP);
    }
    
    // If no session cookie, try Authorization header (fallback for existing frontend)
    if (!session) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.substring(7);
        try {
          // Verify the ID token using Firebase Admin SDK
          const decodedToken = await adminAuth.verifyIdToken(idToken, true);
          
          // Create session-like object from token
          session = {
            uid: decodedToken.uid,
            email: decodedToken.email || '',
            role: decodedToken.role || 'user',
            permissions: decodedToken.permissions || [],
            isAdmin: decodedToken.admin || false,
            isSuperAdmin: decodedToken.superAdmin || false,
            sessionId: 'token-based',
            createdAt: decodedToken.iat * 1000,
            lastActivity: Date.now(),
            ipAddress: clientIP,
            userAgent: 'token-auth',
            sessionCookie: '',
          };
        } catch (tokenError) {
          console.error('Token verification failed:', tokenError);
        }
      }
    }

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Admin privileges required' }, { status: 403 });
    }

    // List users from Firebase
    const listUsersResult = await adminAuth.listUsers(1000);
    
    const users = listUsersResult.users.map(user => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      disabled: user.disabled,
      emailVerified: user.emailVerified,
      customClaims: user.customClaims || {},
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime,
    }));

    await auditLogger.logAdminAction({
      adminId: session.uid,
      adminEmail: session.email,
      action: 'LIST_USERS',
      details: { totalUsers: users.length },
      clientIP,
      success: true,
    });

    return NextResponse.json({
      users,
      totalUsers: users.length,
    });

  } catch (error: any) {
    console.error('Admin users API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST: Create a new user
export async function POST(request: NextRequest) {
  const clientIP = SessionManager.getClientIP(request);
  
  try {
    let session = null;
    
    // Try session cookie first (new method)
    const sessionCookie = SessionManager.getSessionCookie(request);
    
    if (sessionCookie) {
      session = await SessionManager.validateSession(sessionCookie, clientIP);
    }
    
    // If no session cookie, try Authorization header (fallback for existing frontend)
    if (!session) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.substring(7);
        try {
          // Verify the ID token using Firebase Admin SDK
          const decodedToken = await adminAuth.verifyIdToken(idToken, true);
          
          // Create session-like object from token
          session = {
            uid: decodedToken.uid,
            email: decodedToken.email || '',
            role: decodedToken.role || 'user',
            permissions: decodedToken.permissions || [],
            isAdmin: decodedToken.admin || false,
            isSuperAdmin: decodedToken.superAdmin || false,
            sessionId: 'token-based',
            createdAt: decodedToken.iat * 1000,
            lastActivity: Date.now(),
            ipAddress: clientIP,
            userAgent: 'token-auth',
            sessionCookie: '',
          };
        } catch (tokenError) {
          console.error('Token verification failed:', tokenError);
        }
      }
    }

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.isSuperAdmin) {
      await auditLogger.logAdminAction({
        adminId: session.uid,
        adminEmail: session.email,
        action: 'CREATE_USER',
        details: { error: 'Super admin privileges required' },
        clientIP,
        success: false,
      });
      return NextResponse.json({ error: 'Super admin privileges required' }, { status: 403 });
    }

    const {
      email,
      password,
      displayName,
      isSuperAdmin = false,
      forcePasswordReset = true,
    } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Create user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
      disabled: false,
    });

    // Set custom claims based on role flags
    const customClaims = {
      admin: true,
      superAdmin: Boolean(isSuperAdmin),
      role: isSuperAdmin ? 'super_admin' : 'admin',
      permissions: isSuperAdmin ? ['all'] : ['admin'],
      forcePasswordReset: forcePasswordReset !== false,
      invitedBy: session.uid,
      invitedByEmail: session.email,
      inviteTimestamp: Date.now(),
    };

    await adminAuth.setCustomUserClaims(userRecord.uid, customClaims);

    await auditLogger.logAdminAction({
      adminId: session.uid,
      adminEmail: session.email,
      action: 'CREATE_USER',
      details: {
        targetUid: userRecord.uid,
        targetEmail: userRecord.email,
        role: customClaims.role,
        forcePasswordReset: customClaims.forcePasswordReset,
      },
      clientIP,
      success: true,
    });

    return NextResponse.json({
      message: 'User created successfully',
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        mustResetPassword: customClaims.forcePasswordReset,
      },
    });

  } catch (error: any) {
    console.error('Create user error:', error);
    await auditLogger.logAdminAction({
      adminId: 'unknown',
      adminEmail: 'unknown',
      action: 'CREATE_USER',
      details: { error: error?.message },
      clientIP,
      success: false,
    });
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}
