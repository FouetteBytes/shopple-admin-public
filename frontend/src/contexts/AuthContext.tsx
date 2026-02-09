'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useCSRFToken } from '@/lib/csrf-protection';
import SessionSync from '@/lib/session-sync';
import { useRouter } from 'next/navigation';
import { LoadingOverlay } from '@/components/ui/LoadingSpinner';

interface AuthUser {
  uid: string;
  email: string;
  displayName?: string;
  role: string;
  permissions: string[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  mustResetPassword?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  error: string | null;
  isLoggingIn: boolean;
  isLoggingOut: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  getAuthToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  error: null,
  isLoggingIn: false,
  isLoggingOut: false,
  login: async () => {},
  logout: async () => {},
  refreshSession: async () => {},
  getAuthToken: async () => null,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [forceLogoutReason, setForceLogoutReason] = useState<string | null>(null);
  const { getHeaders, setToken } = useCSRFToken();
  const router = useRouter();

  // Initialize CSRF token on mount
  useEffect(() => {
    const initializeCSRF = async () => {
      try {
        const response = await fetch('/api/auth/csrf', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setToken(data.token);
        }
      } catch (error) {
        console.error('Failed to initialize CSRF token:', error);
      }
    };

    initializeCSRF();
  }, [setToken]);

  // Check session on component mount with timeout fallback
  useEffect(() => {
    let mounted = true;
    
    const initializeAuth = async () => {
      try {
        await checkSession(true); // Pass true for initial load
      } catch (error) {
        console.error('Initial auth check failed:', error);
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    };
    
    // Set a fallback timeout to ensure loading never gets stuck
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Auth initialization timeout - setting loading to false');
        setLoading(false);
      }
    }, 5000); // 5 second timeout
    
    initializeAuth();
    
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, []); // FIXED: Remove loading dependency to prevent infinite loop

  // DISABLED: Session sync to prevent automatic refreshes
  // Initialize session sync when user logs in
  /*
  // DISABLED: Session sync to prevent tab-switching authentication refreshes
  /*
  useEffect(() => {
    if (user) {
      // Initialize session synchronization
      SessionSync.initialize(
        // On session invalidated
        () => {
          console.log('Session invalidated by admin - logging out');
          setForceLogoutReason('Your session has been terminated by an administrator');
          setIsLoggingOut(true);
          setUser(null);
          setError(null);
          
          // Trigger cross-tab logout
          localStorage.setItem('auth_logout_event', Date.now().toString());
          
          // Clear storage
          sessionStorage.clear();
          localStorage.removeItem('auth_session_refresh');
          
          // Show notification for a brief moment then redirect
          setTimeout(() => {
            setIsLoggingOut(false);
            setForceLogoutReason(null);
            router.replace('/admin/login');
          }, 2000);
        },
        // On user blocked
        (reason: string) => {
          console.log('User blocked:', reason);
          setForceLogoutReason(reason);
          setIsLoggingOut(true);
          setUser(null);
          setError(null);
          
          // Trigger cross-tab logout
          localStorage.setItem('auth_logout_event', Date.now().toString());
          
          // Clear storage
          sessionStorage.clear();
          localStorage.removeItem('auth_session_refresh');
          
          // Show notification for a brief moment then redirect
          setTimeout(() => {
            setIsLoggingOut(false);
            setForceLogoutReason(null);
            router.replace('/admin/login');
          }, 2000);
        }
      );

      // Set up heartbeat interval
      const heartbeatInterval = setInterval(() => {
        SessionSync.sendHeartbeat();
      }, 60000); // 1 minute

      return () => {
        clearInterval(heartbeatInterval);
      };
    } else {
      // Disconnect session sync when user logs out
      SessionSync.disconnect();
    }
  }, [user]); // Removed router from dependencies as it's stable
  */

  // REMOVED: Automatic session validation to prevent interruptions
  // Users can manually refresh if needed
  /*
  useEffect(() => {
    if (user) {
      const interval = setInterval(async () => {
        try {
          console.log('Performing background session validation...');
          await checkSession();
        } catch (error) {
          console.error('Background session validation failed:', error);
          // Only logout if it's a clear authentication failure, not network issues
          if (error instanceof Error && error.message.includes('401')) {
            setUser(null);
            router.replace('/admin/login');
          }
        }
      }, 30 * 60 * 1000); // 30 minutes instead of 5

      return () => clearInterval(interval);
    }
  }, [user]);
  */

  // DISABLED: Cross-tab event listeners to prevent refreshes
  // Listen for cross-tab logout events (but don't auto-refresh sessions)
  /*
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'auth_logout_event') {
        // Another tab logged out, clear user state
        console.log('Cross-tab logout detected');
        setUser(null);
        setError(null);
        
        // Gentle redirect without forcing page reload
        setTimeout(() => {
          router.replace('/admin/login');
        }, 100);
      }
      // Removed auto-refresh on session refresh to prevent interruptions
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);
  */

  const checkSession = async (isInitialLoad: boolean = false) => {
    try {
      // Debug logging to track what's triggering session checks
      console.log(`🔍 checkSession called: isInitialLoad=${isInitialLoad}, timestamp=${new Date().toISOString()}`);
      
      if (isInitialLoad) {
        setLoading(true);
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch('/api/auth/session', {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated) {
          setUser(data.user);
          setError(null);
        } else {
          setUser(null);
          setError(null);
        }
      } else if (response.status === 401 || response.status === 403) {
        // Unauthorized or forbidden - clear user
        setUser(null);
        setError(null);
      } else {
        // Other error - log but don't set error state
        console.error('Session check failed with status:', response.status);
        setUser(null);
        setError(null);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('Session check timed out');
      } else {
        console.error('Session check error:', error);
      }
      setUser(null);
      setError(null);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      setIsLoggingIn(true);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getHeaders(), // Include CSRF headers
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.user) {
        setUser(data.user);
        
        // Don't trigger cross-tab refresh to avoid interruptions
        // localStorage.setItem('auth_session_refresh', Date.now().toString());
        
        // Clear any existing back button prevention
        window.removeEventListener('popstate', (window as any).logoutBackPrevention);
        delete (window as any).logoutBackPrevention;
        
        return; // Successfully logged in
      } else {
        throw new Error(data.error || 'Login failed');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message);
      throw error;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoggingOut(true);
      setError(null);
      
      // Call logout API immediately
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          ...getHeaders(), // Include CSRF headers
        },
        credentials: 'include',
      });
      
      // Clear user state immediately
      setUser(null);
      setError(null);
      
      // Trigger cross-tab logout
      localStorage.setItem('auth_logout_event', Date.now().toString());
      
      // Clear all browser storage
      sessionStorage.clear();
      localStorage.removeItem('auth_session_refresh');
      
      // Clear cookies
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      
      // Disconnect session sync
      SessionSync.disconnect();
      
      // Aggressive history manipulation
      const loginUrl = '/admin/login';
      
      // Clear browser cache
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            caches.delete(name);
          });
        });
      }
      
      // Replace current history and add multiple entries
      window.history.replaceState(null, '', loginUrl);
      for (let i = 0; i < 20; i++) {
        window.history.pushState(null, '', loginUrl);
      }
      
      // Set up aggressive back button prevention
      const preventBack = (event: PopStateEvent) => {
        event.preventDefault();
        event.stopPropagation();
        window.history.pushState(null, '', loginUrl);
        window.location.replace(loginUrl);
      };
      
      // Remove any existing listeners
      window.removeEventListener('popstate', (window as any).logoutBackPrevention);
      window.addEventListener('popstate', preventBack);
      (window as any).logoutBackPrevention = preventBack;
      
      // Clear logout state and redirect
      setIsLoggingOut(false);
      router.replace(loginUrl);
      
    } catch (error) {
      console.error('Logout error:', error);
      
      // Even if API fails, clear everything locally
      setUser(null);
      setError(null);
      setIsLoggingOut(false);
      SessionSync.disconnect();
      localStorage.setItem('auth_logout_event', Date.now().toString());
      sessionStorage.clear();
      
      router.replace('/admin/login');
    }
  };

  const refreshSession = async () => {
    await checkSession(false); // Don't show loading spinner for manual refresh
  };

  const getAuthToken = async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/auth/firebase-token', {
        method: 'GET',
        credentials: 'include',
        headers: getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        return data.idToken;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting Firebase ID token:', error);
      return null;
    }
  };

  const value = {
    user,
    loading,
    isAdmin: user?.isAdmin ?? false,
    isSuperAdmin: user?.isSuperAdmin ?? false,
    error,
    isLoggingIn,
    isLoggingOut,
    login,
    logout,
    refreshSession,
    getAuthToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      
      {/* Loading Overlay */}
      <LoadingOverlay 
        isVisible={isLoggingIn || (isLoggingOut && !forceLogoutReason)}
        message={isLoggingIn ? 'Signing in...' : 'Signing out...'}
      />
      
      {/* Force Logout Notification */}
      {forceLogoutReason && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl border border-red-200 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.996-.833-2.764 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Session Terminated</h3>
              <p className="text-gray-600 mb-4">{forceLogoutReason}</p>
              <p className="text-sm text-gray-500">Redirecting to login...</p>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};
