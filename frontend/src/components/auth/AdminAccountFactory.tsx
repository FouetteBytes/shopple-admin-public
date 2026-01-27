'use client';

import { useState } from 'react';
import { Crown, Shield, UserAdd } from 'iconsax-react';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalToast } from '@/contexts/ToastContext';
import { adminApi } from '@/lib/auth';
import { validatePassword } from '@/lib/password-security';

export default function AdminAccountFactory() {
  const { user } = useAuth();
  const { success, error } = useGlobalToast();
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const handlePasswordChange = (value: string) => {
    setTemporaryPassword(value);
    if (!value) {
      setValidationErrors([]);
      return;
    }
    const result = validatePassword(value);
    setValidationErrors(result.errors);
  };

  const resetForm = () => {
    setEmail('');
    setDisplayName('');
    setTemporaryPassword('');
    setValidationErrors([]);
    setRole('admin');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.isSuperAdmin || loading) return;

    if (validationErrors.length > 0) {
      error('Weak Password', validationErrors.join(', '));
      return;
    }

    try {
      setLoading(true);
      await adminApi.createUser({
        email,
        password: temporaryPassword,
        displayName,
        isAdmin: true,
        isSuperAdmin: role === 'super_admin',
        forcePasswordReset: true,
      });

      success('Invitation created', `${email} can now sign in and set a permanent password.`);
      resetForm();
    } catch (err: any) {
      console.error('Admin creation error:', err);
      error('Creation failed', err.message || 'Unable to create admin account');
    } finally {
      setLoading(false);
    }
  };

  if (!user?.isSuperAdmin) {
    return (
      <div className="bg-white border border-amber-100 rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-amber-800 mb-2">Restricted area</h2>
        <p className="text-sm text-amber-700">
          Only super admins can provision new admin accounts. Contact your platform administrator if you need access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 text-indigo-600">
            <UserAdd size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Admin account factory</p>
            <h1 className="text-2xl font-bold text-gray-900">Invite a new admin</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-sm font-medium text-gray-700">Account type</label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  role === 'admin'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setRole('admin')}
              >
                <div className="flex items-center space-x-2">
                  <Shield size={18} />
                  <span className="text-sm font-semibold">Admin</span>
                </div>
                <p className="text-xs mt-1 text-gray-500">Full dashboard access, no super powers.</p>
              </button>

              <button
                type="button"
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  role === 'super_admin'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setRole('super_admin')}
              >
                <div className="flex items-center space-x-2">
                  <Crown size={18} />
                  <span className="text-sm font-semibold">Super admin</span>
                </div>
                <p className="text-xs mt-1 text-gray-500">All admin access + user management.</p>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Admin email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-indigo-500"
                placeholder="person@company.com"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-indigo-500"
                placeholder="Full name (optional)"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Temporary password</label>
            <input
              type="password"
              value={temporaryPassword}
              onChange={(e) => handlePasswordChange(e.target.value)}
              className="mt-1 w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-indigo-500"
              placeholder="Share this privately with the admin"
              required
            />
            {validationErrors.length > 0 && (
              <p className="mt-2 text-xs text-red-600">{validationErrors[0]}</p>
            )}
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-600">
            <p className="font-semibold text-gray-800 mb-1">What happens next?</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Share the email + temporary password via a secure channel.</li>
              <li>They must reset the password on first login before accessing the dashboard.</li>
              <li>All actions are logged in OpenSearch for full traceability.</li>
            </ul>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold shadow-lg hover:shadow-xl disabled:opacity-60"
            >
              {loading ? 'Creating account…' : 'Create admin account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
