'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, User, Clock, Global, Warning2, TickCircle } from 'iconsax-react';
import { useGlobalToast } from '@/contexts/ToastContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface ActiveSession {
  sessionId: string;
  uid: string;
  email: string;
  role: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  createdAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
}

export default function SessionManager() {
  const { user, isSuperAdmin } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { success, error } = useGlobalToast();

  useEffect(() => {
    if (isSuperAdmin) {
      fetchSessions();
      // Refresh sessions every 30 seconds
      const interval = setInterval(fetchSessions, 30000);
      return () => clearInterval(interval);
    }
  }, [isSuperAdmin]);

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/admin/manage-sessions', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string, userId: string, reason?: string) => {
    setActionLoading(userId);
    try {
      const response = await fetch('/api/admin/manage-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action,
          userId,
          reason: reason || `Action: ${action}`,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        success('Action Completed', data.message);
        fetchSessions(); // Refresh sessions
      } else {
        error('Action Failed', data.error);
      }
    } catch (err) {
      console.error('Action error:', err);
      error('Action Failed', 'An error occurred while performing the action');
    } finally {
      setActionLoading(null);
    }
  };

  const formatLastActivity = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield size={48} className="mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Access Denied</h2>
        <p className="text-gray-500">Super admin privileges required to access session management.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-600">Loading active sessions...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Session Management</h1>
        <p className="text-gray-600">
          Manage active user sessions and admin privileges. Changes take effect immediately.
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-8">
          <User size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">No active sessions found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {sessions.map((session) => (
            <div
              key={session.sessionId}
              className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <User size={20} className="text-gray-500" />
                    <span className="font-medium text-gray-900">{session.email}</span>
                  </div>
                  
                  {session.isSuperAdmin && (
                    <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">
                      Super Admin
                    </span>
                  )}
                  
                  {session.isAdmin && !session.isSuperAdmin && (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                      Admin
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <Clock size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-500">
                    {formatLastActivity(session.lastActivity)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div className="flex items-center space-x-2">
                  <Global size={16} className="text-gray-400" />
                  <span className="text-gray-600">IP: {session.ipAddress}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Shield size={16} className="text-gray-400" />
                  <span className="text-gray-600">Role: {session.role}</span>
                </div>
              </div>

              {session.uid !== user?.uid && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleAction('revoke_session', session.uid)}
                    disabled={actionLoading === session.uid}
                    className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-medium hover:bg-yellow-200 disabled:opacity-50"
                  >
                    {actionLoading === session.uid ? (
                      <LoadingSpinner size="sm" color="gray" />
                    ) : (
                      'Revoke Session'
                    )}
                  </button>

                  {session.isAdmin && (
                    <button
                      onClick={() => handleAction('revoke_admin_privileges', session.uid)}
                      disabled={actionLoading === session.uid}
                      className="px-3 py-1 bg-red-100 text-red-800 rounded text-sm font-medium hover:bg-red-200 disabled:opacity-50"
                    >
                      Remove Admin
                    </button>
                  )}

                  <button
                    onClick={() => handleAction('disable_user', session.uid)}
                    disabled={actionLoading === session.uid}
                    className="px-3 py-1 bg-gray-100 text-gray-800 rounded text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                  >
                    Disable User
                  </button>
                </div>
              )}

              {session.uid === user?.uid && (
                <div className="flex items-center space-x-2 text-sm text-green-600">
                  <TickCircle size={16} />
                  <span>Current Session</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center space-x-2 mb-2">
          <Warning2 size={20} className="text-blue-600" />
          <h3 className="font-medium text-blue-900">Important Notes</h3>
        </div>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Session actions take effect immediately across all tabs and devices</li>
          <li>• Revoking a session will force the user to log in again</li>
          <li>• Removing admin privileges will immediately terminate their access</li>
          <li>• Disabled users cannot log in until re-enabled</li>
        </ul>
      </div>
    </div>
  );
}
