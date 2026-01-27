/**
 * Frontend Logger
 * 
 * Captures client-side logs, errors, and console output, then sends them
 * to the backend for centralized logging in OpenSearch.
 * 
 * This is especially useful when the frontend is hosted separately from
 * the backend (e.g., Vercel, Netlify, CloudFront), because it enables
 * capturing client-side errors that would otherwise be lost.
 */

import { API_BASE_URL } from '@/lib/api';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface FrontendLogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  source: 'client' | 'server' | 'worker';
  url?: string;
  userAgent?: string;
  sessionId?: string;
  userId?: string;
  userEmail?: string;
  stack?: string;
  errorName?: string;
  details?: Record<string, any>;
}

class FrontendLogger {
  private static instance: FrontendLogger;
  private queue: FrontendLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isEnabled: boolean = true;
  private batchSize: number = 10;
  private flushIntervalMs: number = 5000; // 5 seconds
  private sessionId: string;

  private constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.setupGlobalErrorHandlers();
    this.startFlushInterval();
  }

  public static getInstance(): FrontendLogger {
    if (!FrontendLogger.instance) {
      FrontendLogger.instance = new FrontendLogger();
    }
    return FrontendLogger.instance;
  }

  private getOrCreateSessionId(): string {
    if (typeof window === 'undefined') {
      return `server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    let sessionId = sessionStorage.getItem('frontend_logger_session_id');
    if (!sessionId) {
      sessionId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('frontend_logger_session_id', sessionId);
    }
    return sessionId;
  }

  private setupGlobalErrorHandlers(): void {
    if (typeof window === 'undefined') return;

    // Capture unhandled errors.
    window.addEventListener('error', (event) => {
      this.error('Uncaught error', {
        errorName: event.error?.name || 'Error',
        stack: event.error?.stack,
        details: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Capture unhandled promise rejections.
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled promise rejection', {
        errorName: 'UnhandledRejection',
        stack: event.reason?.stack,
        details: {
          reason: String(event.reason),
        },
      });
    });

    // Optionally capture console errors.
    const originalConsoleError = console.error;
    console.error = (...args) => {
      originalConsoleError.apply(console, args);
      this.error('Console error', {
        details: { args: args.map(String) },
      });
    };
  }

  private startFlushInterval(): void {
    if (typeof window === 'undefined') return;
    
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);

    // Flush on page unload.
    window.addEventListener('beforeunload', () => {
      this.flush(true);
    });
  }

  private createEntry(
    level: LogLevel,
    message: string,
    options: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>> = {}
  ): FrontendLogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      source: typeof window === 'undefined' ? 'server' : 'client',
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      sessionId: this.sessionId,
      ...options,
    };
  }

  public debug(message: string, options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>): void {
    this.log('DEBUG', message, options);
  }

  public info(message: string, options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>): void {
    this.log('INFO', message, options);
  }

  public warning(message: string, options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>): void {
    this.log('WARNING', message, options);
  }

  public error(message: string, options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>): void {
    this.log('ERROR', message, options);
  }

  public critical(message: string, options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>): void {
    this.log('CRITICAL', message, options);
  }

  private log(
    level: LogLevel,
    message: string,
    options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>
  ): void {
    if (!this.isEnabled) return;

    const entry = this.createEntry(level, message, options);
    this.queue.push(entry);

    // Flush critical errors immediately.
    if (level === 'CRITICAL' || level === 'ERROR') {
      this.flush();
    } else if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  public setUser(userId: string, userEmail: string): void {
    // Store user information for subsequent log entries.
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('frontend_logger_user_id', userId);
      sessionStorage.setItem('frontend_logger_user_email', userEmail);
    }
  }

  private getUserInfo(): { userId?: string; userEmail?: string } {
    if (typeof window === 'undefined') return {};
    return {
      userId: sessionStorage.getItem('frontend_logger_user_id') || undefined,
      userEmail: sessionStorage.getItem('frontend_logger_user_email') || undefined,
    };
  }

  public async flush(sync: boolean = false): Promise<void> {
    if (this.queue.length === 0) return;
    if (!API_BASE_URL && typeof window !== 'undefined') return;

    const entries = [...this.queue];
    this.queue = [];

    // Enrich all entries with user information.
    const userInfo = this.getUserInfo();
    const entriesWithUser = entries.map(entry => ({
      ...entry,
      userId: entry.userId || userInfo.userId,
      userEmail: entry.userEmail || userInfo.userEmail,
    }));

    const url = `${API_BASE_URL}/api/frontend/log`;

    try {
      if (sync && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        // Use sendBeacon to flush logs during page unload.
        navigator.sendBeacon(url, JSON.stringify(entriesWithUser));
      } else {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entriesWithUser),
          keepalive: true,
        });
      }
    } catch (error) {
      // Re-queue failed entries without unbounded retries.
      if (entries.length < 50) {
        this.queue = [...entries, ...this.queue];
      }
    }
  }

  public enable(): void {
    this.isEnabled = true;
  }

  public disable(): void {
    this.isEnabled = false;
  }
}

// Export the singleton instance.
export const frontendLogger = FrontendLogger.getInstance();

// Export convenience functions.
export const logDebug = (message: string, options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>) => 
  frontendLogger.debug(message, options);

export const logInfo = (message: string, options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>) => 
  frontendLogger.info(message, options);

export const logWarning = (message: string, options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>) => 
  frontendLogger.warning(message, options);

export const logError = (message: string, options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>) => 
  frontendLogger.error(message, options);

export const logCritical = (message: string, options?: Partial<Omit<FrontendLogEntry, 'level' | 'message' | 'timestamp'>>) => 
  frontendLogger.critical(message, options);

export const setLoggerUser = (userId: string, userEmail: string) => 
  frontendLogger.setUser(userId, userEmail);
