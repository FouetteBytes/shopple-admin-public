'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuditLogViewer from '@/components/audit/AuditLogViewer';

export default function AuditPage() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!user || (!isAdmin && !isSuperAdmin)) {
    return (
      <div className="p-8 text-center text-red-600">
        You are not authorized to view this page.
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">System Audit Logs</h1>
        <p className="mt-2 text-gray-600">
          Monitor user activity, security events, and system changes.
        </p>
      </div>
      
      <AuditLogViewer />
    </div>
  );
}
