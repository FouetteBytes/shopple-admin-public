'use client';

import { useEffect, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Activity } from 'iconsax-react';

interface AdminProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export default function AdminProtectedRoute({ 
  children, 
  fallback 
}: AdminProtectedRouteProps) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const forceResetPath = '/app/admin/force-reset';

  useEffect(() => {
    // If not loading and no authenticated admin user, redirect to login
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login');
    }
  }, [user, loading, isAdmin]); // Removed router from dependencies to prevent tab-switch triggers

  useEffect(() => {
    if (!loading && user?.mustResetPassword && pathname !== forceResetPath) {
      router.push(forceResetPath);
    }
  }, [loading, pathname, router, user?.mustResetPassword]);

  // Show loading state while checking authentication
  if (loading) {
    return fallback || <AdminLoadingScreen />;
  }

  // Show loading if redirecting to login
  if (!user || !isAdmin) {
    return fallback || <AdminLoadingScreen />;
  }

  if (user.mustResetPassword && pathname !== forceResetPath) {
    return fallback || <AdminLoadingScreen />;
  }

  // User is authenticated and has admin privileges
  return <>{children}</>;
}

// Default loading screen component
function AdminLoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Activity size={48} className="text-blue-600 animate-spin" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Loading Admin Dashboard
        </h2>
        <p className="text-gray-600">
          Checking authentication...
        </p>
      </div>
    </div>
  );
}
