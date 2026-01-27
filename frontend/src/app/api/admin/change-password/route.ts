import { NextRequest, NextResponse } from 'next/server';
import { auth } from 'firebase-admin';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { validatePassword } from '@/lib/password-security';
import { auditLogger } from '@/lib/audit-logger';
import { securityManager } from '@/lib/security-manager';
import { adminPasswordSecurity } from '@/lib/admin-password-security';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Helper to parse private key - handles quotes and escaped newlines
function parsePrivateKey(key: string | undefined): string {
  if (!key) return '';
  let cleaned = key.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned.replace(/\\n/g, '\n');
}

// Initialize Firebase Admin SDK
try {
  if (!getApps().length) {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
        }),
      });
    }
  }
} catch (error) {
  console.warn('Firebase Admin initialization failed (expected during build):', error);
}

// Security headers
function addSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  return response;
}

// Verify admin token and extract user info
async function verifyAdminUser(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new Error('No valid token provided');
    }

    const token = authorization.split('Bearer ')[1];
    const decodedToken = await auth().verifyIdToken(token);
    
    if (!decodedToken.admin) {
      throw new Error('Admin privileges required');
    }

    return decodedToken;
  } catch (error) {
    throw new Error('Unauthorized');
  }
}

// Verify current password using Firebase Auth REST API
async function verifyCurrentPassword(email: string, currentPassword: string): Promise<boolean> {
  try {
    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      console.error('Firebase API key not configured');
      return false;
    }

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password: currentPassword,
          returnSecureToken: true,
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Error verifying current password:', error);
    return false;
  }
}

// POST: Change password with enhanced security
export async function POST(request: NextRequest) {
  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  let adminUser: any = null;

  try {
    // Verify admin user first
    adminUser = await verifyAdminUser(request);
    
    // Parse request body
    const { newPassword, currentPassword, targetUserId } = await request.json();

    // Validate required fields
    if (!newPassword) {
      return addSecurityHeaders(NextResponse.json(
        { error: 'New password is required' },
        { status: 400 }
      ));
    }

    // Determine if this is a self-password change or admin changing another user's password
    const isChangingOwnPassword = !targetUserId || targetUserId === adminUser.uid;
    
    // Security validation based on operation type
    if (isChangingOwnPassword) {
      // Self password change - requires current password verification
      if (!currentPassword) {
        await auditLogger.log(
          adminUser.uid,
          adminUser.email || '',
          'PASSWORD_CHANGE_ATTEMPT',
          'password-change',
          { reason: 'Missing current password', ipAddress: clientIP },
          false,
          'Current password required for self password change'
        );
        return addSecurityHeaders(NextResponse.json(
          { error: 'Current password is required for self password change' },
          { status: 400 }
        ));
      }

      // Get user record to verify current password
      const userRecord = await auth().getUser(adminUser.uid);
      if (!userRecord.email) {
        throw new Error('User email not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await verifyCurrentPassword(userRecord.email, currentPassword);
      if (!isCurrentPasswordValid) {
        await auditLogger.log(
          adminUser.uid,
          adminUser.email || '',
          'PASSWORD_CHANGE_FAILURE',
          'password-change',
          { reason: 'Invalid current password', ipAddress: clientIP },
          false,
          'Current password is incorrect'
        );
        return addSecurityHeaders(NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 401 }
        ));
      }
    } else {
      // Admin changing another user's password - requires super admin privileges
      if (!adminUser.superAdmin) {
        await auditLogger.log(
          adminUser.uid,
          adminUser.email || '',
          'FAILED_AUTHORIZATION',
          'password-change',
          { targetUserId, reason: 'Insufficient privileges', ipAddress: clientIP },
          false,
          'Super admin privileges required'
        );
        return addSecurityHeaders(NextResponse.json(
          { error: 'Super admin privileges required to change other users\' passwords' },
          { status: 403 }
        ));
      }

      // Verify target user exists
      try {
        await auth().getUser(targetUserId);
      } catch (error) {
        return addSecurityHeaders(NextResponse.json(
          { error: 'Target user not found' },
          { status: 404 }
        ));
      }

      // Prevent changing another super admin's password
      const targetUserRecord = await auth().getUser(targetUserId);
      if (targetUserRecord.customClaims?.superAdmin && targetUserId !== adminUser.uid) {
        await auditLogger.log(
          adminUser.uid,
          adminUser.email || '',
          'FAILED_AUTHORIZATION',
          'password-change',
          { targetUserId, reason: 'Cannot change another super admin password', ipAddress: clientIP },
          false,
          'Cannot change another super admin password'
        );
        return addSecurityHeaders(NextResponse.json(
          { error: 'Cannot change another super admin\'s password' },
          { status: 403 }
        ));
      }
    }

    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      await auditLogger.log(
        adminUser.uid,
        adminUser.email || '',
        'PASSWORD_CHANGE_FAILURE',
        'password-change',
        { reason: 'Weak password', errors: passwordValidation.errors, ipAddress: clientIP },
        false,
        'Password does not meet security requirements'
      );
      return addSecurityHeaders(NextResponse.json(
        { 
          error: 'Password does not meet security requirements',
          details: passwordValidation.errors,
          passwordStrength: passwordValidation.strength
        },
        { status: 400 }
      ));
    }

    // Update the password
    const targetUid = targetUserId || adminUser.uid;
    await auth().updateUser(targetUid, {
      password: newPassword
    });

    // Log successful password change
    await auditLogger.log(
      adminUser.uid,
      adminUser.email || '',
      'PASSWORD_CHANGE_SUCCESS',
      'password-change',
      { 
        targetUserId: targetUid,
        isOwnPassword: isChangingOwnPassword,
        ipAddress: clientIP,
        passwordStrength: passwordValidation.strength
      },
      true
    );

    return addSecurityHeaders(NextResponse.json(
      { 
        message: 'Password changed successfully',
        passwordStrength: passwordValidation.strength
      },
      { status: 200 }
    ));

  } catch (error: any) {
    // Log failed attempt
    if (adminUser) {
      await auditLogger.log(
        adminUser.uid,
        adminUser.email || '',
        'PASSWORD_CHANGE_FAILURE',
        'password-change',
        { error: error.message, ipAddress: clientIP },
        false,
        error.message
      );
    }

    console.error('Error changing password:', error);
    return addSecurityHeaders(NextResponse.json(
      { error: error.message || 'Failed to change password' },
      { status: 500 }
    ));
  }
}
