import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin-enhanced';
import SessionManager from '@/lib/session-manager';
import { validatePassword } from '@/lib/password-security';
import { auditLogger } from '@/lib/audit-logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const sessionCookie = SessionManager.getSessionCookie(request);
  const clientIP = SessionManager.getClientIP(request);

  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await SessionManager.validateSession(sessionCookie, clientIP);
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.mustResetPassword) {
    return NextResponse.json({ error: 'Password reset not required' }, { status: 400 });
  }

  try {
    const { newPassword } = await request.json();
    if (!newPassword) {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: 'Password does not meet security requirements', details: passwordValidation.errors },
        { status: 400 }
      );
    }

    await adminAuth.updateUser(session.uid, { password: newPassword });

    const userRecord = await adminAuth.getUser(session.uid);
    const claims = { ...(userRecord.customClaims || {}) };
    delete (claims as any).forcePasswordReset;
    claims.lastPasswordChange = Date.now();
    claims.sessionVersion = (claims.sessionVersion || 0) + 1;
    await adminAuth.setCustomUserClaims(session.uid, claims);

    await adminAuth.revokeRefreshTokens(session.uid);

    const response = NextResponse.json({
      success: true,
      message: 'Password updated. Please sign in with your new password.',
    });

    SessionManager.clearSessionCookie(response);

    await auditLogger.logAdminAction({
      adminId: session.uid,
      adminEmail: session.email,
      action: 'FORCED_PASSWORD_RESET_COMPLETED',
      details: {
        passwordStrength: passwordValidation.strength,
        passwordScore: passwordValidation.score,
      },
      clientIP,
      success: true,
    });

    return response;
  } catch (error: any) {
    console.error('Force password reset error:', error);
    await auditLogger.logAdminAction({
      adminId: session.uid,
      adminEmail: session.email,
      action: 'FORCED_PASSWORD_RESET_FAILED',
      details: { error: error?.message || 'unknown_error' },
      clientIP,
      success: false,
    });

    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
