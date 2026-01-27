'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock1, Shield, CloseCircle } from 'iconsax-react';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalToast } from '@/contexts/ToastContext';
import { validatePassword } from '@/lib/password-security';

export default function ForcedPasswordResetPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { success, error } = useGlobalToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [strengthLabel, setStrengthLabel] = useState('');
  const [strengthPercent, setStrengthPercent] = useState(0);

  useEffect(() => {
    if (newPassword) {
      const result = validatePassword(newPassword);
      setValidationErrors(result.errors);
      setStrengthLabel(result.strength);
      setStrengthPercent(Math.min(100, (result.score / 25) * 100));
    } else {
      setValidationErrors([]);
      setStrengthLabel('');
      setStrengthPercent(0);
    }
  }, [newPassword]);

  useEffect(() => {
    if (user && !user.mustResetPassword) {
      router.replace('/app/dashboard');
    }
  }, [router, user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.mustResetPassword || loading) return;

    if (validationErrors.length > 0) {
      error('Weak Password', validationErrors.join(', '));
      return;
    }

    if (newPassword !== confirmPassword) {
      error('Password Mismatch', 'New password and confirmation must match.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/admin/force-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newPassword })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to reset password');
      }

      // Force logout on the client side to ensure clean state
      await logout();

      success('Password Updated', 'Sign in again with your new password.');
      router.replace('/admin/login');
    } catch (err: any) {
      console.error('Force reset error:', err);
      error('Reset Failed', err.message || 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-8">
        <div className="bg-white shadow-xl rounded-2xl p-8 border border-gray-100">
          <div className="flex items-center space-x-4 mb-6">
            <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
              <Lock1 size={28} />
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">Security checkpoint</p>
              <h1 className="text-2xl font-bold text-gray-900">Update your admin password</h1>
            </div>
          </div>

          <p className="text-gray-600 text-sm leading-relaxed mb-6">
            {user?.isSuperAdmin ? 'Super admin' : 'Admin'} access now requires a fresh password. This one-time reset ensures
            your account meets the latest security requirements.
          </p>

          <div className="flex items-start space-x-3 bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
            <Shield size={18} className="text-blue-500 mt-1" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold">Why am I seeing this?</p>
              <p>Your account was created by a super admin. Before accessing the dashboard, set a password only you know.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter a strong password"
                autoComplete="new-password"
                required
              />
              {strengthLabel && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Password strength</span>
                    <span className="font-semibold text-gray-700">{strengthLabel}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                      style={{ width: `${strengthPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Repeat the new password"
                autoComplete="new-password"
                required
              />
            </div>

            {validationErrors.length > 0 && (
              <ul className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
                {validationErrors.map((item, idx) => (
                  <li key={idx} className="flex items-center space-x-2">
                    <CloseCircle size={14} className="text-red-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full py-3.5 rounded-xl text-white font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg hover:shadow-xl disabled:opacity-60"
            >
              {loading ? 'Updating password…' : 'Save new password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
