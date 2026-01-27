'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { LoadingOverlay } from '@/components/ui/LoadingSpinner';

interface SimpleSessionGuardProps {
  children: React.ReactNode;
}

/**
 * Simple Session Guard - No refresh loops, minimal logic
 */
export default function SimpleSessionGuard({ children }: SimpleSessionGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [redirecting, setRedirecting] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Check if current route requires authentication
  const requiresAuth = pathname?.startsWith('/app') || 
    (pathname?.startsWith('/admin/') && !pathname?.startsWith('/admin/login'));
  const isLoginPage = pathname === '/admin/login';

  // Clear initial load flag after first render
  useEffect(() => {
    if (initialLoad && !loading) {
      setInitialLoad(false);
    }
  }, [loading, initialLoad]);

  // Handle authentication redirects (only when necessary)
  useEffect(() => {
    if (loading || redirecting || initialLoad) return;

    if (requiresAuth && !user) {
      // Need auth but don't have it - redirect to login
      console.log('SimpleSessionGuard: Redirecting to login (no auth)');
      setRedirecting(true);
      router.replace('/admin/login');
    } else if (isLoginPage && user) {
      // Logged in but on login page - redirect to dashboard
      console.log('SimpleSessionGuard: Redirecting to dashboard (already logged in)');
      setRedirecting(true);
      router.replace('/app/dashboard');
    }
  }, [loading, user, requiresAuth, isLoginPage, router, redirecting, initialLoad]);

  // Reset redirecting flag when location changes
  useEffect(() => {
    setRedirecting(false);
  }, [pathname]);

  // Show loading during initial load or redirects
  if (loading || redirecting || initialLoad) {
    const message = loading ? 'Checking authentication...' : 
                   redirecting ? 'Redirecting...' : 
                   'Loading dashboard...';
    return <LoadingOverlay isVisible={true} message={message} />;
  }

  // Show content if everything is good
  return <>{children}</>;
}
