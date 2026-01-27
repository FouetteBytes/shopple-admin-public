'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface SessionGuardProps {
  children: React.ReactNode;
}

/**
 * SessionGuard Component
 * 
 * Provides comprehensive session protection including:
 * - Cross-tab logout synchronization
 * - History manipulation prevention
 * - Session validation on focus/visibility changes
 * - Protection against back button access after logout
 */
export default function SessionGuard({ children }: SessionGuardProps) {
  const { user, loading, refreshSession, isLoggingOut } = useAuth();
  const router = useRouter();
  const [isValidating, setIsValidating] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const isInitialized = useRef(false);

  // Clear history and redirect function
  const clearHistoryAndRedirect = useCallback(() => {
    const loginUrl = '/admin/login';
    
    // Replace current history state
    window.history.replaceState(null, '', loginUrl);
    
    // Add multiple entries to prevent back navigation
    for (let i = 0; i < 10; i++) {
      window.history.pushState(null, '', loginUrl);
    }
    
    // Set up permanent popstate listener
    const permanentBackPrevention = (event: PopStateEvent) => {
      event.preventDefault();
      event.stopPropagation();
      window.history.pushState(null, '', loginUrl);
      window.location.replace(loginUrl);
    };
    
    // Remove any existing listeners first
    window.removeEventListener('popstate', permanentBackPrevention);
    window.addEventListener('popstate', permanentBackPrevention);
    
    // Store the listener reference for global access
    (window as any).preventBackNavigation = permanentBackPrevention;
    
    // Force immediate redirect
    window.location.replace(loginUrl);
  }, []);

  // Handle cross-tab logout
  const handleCrossTabLogout = useCallback(() => {
    localStorage.removeItem('auth_logout_event');
    clearHistoryAndRedirect();
  }, [clearHistoryAndRedirect]);

  // Prevent back button access
  const preventBackButtonAccess = useCallback(() => {
    const loginUrl = '/admin/login';
    const currentUrl = window.location.href;
    
    if (!currentUrl.includes(loginUrl)) {
      clearHistoryAndRedirect();
    }
  }, [clearHistoryAndRedirect]);

  // Handle session invalid
  const handleSessionInvalid = useCallback(() => {
    // Clear any stored auth data
    localStorage.removeItem('auth_session_refresh');
    sessionStorage.clear();
    
    // Clear all cookies
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    
    // Trigger cross-tab logout
    localStorage.setItem('auth_logout_event', Date.now().toString());
    
    // Aggressive history clearing and redirect
    clearHistoryAndRedirect();
  }, [clearHistoryAndRedirect]);

  // Validate session on focus
  const validateSessionOnFocus = useCallback(async () => {
    if (isValidating) return;
    
    setIsValidating(true);
    try {
      await refreshSession();
    } catch (error) {
      console.error('Session validation failed:', error);
      handleSessionInvalid();
    } finally {
      setIsValidating(false);
    }
  }, [isValidating, refreshSession, handleSessionInvalid]);

  // Validate session periodically
  const validateSessionPeriodically = useCallback(async () => {
    if (isValidating) return;
    
    // Check if user has been inactive for too long
    const inactiveTime = Date.now() - lastActivityRef.current;
    const maxInactiveTime = 30 * 60 * 1000; // 30 minutes
    
    if (inactiveTime > maxInactiveTime) {
      handleSessionInvalid();
      return;
    }

    setIsValidating(true);
    try {
      await refreshSession();
    } catch (error) {
      console.error('Periodic session validation failed:', error);
      handleSessionInvalid();
    } finally {
      setIsValidating(false);
    }
  }, [isValidating, refreshSession, handleSessionInvalid]);

  // DISABLED: Cross-tab logout synchronization to prevent unnecessary refreshes
  // This was causing authentication refreshes when storage events occurred
  /*
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'auth_logout_event') {
        handleCrossTabLogout();
      } else if (event.key === 'auth_session_refresh') {
        refreshSession();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [handleCrossTabLogout, refreshSession]);
  */

  // History manipulation prevention
  useEffect(() => {
    if (!user && !loading && !isLoggingOut && isInitialized.current) {
      preventBackButtonAccess();
    }
  }, [user, loading, isLoggingOut, preventBackButtonAccess]);

  // DISABLED: Session validation on visibility/focus changes to prevent work loss
  // This was causing "authenticating" refreshes when switching tabs
  /*
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        validateSessionOnFocus();
      }
    };

    const handleFocus = () => {
      if (user) {
        validateSessionOnFocus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, validateSessionOnFocus]);
  */

  // Activity tracking
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
    };
  }, []);

  // Initialize after first render
  useEffect(() => {
    if (!loading) {
      isInitialized.current = true;
    }
  }, [loading]);

  // DISABLED: Periodic session validation to prevent work interruptions
  // This was causing "authenticating" refreshes every 5 minutes
  /*
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      validateSessionPeriodically();
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(interval);
  }, [user, validateSessionPeriodically]);
  */

  // Page unload cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user) {
        // Store last activity time
        localStorage.setItem('last_activity', lastActivityRef.current.toString());
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user]);

  return (
    <>
      {children}
      {/* Loading overlay during validation - Dashboard Theme */}
      {isValidating && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-primary"></div>
              <span className="text-sm text-gray-600">Validating session...</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
