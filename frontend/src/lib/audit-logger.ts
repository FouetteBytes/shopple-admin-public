/**
 * Audit Logging System
 * Comprehensive logging for security-sensitive operations
 */

import { API_BASE_URL } from '@/lib/api';

const AUDIT_HTTP_DISABLED = process.env.NEXT_PUBLIC_DISABLE_AUDIT_HTTP === 'true';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: AuditAction;
  resource: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  sessionId?: string;
  success: boolean;
  errorMessage?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  source?: string;
}

export type AuditAction =
  | 'LOGIN_ATTEMPT'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE_ATTEMPT'
  | 'PASSWORD_CHANGE_SUCCESS'
  | 'PASSWORD_CHANGE_FAILURE'
  | 'USER_CREATE'
  | 'USER_DELETE'
  | 'USER_UPDATE'
  | 'ROLE_CHANGE'
  | 'ADMIN_ACCESS'
  | 'SUSPICIOUS_ACTIVITY'
  | 'ACCOUNT_LOCKOUT'
  | 'FAILED_AUTHORIZATION'
  | 'DATA_ACCESS'
  | 'CONFIGURATION_CHANGE'
  | 'PAGE_VIEW'
  | 'UI_INTERACTION'
  | 'API_CALL';

export class AuditLogger {
  private static instance: AuditLogger;
  private logs: AuditLogEntry[] = [];
  private static missingEndpointWarned = false;

  private constructor() {
    this.initializeFromStorage();
  }

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  private initializeFromStorage(): void {
    // Skip initialization on server-side
    if (typeof window === 'undefined') {
      return;
    }
    
    try {
      const stored = localStorage.getItem('audit_logs');
      if (stored) {
        this.logs = JSON.parse(stored).map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }));
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    }
  }

  private persistToStorage(): void {
    // Skip persistence on server-side
    if (typeof window === 'undefined') {
      return;
    }
    
    try {
      // Keep only last 1000 entries to prevent storage overflow
      const logsToStore = this.logs.slice(-1000);
      localStorage.setItem('audit_logs', JSON.stringify(logsToStore));
    } catch (error) {
      console.error('Failed to persist audit logs:', error);
    }
  }

  public async log(
    userId: string,
    userEmail: string,
    action: AuditAction,
    resource: string,
    details: Record<string, any> = {},
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    try {
      const entry: AuditLogEntry = {
        id: this.generateId(),
        timestamp: new Date(),
        userId,
        userEmail,
        action,
        resource,
        details: this.sanitizeDetails(details),
        ipAddress: await this.getClientIP(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
        sessionId: this.getSessionId(),
        success,
        errorMessage,
        riskLevel: this.calculateRiskLevel(action, success, details),
        source: 'admin-frontend'
      };

      this.logs.push(entry);
      this.persistToStorage();

      void this.forwardToServer(entry);

      // Check for suspicious patterns
      this.detectSuspiciousActivity(userId, action, success);

    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  }

  private async forwardToServer(entry: AuditLogEntry): Promise<void> {
    if (AUDIT_HTTP_DISABLED) {
      return;
    }

    // API_BASE_URL can be empty for same-origin requests (K8s/Ingress deployments)
    // In this case, relative paths like /api/audit/log will work correctly
    await this.sendToServer(entry);
  }

  public async logAdminAction(params: {
    adminId: string;
    adminEmail: string;
    action: string;
    details: Record<string, any>;
    clientIP: string;
    success: boolean;
    targetUserId?: string;
  }): Promise<void> {
    await this.log(
      params.adminId,
      params.adminEmail,
      this.mapActionToAuditAction(params.action),
      'admin_management',
      {
        ...params.details,
        clientIP: params.clientIP,
        targetUserId: params.targetUserId
      },
      params.success
    );
  }

  public async logSecurityEvent(params: {
    event: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    adminId: string;
    adminEmail: string;
    clientIP: string;
    details: Record<string, any>;
  }): Promise<void> {
    await this.log(
      params.adminId,
      params.adminEmail,
      'SUSPICIOUS_ACTIVITY',
      'security',
      {
        event: params.event,
        severity: params.severity,
        clientIP: params.clientIP,
        ...params.details
      },
      false // Security events are typically failures or concerns
    );
  }

  private mapActionToAuditAction(action: string): AuditAction {
    const actionMap: { [key: string]: AuditAction } = {
      'LIST_USERS': 'DATA_ACCESS',
      'CREATE_USER': 'USER_CREATE',
      'DELETE_USER': 'USER_DELETE',
      'UPDATE_USER': 'USER_UPDATE',
      'CHANGE_PASSWORD': 'PASSWORD_CHANGE_ATTEMPT',
      'RESET_PASSWORD': 'PASSWORD_CHANGE_ATTEMPT',
      'CHANGE_ROLE': 'ROLE_CHANGE'
    };
    
    return actionMap[action] || 'ADMIN_ACCESS';
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const sanitized = { ...details };
    
    // Remove sensitive information
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential'];
    for (const key in sanitized) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  private async getClientIP(): Promise<string> {
    try {
      // In a real application, this would be provided by the server
      return 'client-ip';
    } catch {
      return 'unknown';
    }
  }

  private getSessionId(): string {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined' && window.sessionStorage) {
      let sessionId = sessionStorage.getItem('session_id');
      if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('session_id', sessionId);
      }
      return sessionId;
    }
    
    // Server-side fallback
    return `server_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateRiskLevel(
    action: AuditAction, 
    success: boolean, 
    details: Record<string, any>
  ): AuditLogEntry['riskLevel'] {
    // Critical risk
    if (!success && ['LOGIN_FAILURE', 'PASSWORD_CHANGE_FAILURE'].includes(action)) {
      return 'critical';
    }
    
    if (['USER_DELETE', 'ROLE_CHANGE', 'ACCOUNT_LOCKOUT'].includes(action)) {
      return 'critical';
    }

    // High risk
    if (['PASSWORD_CHANGE_SUCCESS', 'ADMIN_ACCESS', 'USER_CREATE'].includes(action)) {
      return 'high';
    }

    // Medium risk
    if (['LOGIN_SUCCESS', 'USER_UPDATE', 'CONFIGURATION_CHANGE'].includes(action)) {
      return 'medium';
    }

    return 'low';
  }

  private async sendToServer(entry: AuditLogEntry): Promise<void> {
    try {
      const payload = {
        ...entry,
        timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
        source: entry.source || 'admin-frontend'
      };

      await fetch(`${API_BASE_URL}/api/audit/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        keepalive: true,
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Failed to send audit log to server:', error);
    }
  }

  private detectSuspiciousActivity(userId: string, action: AuditAction, success: boolean): void {
    const recentLogs = this.getRecentLogsForUser(userId, 15 * 60 * 1000); // Last 15 minutes

    // Multiple failed login attempts
    if (action === 'LOGIN_FAILURE') {
      const failedAttempts = recentLogs.filter(
        log => log.action === 'LOGIN_FAILURE' && !log.success
      ).length;

      if (failedAttempts >= 3) {
        this.log(
          userId,
          'system',
          'SUSPICIOUS_ACTIVITY',
          'authentication',
          { 
            reason: 'Multiple failed login attempts',
            failedAttempts,
            timeWindow: '15 minutes'
          },
          true
        );
      }
    }

    // Rapid password changes
    if (action === 'PASSWORD_CHANGE_SUCCESS') {
      const passwordChanges = recentLogs.filter(
        log => log.action === 'PASSWORD_CHANGE_SUCCESS' && log.success
      ).length;

      if (passwordChanges >= 2) {
        this.log(
          userId,
          'system',
          'SUSPICIOUS_ACTIVITY',
          'password_management',
          {
            reason: 'Multiple password changes in short time',
            changes: passwordChanges,
            timeWindow: '15 minutes'
          },
          true
        );
      }
    }
  }

  public getRecentLogsForUser(userId: string, timeWindowMs: number): AuditLogEntry[] {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return this.logs.filter(
      log => log.userId === userId && log.timestamp >= cutoff
    );
  }

  public getLogs(
    filters: {
      userId?: string;
      action?: AuditAction;
      riskLevel?: AuditLogEntry['riskLevel'];
      success?: boolean;
      from?: Date;
      to?: Date;
    } = {},
    limit: number = 100
  ): AuditLogEntry[] {
    let filtered = [...this.logs];

    if (filters.userId) {
      filtered = filtered.filter(log => log.userId === filters.userId);
    }

    if (filters.action) {
      filtered = filtered.filter(log => log.action === filters.action);
    }

    if (filters.riskLevel) {
      filtered = filtered.filter(log => log.riskLevel === filters.riskLevel);
    }

    if (filters.success !== undefined) {
      filtered = filtered.filter(log => log.success === filters.success);
    }

    if (filters.from) {
      filtered = filtered.filter(log => log.timestamp >= filters.from!);
    }

    if (filters.to) {
      filtered = filtered.filter(log => log.timestamp <= filters.to!);
    }

    // Sort by timestamp (newest first) and limit
    return filtered
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  public getSecuritySummary(): {
    totalLogs: number;
    criticalEvents: number;
    failedLogins: number;
    suspiciousActivity: number;
    recentActivity: AuditLogEntry[];
  } {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLogs = this.logs.filter(log => log.timestamp >= last24Hours);

    return {
      totalLogs: this.logs.length,
      criticalEvents: recentLogs.filter(log => log.riskLevel === 'critical').length,
      failedLogins: recentLogs.filter(log => log.action === 'LOGIN_FAILURE').length,
      suspiciousActivity: recentLogs.filter(log => log.action === 'SUSPICIOUS_ACTIVITY').length,
      recentActivity: recentLogs.slice(0, 10)
    };
  }

  public clearOldLogs(olderThanDays: number = 90): void {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    this.logs = this.logs.filter(log => log.timestamp >= cutoff);
    this.persistToStorage();
  }
}

// Export singleton instance
export const auditLogger = AuditLogger.getInstance();
