'use client';

import React, { useState } from 'react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { Button } from '@/components/ui/Button';

export const FirebaseAuthLogin: React.FC = () => {
  const { user, loading, isSuperAdmin, isAdmin, signIn, signOut } = useFirebaseAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setError('');

    try {
      await signIn(email, password);
    } catch (error: any) {
      setError(error.message || 'Sign in failed');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setEmail('');
      setPassword('');
      setError('');
    } catch (error: any) {
      setError(error.message || 'Sign out failed');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
          <span className="text-sm text-gray-600">Loading authentication...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
              <span className="text-green-600 text-sm">✓</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Signed in as {user.email}
              </p>
              <div className="flex space-x-2 mt-1">
                {isSuperAdmin && (
                  <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded-full">
                    Super Admin
                  </span>
                )}
                {isAdmin && (
                  <span className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">
                    Admin
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={handleSignOut} className="text-xs">
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Firebase Authentication</h3>
      
      <form onSubmit={handleSignIn} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={isSigningIn}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={isSigningIn}
          />
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}
        
        <Button
          type="submit"
          disabled={isSigningIn || !email || !password}
          className="w-full"
        >
          {isSigningIn ? (
            <>
              <span className="animate-spin mr-2">⚙️</span>
              Signing In...
            </>
          ) : (
            'Sign In'
          )}
        </Button>
      </form>
      
      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800 text-xs">
          <strong>Note:</strong> Only users with Super Admin privileges can delete all products.
        </p>
      </div>
    </div>
  );
};
