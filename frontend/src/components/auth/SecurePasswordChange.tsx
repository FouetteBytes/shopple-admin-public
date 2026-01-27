'use client';

import { useState } from 'react';
import { Eye, EyeSlash, Lock1, Shield, TickCircle, CloseCircle } from 'iconsax-react';
import { validatePassword, type PasswordValidationResult } from '@/lib/password-security';

interface SecurePasswordChangeProps {
  onPasswordChange: (data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    verificationCode?: string;
  }) => Promise<void>;
  loading?: boolean;
  requiresVerification?: boolean;
  onRequestVerification?: () => Promise<void>;
  userRole?: 'admin' | 'super_admin';
}

export default function SecurePasswordChange({
  onPasswordChange,
  loading = false,
  requiresVerification = false,
  onRequestVerification,
  userRole = 'admin'
}: SecurePasswordChangeProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState<PasswordValidationResult | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);

  const handleNewPasswordChange = (value: string) => {
    setNewPassword(value);
    if (value.length > 0) {
      const validation = validatePassword(value);
      setPasswordValidation(validation);
    } else {
      setPasswordValidation(null);
    }
  };

  const getStrengthDescription = (score: number) => {
    if (score >= 15) return 'Very Strong';
    if (score >= 10) return 'Strong';
    if (score >= 5) return 'Moderate';
    if (score >= 2) return 'Weak';
    return 'Very Weak';
  };

  const getStrengthColor = (score: number) => {
    if (score >= 15) return 'text-green-600';
    if (score >= 10) return 'text-blue-600';
    if (score >= 5) return 'text-yellow-600';
    if (score >= 2) return 'text-orange-600';
    return 'text-red-600';
  };

  const getStrengthBg = (score: number) => {
    if (score >= 15) return 'bg-green-600';
    if (score >= 10) return 'bg-blue-600';
    if (score >= 5) return 'bg-yellow-600';
    if (score >= 2) return 'bg-orange-600';
    return 'bg-red-600';
  };

  const getStrengthPercentage = (score: number) => {
    // Convert score to percentage (max reasonable score is about 25)
    return Math.min(100, (score / 25) * 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordValidation?.isValid) {
      return;
    }

    if (newPassword !== confirmPassword) {
      return;
    }

    if (requiresVerification && !verificationCode && !verificationSent) {
      if (onRequestVerification) {
        await onRequestVerification();
        setVerificationSent(true);
      }
      return;
    }

    await onPasswordChange({
      currentPassword,
      newPassword,
      confirmPassword,
      verificationCode: verificationCode || undefined
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-auto">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Lock1 size={24} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Change Password</h2>
          <p className="text-sm text-gray-600">
            {userRole === 'super_admin' ? 'Super Admin' : 'Admin'} - Enhanced Security
          </p>
        </div>
      </div>

      {userRole === 'super_admin' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <div className="flex items-center space-x-2">
            <Shield size={16} className="text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">
              Enhanced Security Required
            </span>
          </div>
          <p className="text-xs text-yellow-700 mt-1">
            Email verification is required for super admin password changes
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current Password
          </label>
          <div className="relative">
            <input
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your current password"
              required
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              {showCurrentPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New Password
          </label>
          <div className="relative">
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => handleNewPasswordChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your new password"
              required
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              {showNewPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          </div>
          
          {/* Password Strength Indicator */}
          {passwordValidation && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Password Strength</span>
                <span className={`text-xs font-medium ${getStrengthColor(passwordValidation.score)}`}>
                  {getStrengthDescription(passwordValidation.score)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getStrengthBg(passwordValidation.score)}`}
                  style={{ width: `${getStrengthPercentage(passwordValidation.score)}%` }}
                />
              </div>
              
              {/* Validation Errors */}
              {passwordValidation.errors.length > 0 && (
                <div className="space-y-1">
                  {passwordValidation.errors.map((error, index) => (
                    <div key={index} className="flex items-center space-x-2 text-xs text-red-600">
                      <CloseCircle size={12} />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Validation Success */}
              {passwordValidation.isValid && (
                <div className="flex items-center space-x-2 text-xs text-green-600">
                  <TickCircle size={12} />
                  <span>Password meets all security requirements</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirm New Password
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Confirm your new password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              {showConfirmPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          </div>
          
          {/* Password Match Indicator */}
          {confirmPassword.length > 0 && (
            <div className="mt-1">
              {newPassword === confirmPassword ? (
                <div className="flex items-center space-x-2 text-xs text-green-600">
                  <TickCircle size={12} />
                  <span>Passwords match</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-xs text-red-600">
                  <CloseCircle size={12} />
                  <span>Passwords do not match</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Email Verification Code */}
        {(requiresVerification || verificationSent) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Verification Code
            </label>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter verification code"
              maxLength={6}
              required={requiresVerification || verificationSent}
            />
            {verificationSent && (
              <p className="text-xs text-blue-600 mt-1">
                Verification code sent to your email. Check your inbox.
              </p>
            )}
          </div>
        )}

        {/* Security Requirements */}
        <div className="bg-gray-50 rounded-lg p-3">
          <h4 className="text-xs font-medium text-gray-700 mb-2">Security Requirements:</h4>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• Minimum 12 characters</li>
            <li>• Uppercase and lowercase letters</li>
            <li>• Numbers and special characters</li>
            <li>• No common passwords or patterns</li>
            <li>• Cannot reuse last 5 passwords</li>
          </ul>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={
            loading || 
            !passwordValidation?.isValid || 
            newPassword !== confirmPassword ||
            !currentPassword ||
            ((requiresVerification || verificationSent) && !verificationCode)
          }
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {loading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Changing Password...</span>
            </div>
          ) : verificationSent && !verificationCode ? (
            'Enter Verification Code'
          ) : (
            'Change Password'
          )}
        </button>
      </form>
    </div>
  );
}
