'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { LoadingOverlay } from '@/components/ui/LoadingSpinner';

interface EnhancedSessionGuardProps {
  children: React.ReactNode;
}

/**
 * Enhanced Session Guard with proper redirect handling
 */
export default function EnhancedSessionGuard({ children }: EnhancedSessionGuardProps) {
  const { user, loading, refreshSession } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Check if current route requires authentication
  const requiresAuth = pathname?.startsWith('/app') || (pathname?.startsWith('/admin/') && !pathname?.startsWith('/admin/login'));
  const isLoginPage = pathname === '/admin/login';

  // Handle authentication state changes (simplified)
  const handleAuthStateChange = useCallback(() => {
    if (loading) return; // Still loading, don't redirect yet

    if (requiresAuth && !user) {
      // User needs to be authenticated but isn't
      if (!isRedirecting) {
        setIsRedirecting(true);
        router.replace('/admin/login');
      }
    } else if (isLoginPage && user) {
      // User is authenticated but on login page
      if (!isRedirecting) {
        setIsRedirecting(true);
        router.replace('/app/dashboard');
      }
    } else {
      // User is authenticated or on login page - all good
      setIsRedirecting(false);
      if (!initialized) {
        setInitialized(true);
      }
    }
  }, [loading, user, requiresAuth, isLoginPage, router, isRedirecting, initialized]);

  // Set up authentication state monitoring (heavily simplified)
  useEffect(() => {
    if (!loading) {
      handleAuthStateChange();
    }
  }, [loading, user, handleAuthStateChange]);

  // Force initialization after timeout to prevent infinite loading
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!initialized) {
        console.log('EnhancedSessionGuard: Force initializing after 3 seconds');
        setInitialized(true);
        setIsRedirecting(false);
      }
    }, 3000); // 3 second timeout

    return () => clearTimeout(timeoutId);
  }, [initialized]);

  // Handle cross-tab logout synchronization (minimal)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'auth_logout_event' && requiresAuth && !isRedirecting) {
        setIsRedirecting(true);
        router.replace('/admin/login');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [requiresAuth, router, isRedirecting]);

  // Remove excessive session refresh - only refresh on manual user action
  // No automatic refresh on visibility/focus changes to prevent loops

  // Show loading overlay during initialization or redirection
  if ((loading && !initialized) || isRedirecting) {
    return <LoadingOverlay isVisible={true} message="Loading..." />;
  }

  // Force show content if initialized (prevent infinite loading)
  if (initialized && !isRedirecting) {
    return <>{children}</>;
  }

  // If user is not authenticated and trying to access protected route
  if (requiresAuth && !user && !loading && !isRedirecting) {
    return <LoadingOverlay isVisible={true} message="Redirecting to login..." />;
  }

  // If user is authenticated but on login page
  if (isLoginPage && user && !loading && !isRedirecting) {
    return <LoadingOverlay isVisible={true} message="Redirecting to dashboard..." />;
  }

  // Default: show content
  return <>{children}</>;
}
