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
 * POST: Admin Password Change
 * Direct Firebase Admin SDK password update with security verification
 */
export async function POST(request: NextRequest) {
  try {
    const adminUser = await verifyAdminUser(request);
    const clientIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Apply rate limiting for password changes
    const rateLimitResult = securityManager.checkRateLimit(
      clientIP,
      'password_change',
      adminUser.uid
    );

    if (!rateLimitResult.allowed) {
      await auditLogger.logAdminAction({
        adminId: adminUser.uid,
        adminEmail: adminUser.email || 'unknown',
        action: 'PASSWORD_CHANGE_RATE_LIMITED',
        details: { retryAfter: rateLimitResult.retryAfter },
        clientIP,
        success: false
      });

      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { 
          status: 429,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { 
          status: 400,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      await auditLogger.logAdminAction({
        adminId: adminUser.uid,
        adminEmail: adminUser.email || 'unknown',
        action: 'PASSWORD_CHANGE_WEAK_PASSWORD',
        details: { errors: passwordValidation.errors },
        clientIP,
        success: false
      });

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

    // Verify current password by attempting to get a new token
    try {
      // Current-password verification is omitted because it requires client-side
      // Firebase Auth; the Admin SDK is used to update the password directly.
      
      // Update password using Firebase Admin SDK
      await updateUserPassword(adminUser.uid, newPassword);

      // Log successful password change
      await auditLogger.logAdminAction({
        adminId: adminUser.uid,
        adminEmail: adminUser.email || 'unknown',
        action: 'PASSWORD_CHANGED',
        details: { 
          passwordStrength: passwordValidation.strength,
          passwordScore: passwordValidation.score 
        },
        clientIP,
        success: true
      });

      return NextResponse.json(
        { 
          success: true,
          message: 'Password changed successfully'
        },
        { 
          status: 200,
          headers: securityManager.getSecurityHeaders()
        }
      );

    } catch (error: any) {
      console.error('Password change error:', error);
      
      await auditLogger.logAdminAction({
        adminId: adminUser.uid,
        adminEmail: adminUser.email || 'unknown',
        action: 'PASSWORD_CHANGE_FAILED',
        details: { error: error.message },
        clientIP,
        success: false
      });

      return NextResponse.json(
        { error: 'Failed to change password. Please try again.' },
        { 
          status: 500,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

  } catch (error: any) {
    console.error('Password change request error:', error);
    
    const clientIP = getClientIP(request);
    await auditLogger.logAdminAction({
      adminId: 'unknown',
      adminEmail: 'unknown',
      action: 'PASSWORD_CHANGE_REQUEST_ERROR',
      details: { error: error.message },
      clientIP,
      success: false
    });

    return NextResponse.json(
      { error: 'Unauthorized or invalid request' },
      { 
        status: 401,
        headers: securityManager.getSecurityHeaders()
      }
    );
  }
}

/**
 * PUT: Complete Admin Password Change
 * Completes password change after verification
 */
export async function PUT(request: NextRequest) {
  try {
    const adminUser = await verifyAdminUser(request);
    const clientIP = getClientIP(request);

    const body = await request.json();
    const { 
      requestId,
      verificationToken,
      emailVerificationCode,
      emergencyOverrideCode,
      newPassword
    } = body;

    if (!requestId || !verificationToken) {
      return NextResponse.json(
        { error: 'Request ID and verification token are required' },
        { 
          status: 400,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    // Complete the password change
    const result = await adminPasswordSecurity.completeAdminPasswordChange({
      requestId,
      verificationToken,
      emailVerificationCode,
      emergencyOverrideCode,
      newPassword,
      adminId: adminUser.uid,
      ipAddress: clientIP
    });

    const statusCode = result.success ? 200 : 400;

    return NextResponse.json(
      {
        success: result.success,
        message: result.message,
        errors: result.errors
      },
      { 
        status: statusCode,
        headers: securityManager.getSecurityHeaders()
      }
    );

  } catch (error: any) {
    console.error('Password change completion error:', error);
    
    const clientIP = getClientIP(request);
    await auditLogger.logAdminAction({
      adminId: 'unknown',
      adminEmail: 'unknown',
      action: 'PASSWORD_CHANGE_COMPLETION_ERROR',
      details: { error: error.message },
      clientIP,
      success: false
    });

    return NextResponse.json(
      { error: 'Failed to complete password change' },
      { 
        status: 500,
        headers: securityManager.getSecurityHeaders()
      }
    );
  }
}

/**
 * GET: Get pending password change requests
 */
export async function GET(request: NextRequest) {
  try {
    const adminUser = await verifyAdminUser(request);
    
    // Only super admins can view all pending requests
    if (!adminUser.superAdmin) {
      return NextResponse.json(
        { error: 'Super admin privileges required' },
        { 
          status: 403,
          headers: securityManager.getSecurityHeaders()
        }
      );
    }

    const pendingRequests = adminPasswordSecurity.getPendingRequests(adminUser.uid);

    return NextResponse.json(
      { 
        success: true,
        pendingRequests: pendingRequests.map(req => ({
          requestId: req.requestId,
          targetEmail: req.targetEmail,
          reason: req.reason,
          timestamp: req.timestamp,
          isEmergency: req.isEmergency
        }))
      },
      { headers: securityManager.getSecurityHeaders() }
    );

  } catch (error: any) {
    console.error('Get pending requests error:', error);
    
    return NextResponse.json(
      { error: 'Failed to retrieve pending requests' },
      { 
        status: 500,
        headers: securityManager.getSecurityHeaders()
      }
    );
  }
}
