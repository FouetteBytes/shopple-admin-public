'use client';

/**
 * Auth Interceptor - Runs immediately on page load
 * Prevents access to protected pages after logout
 */

// This script runs BEFORE React hydration
if (typeof window !== 'undefined') {
  const isProtectedPage = () => {
    const pathname = window.location.pathname;
    return pathname.startsWith('/app/') || pathname.startsWith('/admin/') && !pathname.includes('/login');
  };

  const hasValidSession = () => {
    // Check if user was recently logged out
    const logoutEvent = localStorage.getItem('auth_logout_event');
    if (logoutEvent) {
      const logoutTime = parseInt(logoutEvent);
      const timeSinceLogout = Date.now() - logoutTime;
      
      // If logout was within the last 5 minutes, block access
      if (timeSinceLogout < 5 * 60 * 1000) {
        return false;
      }
    }

    // Check for session cookie
    const cookies = document.cookie.split(';');
    const sessionCookie = cookies.find(cookie => 
      cookie.trim().startsWith('admin-session=')
    );
    
    return !!sessionCookie;
  };

  const blockAccess = () => {
    console.log(' ACCESS BLOCKED - Redirecting to login');
    
    // Clear everything
    sessionStorage.clear();
    localStorage.removeItem('auth_session_refresh');
    
    // Manipulate history aggressively
    const loginUrl = '/admin/login';
    window.history.replaceState(null, '', loginUrl);
    
    for (let i = 0; i < 10; i++) {
      window.history.pushState(null, '', loginUrl);
    }
    
    // Set up back button prevention
    const preventBack = (event: PopStateEvent) => {
      event.preventDefault();
      window.history.pushState(null, '', loginUrl);
      window.location.replace(loginUrl);
    };
    
    window.addEventListener('popstate', preventBack);
    
    // Immediate redirect
    window.location.replace(loginUrl);
  };

  // Run the check immediately
  if (isProtectedPage() && !hasValidSession()) {
    blockAccess();
  }

  // DISABLED: Automatic checks on visibility/focus to prevent work loss
  // These were causing "authenticating" refreshes when switching tabs
  /*
  // Also check when the page becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isProtectedPage() && !hasValidSession()) {
      blockAccess();
    }
  });

  // Check on page focus
  window.addEventListener('focus', () => {
    if (isProtectedPage() && !hasValidSession()) {
      blockAccess();
    }
  });
  */
}

export default function AuthInterceptor() {
  // This component doesn't render anything but runs the script above
  return null;
}
