import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin-enhanced';
import SessionManager from '@/lib/session-manager';
import { auditLogger } from '@/lib/audit-logger';
import { securityManager } from '@/lib/security-manager';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Helper function to get client IP
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0] || realIP || 'unknown';
}

// PUT: Update user claims/roles
export async function PUT(request: NextRequest) {
  const clientIP = getClientIP(request);
  
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
        action: 'UPDATE_USER',
        details: { error: 'Insufficient privileges' },
        clientIP,
        success: false
      });

      return NextResponse.json(
        { error: 'Super admin privileges required to update user roles' },
        { 
          status: 403,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    const { uid, isAdmin, isSuperAdmin, disabled, displayName } = await request.json();

    if (!uid) {
      await auditLogger.logAdminAction({
        adminId: session.uid,
        adminEmail: session.email,
        action: 'UPDATE_USER',
        details: { error: 'Missing UID parameter' },
        clientIP,
        success: false
      });

      return NextResponse.json(
        { error: 'User UID is required' },
        { 
          status: 400,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    // Prevent modifying yourself
    if (uid === session.uid) {
      await auditLogger.logSecurityEvent({
        event: 'ATTEMPT_SELF_ROLE_CHANGE',
        severity: 'HIGH',
        adminId: session.uid,
        adminEmail: session.email,
        clientIP,
        details: { targetUid: uid }
      });

      return NextResponse.json(
        { error: 'Cannot modify your own account roles' },
        { 
          status: 400,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    // Get target user info for audit logging
    let targetUser;
    try {
      targetUser = await adminAuth.getUser(uid);
    } catch (error) {
      await auditLogger.logAdminAction({
        adminId: session.uid,
        adminEmail: session.email,
        action: 'UPDATE_USER',
        details: { error: 'User not found', targetUid: uid },
        clientIP,
        success: false
      });

      return NextResponse.json(
        { error: 'User not found' },
        { 
          status: 404,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    // Log the role change attempt
    await auditLogger.logSecurityEvent({
      event: 'ROLE_CHANGE_ATTEMPT',
      severity: 'HIGH',
      adminId: session.uid,
      adminEmail: session.email,
      clientIP,
      details: {
        targetUid: uid,
        targetEmail: targetUser.email,
        currentClaims: targetUser.customClaims || {},
        newIsAdmin: isAdmin,
        newIsSuperAdmin: isSuperAdmin,
        newDisabled: disabled,
        newDisplayName: displayName
      }
    });

    // Update custom claims
    const customClaims: any = {};
    if (isAdmin) {
      customClaims.admin = true;
    }
    if (isSuperAdmin) {
      customClaims.superAdmin = true;
      customClaims.admin = true; // Super admins are also admins
    }

    await adminAuth.setCustomUserClaims(uid, customClaims);

    // Update user properties (disabled status, display name)
    const updateData: any = {};
    if (disabled !== undefined) updateData.disabled = disabled;
    if (displayName !== undefined) updateData.displayName = displayName;

    if (Object.keys(updateData).length > 0) {
      await adminAuth.updateUser(uid, updateData);
    }

    // Record successful update
    securityManager.recordAttempt('admin-update-user', clientIP, session.uid, true);

    await auditLogger.logAdminAction({
      adminId: session.uid,
      adminEmail: session.email,
      action: 'UPDATE_USER',
      details: {
        targetUid: uid,
        targetEmail: targetUser.email,
        oldClaims: targetUser.customClaims || {},
        newClaims: customClaims,
        disabled
      },
      clientIP,
      success: true,
      targetUserId: uid
    });

    return NextResponse.json(
      {
        message: 'User updated successfully',
        customClaims
      },
      { headers: securityManager.getSecurityHeaders() }
    );
  } catch (error: any) {
    console.error('Error updating user:', error);
    
    // Record failed attempt
    securityManager.recordAttempt('admin-update-user', clientIP, undefined, false);

    await auditLogger.logAdminAction({
      adminId: 'unknown',
      adminEmail: 'unknown',
      action: 'UPDATE_USER',
      details: { error: error.message },
      clientIP,
      success: false
    });

    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { 
        status: 500,
        headers: securityManager.getSecurityHeaders()
      }
    );
  }
}
