import { NextRequest, NextResponse } from 'next/server';
import SessionManager from '@/lib/session-manager';
import { adminAuth } from '@/lib/firebase-admin-enhanced';
import { auditLogger } from '@/lib/audit-logger';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Get all active sessions (Super Admin only)
export async function GET(request: NextRequest) {
  try {
    const sessionCookie = SessionManager.getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await SessionManager.validateSession(
      sessionCookie,
      SessionManager.getClientIP(request)
    );

    if (!session || !session.isSuperAdmin) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }

    // Get all active sessions
    const activeSessions = await SessionManager.getAllActiveSessions();

    return NextResponse.json({
      success: true,
      sessions: activeSessions,
      count: activeSessions.length
    });

  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Revoke user session/access (Super Admin only)
export async function POST(request: NextRequest) {
  try {
    const sessionCookie = SessionManager.getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await SessionManager.validateSession(
      sessionCookie,
      SessionManager.getClientIP(request)
    );

    if (!session || !session.isSuperAdmin) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }

    const { action, userId, reason } = await request.json();

    if (!action || !userId) {
      return NextResponse.json({ error: 'Action and userId are required' }, { status: 400 });
    }

    let result;
    
    switch (action) {
      case 'revoke_session':
        // Revoke specific user's session
        result = await SessionManager.revokeUserSession(userId);
        
        // Log the action
        await auditLogger.logSecurityEvent({
          event: 'session_revoked_by_admin',
          severity: 'HIGH',
          adminId: session.uid,
          adminEmail: session.email,
          clientIP: SessionManager.getClientIP(request),
          details: {
            targetUserId: userId,
            reason: reason || 'Manual revocation by super admin',
            action: 'revoke_session'
          }
        });
        
        break;

      case 'disable_user':
        // Disable user account
        await adminAuth.updateUser(userId, { disabled: true });
        
        // Revoke all sessions for this user
        await SessionManager.revokeUserSession(userId);
        
        // Log the action
        await auditLogger.logSecurityEvent({
          event: 'user_disabled_by_admin',
          severity: 'HIGH',
          adminId: session.uid,
          adminEmail: session.email,
          clientIP: SessionManager.getClientIP(request),
          details: {
            targetUserId: userId,
            reason: reason || 'Account disabled by super admin',
            action: 'disable_user'
          }
        });
        
        result = { success: true, message: 'User account disabled and sessions revoked' };
        break;

      case 'enable_user':
        // Enable user account
        await adminAuth.updateUser(userId, { disabled: false });
        
        // Log the action
        await auditLogger.logSecurityEvent({
          event: 'user_enabled_by_admin',
          severity: 'MEDIUM',
          adminId: session.uid,
          adminEmail: session.email,
          clientIP: SessionManager.getClientIP(request),
          details: {
            targetUserId: userId,
            reason: reason || 'Account enabled by super admin',
            action: 'enable_user'
          }
        });
        
        result = { success: true, message: 'User account enabled' };
        break;

      case 'revoke_admin_privileges':
        // Remove admin custom claims
        await adminAuth.setCustomUserClaims(userId, { admin: false, superAdmin: false });
        
        // Revoke all sessions for this user
        await SessionManager.revokeUserSession(userId);
        
        // Log the action
        await auditLogger.logSecurityEvent({
          event: 'admin_privileges_revoked',
          severity: 'HIGH',
          adminId: session.uid,
          adminEmail: session.email,
          clientIP: SessionManager.getClientIP(request),
          details: {
            targetUserId: userId,
            reason: reason || 'Admin privileges revoked by super admin',
            action: 'revoke_admin_privileges'
          }
        });
        
        result = { success: true, message: 'Admin privileges revoked and sessions terminated' };
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error managing user session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
