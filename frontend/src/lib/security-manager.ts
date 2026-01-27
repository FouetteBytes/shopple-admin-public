/**
 * Advanced Security Manager for Admin Password Security
 * Implements comprehensive security measures for admin password management
 */

interface RateLimitRule {
  windowMs: number;
  maxAttempts: number;
  blockDurationMs: number;
}

interface SecurityConfig {
  rateLimits: {
    login: RateLimitRule;
    passwordChange: RateLimitRule;
    adminActions: RateLimitRule;
  };
  maxFailedAttempts: {
    perIP: number;
    perUser: number;
  };
  sessionTimeout: number;
  requireStrongPasswords: boolean;
}

export const SECURITY_CONFIG: SecurityConfig = {
  rateLimits: {
    login: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxAttempts: 5,
      blockDurationMs: 30 * 60 * 1000 // 30 minutes
    },
    passwordChange: {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxAttempts: 3,
      blockDurationMs: 2 * 60 * 60 * 1000 // 2 hours
    },
    adminActions: {
      windowMs: 5 * 60 * 1000, // 5 minutes
      maxAttempts: 10,
      blockDurationMs: 15 * 60 * 1000 // 15 minutes
    }
  },
  maxFailedAttempts: {
    perIP: 10,
    perUser: 5
  },
  sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
  requireStrongPasswords: true
};

interface AttemptRecord {
  timestamp: number;
  ip?: string;
  userId?: string;
  action: string;
}

class SecurityManager {
  private static instance: SecurityManager;
  private attempts: Map<string, AttemptRecord[]> = new Map();
  private blockedIPs: Map<string, number> = new Map();
  private blockedUsers: Map<string, number> = new Map();

  private constructor() {
    this.loadFromStorage();
    this.startCleanupTimer();
  }

  public static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager();
    }
    return SecurityManager.instance;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return; // Server-side safety
    
    try {
      const attemptsData = localStorage.getItem('security_attempts');
      const blockedIPsData = localStorage.getItem('blocked_ips');
      const blockedUsersData = localStorage.getItem('blocked_users');

      if (attemptsData) {
        const parsed = JSON.parse(attemptsData);
        this.attempts = new Map(Object.entries(parsed));
      }

      if (blockedIPsData) {
        const parsed = JSON.parse(blockedIPsData);
        this.blockedIPs = new Map(Object.entries(parsed).map(([k, v]) => [k, Number(v)]));
      }

      if (blockedUsersData) {
        const parsed = JSON.parse(blockedUsersData);
        this.blockedUsers = new Map(Object.entries(parsed).map(([k, v]) => [k, Number(v)]));
      }
    } catch (error) {
      console.error('Failed to load security data:', error);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return; // Server-side safety
    
    try {
      localStorage.setItem('security_attempts', JSON.stringify(Object.fromEntries(this.attempts)));
      localStorage.setItem('blocked_ips', JSON.stringify(Object.fromEntries(this.blockedIPs)));
      localStorage.setItem('blocked_users', JSON.stringify(Object.fromEntries(this.blockedUsers)));
    } catch (error) {
      console.error('Failed to save security data:', error);
    }
  }

  private startCleanupTimer(): void {
    // Clean up old records every 10 minutes
    setInterval(() => {
      this.cleanupOldRecords();
    }, 10 * 60 * 1000);
  }

  private cleanupOldRecords(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up attempt records
    Array.from(this.attempts.entries()).forEach(([key, records]) => {
      const filtered = records.filter((record: AttemptRecord) => now - record.timestamp < maxAge);
      if (filtered.length === 0) {
        this.attempts.delete(key);
      } else {
        this.attempts.set(key, filtered);
      }
    });

    // Clean up blocked IPs
    Array.from(this.blockedIPs.entries()).forEach(([ip, blockedUntil]) => {
      if (now > blockedUntil) {
        this.blockedIPs.delete(ip);
      }
    });

    // Clean up blocked users
    Array.from(this.blockedUsers.entries()).forEach(([userId, blockedUntil]) => {
      if (now > blockedUntil) {
        this.blockedUsers.delete(userId);
      }
    });

    this.saveToStorage();
  }

  public isBlocked(ip: string, userId?: string): { blocked: boolean; reason?: string; unblockTime?: Date } {
    const now = Date.now();

    // Check IP block
    const ipBlockTime = this.blockedIPs.get(ip);
    if (ipBlockTime && now < ipBlockTime) {
      return {
        blocked: true,
        reason: 'IP temporarily blocked due to suspicious activity',
        unblockTime: new Date(ipBlockTime)
      };
    }

    // Check user block
    if (userId) {
      const userBlockTime = this.blockedUsers.get(userId);
      if (userBlockTime && now < userBlockTime) {
        return {
          blocked: true,
          reason: 'Account temporarily locked due to security concerns',
          unblockTime: new Date(userBlockTime)
        };
      }
    }

    return { blocked: false };
  }

  public checkRateLimit(
    ip: string,
    action: keyof SecurityConfig['rateLimits'] | string,
    userId?: string
  ): { allowed: boolean; retryAfter?: number; reason?: string } {
    // Map string actions to rate limit categories
    const rateLimitAction = this.mapActionToRateLimit(action);
    const rule = SECURITY_CONFIG.rateLimits[rateLimitAction];
    const now = Date.now();
    const windowStart = now - rule.windowMs;

    // Check if blocked
    const blockStatus = this.isBlocked(ip, userId);
    if (blockStatus.blocked) {
      return {
        allowed: false,
        retryAfter: blockStatus.unblockTime ? blockStatus.unblockTime.getTime() - now : rule.blockDurationMs,
        reason: blockStatus.reason
      };
    }

    // Count recent attempts for this IP and action
    const ipKey = `${ip}:${rateLimitAction}`;
    const ipAttempts = this.attempts.get(ipKey) || [];
    const recentIPAttempts = ipAttempts.filter(attempt => attempt.timestamp > windowStart);

    // Count recent attempts for this user and action (if userId provided)
    let recentUserAttempts: AttemptRecord[] = [];
    if (userId) {
      const userKey = `${userId}:${rateLimitAction}`;
      const userAttempts = this.attempts.get(userKey) || [];
      recentUserAttempts = userAttempts.filter(attempt => attempt.timestamp > windowStart);
    }

    // Check if rate limit exceeded
    const maxReached = recentIPAttempts.length >= rule.maxAttempts ||
      (userId && recentUserAttempts.length >= rule.maxAttempts);

    if (maxReached) {
      // Block the IP and/or user
      this.blockedIPs.set(ip, now + rule.blockDurationMs);
      if (userId) {
        this.blockedUsers.set(userId, now + rule.blockDurationMs);
      }
      this.saveToStorage();

      return {
        allowed: false,
        retryAfter: rule.blockDurationMs,
        reason: `Rate limit exceeded for ${rateLimitAction}. Too many attempts.`
      };
    }

    return { allowed: true };
  }

  private mapActionToRateLimit(action: string): keyof SecurityConfig['rateLimits'] {
    if (action === 'login' || action.includes('login')) return 'login';
    if (action === 'passwordChange' || action.includes('password')) return 'passwordChange';
    return 'adminActions'; // Default for admin operations
  }

  public recordAttempt(action: string, ip: string, userId?: string, success: boolean = false): void {
    const now = Date.now();

    // Record IP attempt
    const ipKey = `${ip}:${action}`;
    const ipAttempts = this.attempts.get(ipKey) || [];
    ipAttempts.push({ timestamp: now, ip, action });
    this.attempts.set(ipKey, ipAttempts);

    // Record user attempt if provided
    if (userId) {
      const userKey = `${userId}:${action}`;
      const userAttempts = this.attempts.get(userKey) || [];
      userAttempts.push({ timestamp: now, userId, action });
      this.attempts.set(userKey, userAttempts);
    }

    // If failed attempt, check for brute force patterns
    if (!success) {
      this.detectBruteForce(ip, userId, action);
    }

    this.saveToStorage();
  }

  private detectBruteForce(ip: string, userId: string | undefined, action: string): void {
    const now = Date.now();
    const window = 15 * 60 * 1000; // 15 minutes
    const windowStart = now - window;

    // Check IP-based brute force
    const ipKey = `${ip}:${action}`;
    const ipAttempts = this.attempts.get(ipKey) || [];
    const recentFailedIP = ipAttempts.filter(
      attempt => attempt.timestamp > windowStart
    ).length;

    if (recentFailedIP >= SECURITY_CONFIG.maxFailedAttempts.perIP) {
      this.blockedIPs.set(ip, now + (60 * 60 * 1000)); // Block for 1 hour
      console.warn(`IP ${ip} blocked due to brute force detection`);
    }

    // Check user-based brute force
    if (userId) {
      const userKey = `${userId}:${action}`;
      const userAttempts = this.attempts.get(userKey) || [];
      const recentFailedUser = userAttempts.filter(
        attempt => attempt.timestamp > windowStart
      ).length;

      if (recentFailedUser >= SECURITY_CONFIG.maxFailedAttempts.perUser) {
        this.blockedUsers.set(userId, now + (30 * 60 * 1000)); // Block for 30 minutes
        console.warn(`User ${userId} blocked due to brute force detection`);
      }
    }

    this.saveToStorage();
  }

  public getSecurityHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    };
  }

  public validateSession(sessionData: any): boolean {
    if (!sessionData || !sessionData.timestamp) {
      return false;
    }

    const now = Date.now();
    const sessionAge = now - sessionData.timestamp;

    return sessionAge < SECURITY_CONFIG.sessionTimeout;
  }

  public generateSecureSessionId(): string {
    const array = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback for environments without crypto.getRandomValues
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  public getSecurityStatus(): {
    blockedIPs: number;
    blockedUsers: number;
    recentAttempts: number;
    activeThreats: number;
  } {
    const now = Date.now();
    const recentWindow = 60 * 60 * 1000; // 1 hour

    let recentAttempts = 0;
    Array.from(this.attempts.values()).forEach(attempts => {
      recentAttempts += attempts.filter(
        (attempt: AttemptRecord) => now - attempt.timestamp < recentWindow
      ).length;
    });

    return {
      blockedIPs: this.blockedIPs.size,
      blockedUsers: this.blockedUsers.size,
      recentAttempts,
      activeThreats: this.blockedIPs.size + this.blockedUsers.size
    };
  }

  public unblockIP(ip: string): boolean {
    return this.blockedIPs.delete(ip);
  }

  public unblockUser(userId: string): boolean {
    return this.blockedUsers.delete(userId);
  }
}

// Utility functions for use in API routes
export function getClientIP(request: Request): string {
  // In production, this should extract from X-Forwarded-For or similar headers
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
         request.headers.get('x-real-ip') || 
         'unknown';
}

export function createSecurityResponse(
  message: string,
  status: number = 429,
  retryAfter?: number
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...securityManager.getSecurityHeaders()
  };

  if (retryAfter) {
    headers['Retry-After'] = Math.ceil(retryAfter / 1000).toString();
  }

  return new Response(
    JSON.stringify({ error: message }),
    { status, headers }
  );
}

// Export singleton instance
export const securityManager = SecurityManager.getInstance();
export default SecurityManager;
