import { NextRequest, NextResponse } from 'next/server';
import { auth } from 'firebase-admin';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { auditLogger } from '@/lib/audit-logger';
import { securityManager } from '@/lib/security-manager';
import { validatePassword } from '@/lib/password-security';

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

// Helper function to get client IP
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0] || realIP || 'unknown';
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

// Firebase Admin SDK password update function
async function updateUserPassword(uid: string, newPassword: string) {
  try {
    await auth().updateUser(uid, {
      password: newPassword,
    });
    return { success: true };
  } catch (error: any) {
    console.error('Firebase Admin SDK password update error:', error);
    throw new Error(`Failed to update password: ${error.message}`);
  }
}

/**
 * POST: Emergency Password Reset
 * For super admins only - generates temporary password with strict controls
 */
export async function POST(request: NextRequest) {
  try {
    const adminUser = await verifyAdminUser(request);
    const clientIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Verify super admin status
    if (!adminUser.superAdmin) {
      await auditLogger.logSecurityEvent({
        event: 'UNAUTHORIZED_EMERGENCY_RESET_ATTEMPT',
        severity: 'CRITICAL',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || 'unknown',
        clientIP,
        details: { reason: 'Non-super-admin attempted emergency reset' }
      });

      return NextResponse.json(
        { error: 'Emergency reset requires super admin privileges' },
        { 
          status: 403,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    const body = await request.json();
    const { targetUserId, newPassword } = body;

    if (!targetUserId || !newPassword) {
      return NextResponse.json(
        { error: 'Target user ID and new password are required' },
        { 
          status: 400,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { 
          error: 'Password does not meet security requirements',
          details: passwordValidation.errors
        },
        { 
          status: 400,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    // Verify target user exists
    let targetUser;
    try {
      targetUser = await auth().getUser(targetUserId);
    } catch (error) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { 
          status: 404,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    // Additional security: Check if target is super admin
    if (targetUser.customClaims?.superAdmin) {
      await auditLogger.logSecurityEvent({
        event: 'SUPER_ADMIN_EMERGENCY_RESET_ATTEMPT',
        severity: 'CRITICAL',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || 'unknown',
        clientIP,
        details: { 
          targetUserId,
          targetEmail: targetUser.email,
          reason: 'Emergency password reset by super admin'
        }
      });

      return NextResponse.json(
        { error: 'Super admin passwords cannot be reset through emergency procedure. Use Firebase Console.' },
        { 
          status: 403,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    try {
      // Update password using Firebase Admin SDK
      await updateUserPassword(targetUserId, newPassword);

      // Log successful emergency reset
      await auditLogger.logSecurityEvent({
        event: 'EMERGENCY_PASSWORD_RESET',
        severity: 'CRITICAL',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || 'unknown',
        clientIP,
        details: { 
          targetUserId,
          passwordStrength: passwordValidation.strength
        }
      });

      return NextResponse.json(
        { 
          success: true,
          message: `Password reset successfully for user ${targetUserId}`
        },
        { 
          status: 200,
          headers: securityManager.getSecurityHeaders()
        }
      );

    } catch (error: any) {
      console.error('Emergency password reset error:', error);
      
      return NextResponse.json(
        { error: 'Failed to reset password. Please try again.' },
        { 
          status: 500,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

  } catch (error: any) {
    console.error('Emergency reset request error:', error);
    
    const clientIP = getClientIP(request);
    await auditLogger.logSecurityEvent({
      event: 'EMERGENCY_RESET_ERROR',
      severity: 'HIGH',
      adminId: 'unknown',
      adminEmail: 'unknown',
      clientIP,
      details: { error: error.message }
    });

    return NextResponse.json(
      { error: 'Emergency reset failed' },
      { 
        status: 500,
        headers: securityManager.getSecurityHeaders()
      }
    );
  }
}
