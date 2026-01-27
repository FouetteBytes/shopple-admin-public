"use client"

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Activity } from 'iconsax-react';

function Home() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user && isAdmin) {
        // User is authenticated and has admin privileges, redirect to dashboard
        router.push('/app/dashboard');
      } else {
        // User is not authenticated or doesn't have admin privileges, redirect to login
        router.push('/admin/login');
      }
    }
  }, [user, loading, isAdmin, router]);

  // Show loading screen while determining redirect
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Activity size={48} className="text-blue-600 animate-spin" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Initializing Admin Dashboard
        </h2>
        <p className="text-gray-600">
          {loading ? 'Checking authentication...' : 'Redirecting...'}
        </p>
      </div>
    </div>
  );
}

export default Home