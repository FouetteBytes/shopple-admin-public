'use client';

import React from 'react';
import AuditLogViewer from '@/components/audit/AuditLogViewer';
import { useAuth } from '@/contexts/AuthContext';

export default function AuditPage() {
  const { isAdmin } = useAuth();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200">
          <h2 className="text-xl font-bold text-red-700 mb-2">Access Denied</h2>
          <p className="text-red-600">You need super admin privileges to view the audit log.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">System Audit Logs</h1>
        <p className="text-gray-600">Monitor system activity, user actions, and security events.</p>
      </div>
      <AuditLogViewer />
    </div>
  );
}
