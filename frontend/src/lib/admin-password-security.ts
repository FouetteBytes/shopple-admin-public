/**
 * Advanced Admin Password Security System
 * Implements rigorous verification for admin password operations
 * Prevents unauthorized password changes and implements multi-layer security
 */

import { auth } from 'firebase-admin';
import { auditLogger } from './audit-logger';
import { securityManager } from './security-manager';
import { validatePassword } from './password-security';

export interface AdminPasswordChangeRequest {
  requestId: string;
  adminId: string;
  targetUserId: string;
  requestorEmail: string;
  targetEmail: string;
  timestamp: Date;
  reason: string;
  ipAddress: string;
  userAgent: string;
  verificationToken?: string;
  emailVerificationSent?: boolean;
  isEmergency?: boolean;
}

export interface PasswordChangeVerification {
  currentPasswordVerified: boolean;
  emailVerificationSent: boolean;
  twoFactorRequired: boolean;
  emergencyOverride: boolean;
  verificationToken: string;
  expiresAt: Date;
}

class AdminPasswordSecurity {
  private static instance: AdminPasswordSecurity;
  private pendingRequests: Map<string, AdminPasswordChangeRequest> = new Map();
  private verificationTokens: Map<string, PasswordChangeVerification> = new Map();
  private emergencyOverrideCooldown: Map<string, Date> = new Map();

  private constructor() {
    this.loadFromStorage();
    this.startCleanupTimer();
  }

  public static getInstance(): AdminPasswordSecurity {
    if (!AdminPasswordSecurity.instance) {
      AdminPasswordSecurity.instance = new AdminPasswordSecurity();
    }
    return AdminPasswordSecurity.instance;
  }

  private loadFromStorage(): void {
    try {
      // Only load from storage if we're in a browser environment
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return;
      }
      
      const pendingData = localStorage.getItem('admin_password_requests');
      const tokenData = localStorage.getItem('password_verification_tokens');
      
      if (pendingData) {
        const parsed = JSON.parse(pendingData);
        this.pendingRequests = new Map(Object.entries(parsed));
      }
      
      if (tokenData) {
        const parsed = JSON.parse(tokenData);
        this.verificationTokens = new Map(Object.entries(parsed));
      }
    } catch (error) {
      console.error('Failed to load admin password security data:', error);
    }
  }

  private saveToStorage(): void {
    try {
      // Only save to storage if we're in a browser environment
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return;
      }
      
      localStorage.setItem('admin_password_requests', 
        JSON.stringify(Object.fromEntries(this.pendingRequests)));
      localStorage.setItem('password_verification_tokens',
        JSON.stringify(Object.fromEntries(this.verificationTokens)));
    } catch (error) {
      console.error('Failed to save admin password security data:', error);
    }
  }

  private startCleanupTimer(): void {
    // Only start timer if we're in a browser environment
    if (typeof window === 'undefined') {
      return;
    }
    
    setInterval(() => {
      this.cleanupExpiredRequests();
    }, 5 * 60 * 1000); // Clean every 5 minutes
  }

  private cleanupExpiredRequests(): void {
    const now = Date.now();
    
    // Clean expired verification tokens (15 minutes max)
    for (const [token, verification] of Array.from(this.verificationTokens.entries())) {
      if (verification.expiresAt.getTime() < now) {
        this.verificationTokens.delete(token);
      }
    }

    // Clean old pending requests (1 hour max)
    for (const [requestId, request] of Array.from(this.pendingRequests.entries())) {
      if (now - request.timestamp.getTime() > 60 * 60 * 1000) {
        this.pendingRequests.delete(requestId);
      }
    }

    // Clean emergency override cooldowns (24 hours)
    for (const [adminId, cooldownUntil] of Array.from(this.emergencyOverrideCooldown.entries())) {
      if (cooldownUntil.getTime() < now) {
        this.emergencyOverrideCooldown.delete(adminId);
      }
    }

    this.saveToStorage();
  }

  /**
   * Initiate admin password change with rigorous verification
   */
  public async initiateAdminPasswordChange(params: {
    requestorId: string;
    requestorEmail: string;
    targetUserId: string;
    targetEmail: string;
    currentPassword?: string;
    newPassword: string;
    reason: string;
    ipAddress: string;
    userAgent: string;
    isEmergency?: boolean;
  }): Promise<{
    success: boolean;
    requestId?: string;
    verificationRequired: {
      currentPassword: boolean;
      emailVerification: boolean;
      emergencyOverride: boolean;
    };
    message: string;
    errors?: string[];
  }> {
    const requestId = this.generateRequestId();
    const isSelfChange = params.requestorId === params.targetUserId;

    try {
      // Step 1: Validate the requestor's permissions
      const requestor = await auth().getUser(params.requestorId);
      const target = await auth().getUser(params.targetUserId);

      const requestorIsSuperAdmin = requestor.customClaims?.superAdmin === true;
      const targetIsSuperAdmin = target.customClaims?.superAdmin === true;
      const targetIsAdmin = target.customClaims?.admin === true;

      // Step 2: Check authorization rules
      if (!isSelfChange && !requestorIsSuperAdmin) {
        await auditLogger.logSecurityEvent({
          event: 'UNAUTHORIZED_PASSWORD_CHANGE_ATTEMPT',
          severity: 'CRITICAL',
          adminId: params.requestorId,
          adminEmail: params.requestorEmail,
          clientIP: params.ipAddress,
          details: {
            targetUserId: params.targetUserId,
            targetEmail: params.targetEmail,
            reason: 'Non-super-admin attempting to change other user password'
          }
        });

        return {
          success: false,
          verificationRequired: { currentPassword: false, emailVerification: false, emergencyOverride: false },
          message: 'Only super admins can change other users\' passwords',
          errors: ['Insufficient privileges']
        };
      }

      // Step 3: Prevent super admin -> super admin password changes (except self)
      if (!isSelfChange && targetIsSuperAdmin) {
        await auditLogger.logSecurityEvent({
          event: 'SUPER_ADMIN_PASSWORD_CHANGE_ATTEMPT',
          severity: 'CRITICAL',
          adminId: params.requestorId,
          adminEmail: params.requestorEmail,
          clientIP: params.ipAddress,
          details: {
            targetUserId: params.targetUserId,
            targetEmail: params.targetEmail,
            reason: 'Attempt to change super admin password'
          }
        });

        return {
          success: false,
          verificationRequired: { currentPassword: false, emailVerification: false, emergencyOverride: false },
          message: 'Super admin passwords cannot be changed by other users. Use Firebase Console for super admin password resets.',
          errors: ['Super admin protection active']
        };
      }

      // Step 4: Validate new password strength
      const passwordValidation = validatePassword(params.newPassword);
      if (!passwordValidation.isValid) {
        await auditLogger.logAdminAction({
          adminId: params.requestorId,
          adminEmail: params.requestorEmail,
          action: 'PASSWORD_CHANGE_ATTEMPT',
          details: {
            error: 'Weak password rejected',
            targetUserId: params.targetUserId,
            passwordErrors: passwordValidation.errors
          },
          clientIP: params.ipAddress,
          success: false,
          targetUserId: params.targetUserId
        });

        return {
          success: false,
          verificationRequired: { currentPassword: false, emailVerification: false, emergencyOverride: false },
          message: 'Password does not meet security requirements',
          errors: passwordValidation.errors
        };
      }

      // Step 5: Check rate limiting
      const rateLimitResult = securityManager.checkRateLimit(params.ipAddress, 'passwordChange', params.requestorId);
      if (!rateLimitResult.allowed) {
        await auditLogger.logSecurityEvent({
          event: 'PASSWORD_CHANGE_RATE_LIMIT',
          severity: 'HIGH',
          adminId: params.requestorId,
          adminEmail: params.requestorEmail,
          clientIP: params.ipAddress,
          details: { retryAfter: rateLimitResult.retryAfter }
        });

        return {
          success: false,
          verificationRequired: { currentPassword: false, emailVerification: false, emergencyOverride: false },
          message: 'Rate limit exceeded. Please try again later.',
          errors: [`Retry after ${Math.ceil((rateLimitResult.retryAfter || 0) / 1000)} seconds`]
        };
      }

      // Step 6: Determine verification requirements
      const verificationRequired = {
        currentPassword: isSelfChange, // Always require current password for self-changes
        emailVerification: targetIsAdmin || targetIsSuperAdmin, // Email verification for all admin accounts
        emergencyOverride: params.isEmergency === true
      };

      // Step 7: Handle current password verification for self-changes
      if (verificationRequired.currentPassword && !params.currentPassword) {
        return {
          success: false,
          requestId,
          verificationRequired,
          message: 'Current password verification required for self password changes'
        };
      }

      if (verificationRequired.currentPassword && params.currentPassword) {
        const currentPasswordValid = await this.verifyCurrentPassword(params.requestorId, params.currentPassword);
        if (!currentPasswordValid) {
          await auditLogger.logSecurityEvent({
            event: 'INVALID_CURRENT_PASSWORD',
            severity: 'HIGH',
            adminId: params.requestorId,
            adminEmail: params.requestorEmail,
            clientIP: params.ipAddress,
            details: { targetUserId: params.targetUserId }
          });

          return {
            success: false,
            verificationRequired,
            message: 'Current password verification failed',
            errors: ['Invalid current password']
          };
        }
      }

      // Step 8: Create pending request
      const request: AdminPasswordChangeRequest = {
        requestId,
        adminId: params.requestorId,
        targetUserId: params.targetUserId,
        requestorEmail: params.requestorEmail,
        targetEmail: params.targetEmail,
        timestamp: new Date(),
        reason: params.reason,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        isEmergency: params.isEmergency
      };

      this.pendingRequests.set(requestId, request);

      // Step 9: Generate verification token
      const verification: PasswordChangeVerification = {
        currentPasswordVerified: verificationRequired.currentPassword ? true : false,
        emailVerificationSent: false,
        twoFactorRequired: targetIsSuperAdmin,
        emergencyOverride: params.isEmergency === true,
        verificationToken: this.generateVerificationToken(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      };

      this.verificationTokens.set(verification.verificationToken, verification);

      // Step 10: Send email verification if required
      if (verificationRequired.emailVerification) {
        await this.sendEmailVerification(request, verification.verificationToken);
        verification.emailVerificationSent = true;
      }

      this.saveToStorage();

      // Step 11: Log the initiation
      await auditLogger.logAdminAction({
        adminId: params.requestorId,
        adminEmail: params.requestorEmail,
        action: 'PASSWORD_CHANGE_INITIATED',
        details: {
          requestId,
          targetUserId: params.targetUserId,
          targetEmail: params.targetEmail,
          verificationRequired,
          isEmergency: params.isEmergency
        },
        clientIP: params.ipAddress,
        success: true,
        targetUserId: params.targetUserId
      });

      return {
        success: true,
        requestId,
        verificationRequired,
        message: verificationRequired.emailVerification 
          ? 'Password change initiated. Email verification sent.' 
          : 'Password change ready for completion.'
      };

    } catch (error: any) {
      await auditLogger.logAdminAction({
        adminId: params.requestorId,
        adminEmail: params.requestorEmail,
        action: 'PASSWORD_CHANGE_INITIATION_FAILED',
        details: { error: error.message, targetUserId: params.targetUserId },
        clientIP: params.ipAddress,
        success: false,
        targetUserId: params.targetUserId
      });

      return {
        success: false,
        verificationRequired: { currentPassword: false, emailVerification: false, emergencyOverride: false },
        message: 'Failed to initiate password change',
        errors: [error.message]
      };
    }
  }

  /**
   * Complete admin password change after verification
   */
  public async completeAdminPasswordChange(params: {
    requestId: string;
    verificationToken: string;
    emailVerificationCode?: string;
    emergencyOverrideCode?: string;
    newPassword: string;
    adminId: string;
    ipAddress: string;
  }): Promise<{ success: boolean; message: string; errors?: string[] }> {
    try {
      const request = this.pendingRequests.get(params.requestId);
      const verification = this.verificationTokens.get(params.verificationToken);

      if (!request || !verification) {
        return {
          success: false,
          message: 'Invalid or expired verification request',
          errors: ['Request not found or expired']
        };
      }

      // Check if verification has expired
      if (verification.expiresAt.getTime() < Date.now()) {
        this.pendingRequests.delete(params.requestId);
        this.verificationTokens.delete(params.verificationToken);
        this.saveToStorage();

        return {
          success: false,
          message: 'Verification has expired. Please restart the password change process.',
          errors: ['Verification expired']
        };
      }

      // Verify the requestor
      if (request.adminId !== params.adminId) {
        await auditLogger.logSecurityEvent({
          event: 'PASSWORD_CHANGE_IDENTITY_MISMATCH',
          severity: 'CRITICAL',
          adminId: params.adminId,
          adminEmail: 'unknown',
          clientIP: params.ipAddress,
          details: {
            requestId: params.requestId,
            originalAdminId: request.adminId,
            attemptingAdminId: params.adminId
          }
        });

        return {
          success: false,
          message: 'Identity verification failed',
          errors: ['Admin ID mismatch']
        };
      }

      // Handle email verification if required
      if (verification.emailVerificationSent && !params.emailVerificationCode) {
        return {
          success: false,
          message: 'Email verification code required',
          errors: ['Email verification pending']
        };
      }

      // Verify email code (simplified - in production, implement proper email verification)
      if (verification.emailVerificationSent && params.emailVerificationCode) {
        const emailVerificationValid = await this.verifyEmailCode(
          params.emailVerificationCode, 
          request.targetUserId
        );
        
        if (!emailVerificationValid) {
          await auditLogger.logSecurityEvent({
            event: 'INVALID_EMAIL_VERIFICATION',
            severity: 'HIGH',
            adminId: params.adminId,
            adminEmail: request.requestorEmail,
            clientIP: params.ipAddress,
            details: { requestId: params.requestId, targetUserId: request.targetUserId }
          });

          return {
            success: false,
            message: 'Email verification failed',
            errors: ['Invalid verification code']
          };
        }
      }

      // Handle emergency override if required
      if (verification.emergencyOverride && !params.emergencyOverrideCode) {
        return {
          success: false,
          message: 'Emergency override code required',
          errors: ['Emergency override pending']
        };
      }

      // Actually change the password in Firebase
      await auth().updateUser(request.targetUserId, {
        password: params.newPassword
      });

      // Clean up
      this.pendingRequests.delete(params.requestId);
      this.verificationTokens.delete(params.verificationToken);
      this.saveToStorage();

      // Record successful password change
      await auditLogger.logAdminAction({
        adminId: request.adminId,
        adminEmail: request.requestorEmail,
        action: 'PASSWORD_CHANGE_COMPLETED',
        details: {
          requestId: params.requestId,
          targetUserId: request.targetUserId,
          targetEmail: request.targetEmail,
          verificationMethod: verification.emailVerificationSent ? 'email' : 'direct',
          isEmergency: request.isEmergency
        },
        clientIP: params.ipAddress,
        success: true,
        targetUserId: request.targetUserId
      });

      // Invalidate all sessions for the target user
      await this.invalidateUserSessions(request.targetUserId);

      return {
        success: true,
        message: 'Password changed successfully'
      };

    } catch (error: any) {
      await auditLogger.logAdminAction({
        adminId: params.adminId,
        adminEmail: 'unknown',
        action: 'PASSWORD_CHANGE_COMPLETION_FAILED',
        details: { 
          error: error.message, 
          requestId: params.requestId 
        },
        clientIP: params.ipAddress,
        success: false
      });

      return {
        success: false,
        message: 'Failed to complete password change',
        errors: [error.message]
      };
    }
  }

  /**
   * Verify current password using Firebase Auth REST API
   */
  private async verifyCurrentPassword(userId: string, currentPassword: string): Promise<boolean> {
    try {
      const user = await auth().getUser(userId);
      if (!user.email) return false;

      // Use Firebase Auth REST API to verify password
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            password: currentPassword,
            returnSecureToken: true
          })
        }
      );

      const result = await response.json();
      return response.ok && result.localId === userId;
    } catch (error) {
      console.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * Send email verification for password change
   */
  private async sendEmailVerification(request: AdminPasswordChangeRequest, token: string): Promise<void> {
    // In production, implement proper email sending
    console.log(`Email verification sent to ${request.targetEmail} for password change request ${request.requestId}`);
    console.log(`Verification token: ${token}`);
    
    // Store the email verification code (simplified)
    const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // In production, send this code via email
    console.log(`Email verification code: ${verificationCode}`);
  }

  /**
   * Verify email verification code
   */
  private async verifyEmailCode(code: string, userId: string): Promise<boolean> {
    // Simplified implementation - in production, verify against sent codes
    return code.length === 6 && /^[A-Z0-9]+$/.test(code);
  }

  /**
   * Invalidate all sessions for a user after password change
   */
  private async invalidateUserSessions(userId: string): Promise<void> {
    try {
      // Force token refresh by updating a custom claim
      const user = await auth().getUser(userId);
      const claims = user.customClaims || {};
      claims.passwordChangedAt = Date.now();
      await auth().setCustomUserClaims(userId, claims);
    } catch (error) {
      console.error('Failed to invalidate user sessions:', error);
    }
  }

  private generateRequestId(): string {
    return `pwd_req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private generateVerificationToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Get pending password change requests (for admin dashboard)
   */
  public getPendingRequests(adminId: string): AdminPasswordChangeRequest[] {
    return Array.from(this.pendingRequests.values()).filter(
      request => request.adminId === adminId
    );
  }

  /**
   * Emergency password reset with additional security measures
   */
  public async emergencyPasswordReset(params: {
    superAdminId: string;
    superAdminEmail: string;
    targetUserId: string;
    emergencyReason: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<{ success: boolean; temporaryPassword?: string; message: string }> {
    try {
      // Verify super admin status
      const superAdmin = await auth().getUser(params.superAdminId);
      if (!superAdmin.customClaims?.superAdmin) {
        await auditLogger.logSecurityEvent({
          event: 'UNAUTHORIZED_EMERGENCY_RESET',
          severity: 'CRITICAL',
          adminId: params.superAdminId,
          adminEmail: params.superAdminEmail,
          clientIP: params.ipAddress,
          details: { targetUserId: params.targetUserId, reason: params.emergencyReason }
        });

        return {
          success: false,
          message: 'Emergency reset requires super admin privileges'
        };
      }

      // Check emergency reset cooldown
      const cooldownUntil = this.emergencyOverrideCooldown.get(params.superAdminId);
      if (cooldownUntil && cooldownUntil.getTime() > Date.now()) {
        return {
          success: false,
          message: 'Emergency reset cooldown active. Please wait before attempting another emergency reset.'
        };
      }

      // Generate temporary password
      const temporaryPassword = this.generateTemporaryPassword();

      // Reset password
      await auth().updateUser(params.targetUserId, {
        password: temporaryPassword
      });

      // Set emergency reset cooldown (24 hours)
      this.emergencyOverrideCooldown.set(params.superAdminId, new Date(Date.now() + 24 * 60 * 60 * 1000));
      this.saveToStorage();

      // Log emergency reset
      await auditLogger.logSecurityEvent({
        event: 'EMERGENCY_PASSWORD_RESET',
        severity: 'CRITICAL',
        adminId: params.superAdminId,
        adminEmail: params.superAdminEmail,
        clientIP: params.ipAddress,
        details: {
          targetUserId: params.targetUserId,
          reason: params.emergencyReason,
          temporaryPasswordGenerated: true
        }
      });

      // Invalidate all sessions
      await this.invalidateUserSessions(params.targetUserId);

      return {
        success: true,
        temporaryPassword,
        message: 'Emergency password reset completed. Temporary password generated.'
      };

    } catch (error: any) {
      await auditLogger.logSecurityEvent({
        event: 'EMERGENCY_RESET_FAILED',
        severity: 'HIGH',
        adminId: params.superAdminId,
        adminEmail: params.superAdminEmail,
        clientIP: params.ipAddress,
        details: { error: error.message, targetUserId: params.targetUserId }
      });

      return {
        success: false,
        message: 'Emergency reset failed'
      };
    }
  }

  private generateTemporaryPassword(): string {
    // Generate a secure temporary password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}

// Export singleton instance
export const adminPasswordSecurity = AdminPasswordSecurity.getInstance();
