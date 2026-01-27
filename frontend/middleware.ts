import { NextRequest, NextResponse } from 'next/server';
import SessionManager from './src/lib/session-manager';
import { CSRFProtection } from './src/lib/csrf-protection';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Handle admin routes
  if (pathname.startsWith('/app/')) {
    return await handleAdminRoute(request);
  }

  // Handle API admin routes
  if (pathname.startsWith('/api/admin')) {
    return await handleAdminApiRoute(request);
  }

  // Handle login route
  if (pathname === '/admin/login') {
    return await handleLoginRoute(request);
  }

  // Handle root route
  if (pathname === '/') {
    return await handleRootRoute(request);
  }

  return NextResponse.next();
}

async function handleAdminRoute(request: NextRequest) {
  const sessionCookie = SessionManager.getSessionCookie(request);
  const clientIP = SessionManager.getClientIP(request);

  if (!sessionCookie) {
    // No session cookie, redirect to login
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const session = await SessionManager.validateSession(sessionCookie, clientIP);
  
  if (!session) {
    // Invalid session, redirect to login
    const response = NextResponse.redirect(new URL('/admin/login', request.url));
    SessionManager.clearSessionCookie(response);
    return response;
  }

  if (!session.isAdmin) {
    // User is not an admin, redirect to login
    const response = NextResponse.redirect(new URL('/admin/login', request.url));
    await SessionManager.destroySession(sessionCookie);
    SessionManager.clearSessionCookie(response);
    return response;
  }

  // Restrict Audit Trail to Super Admins
  if (request.nextUrl.pathname.startsWith('/app/audit') && !session.isSuperAdmin) {
     return NextResponse.redirect(new URL('/app/dashboard', request.url));
  }

  // Valid admin session, continue
  const response = NextResponse.next();
  
  // Add user info to headers for the app to use
  response.headers.set('x-user-id', session.uid);
  response.headers.set('x-user-email', session.email);
  response.headers.set('x-user-role', session.role);
  response.headers.set('x-is-admin', session.isAdmin.toString());
  response.headers.set('x-is-super-admin', session.isSuperAdmin.toString());
  
  // Add cache-control headers to prevent back button access after logout
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0, s-maxage=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
  response.headers.set('Last-Modified', new Date().toUTCString());
  response.headers.set('ETag', '""');
  response.headers.set('Vary', '*');
  
  // Additional security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Clear-Site-Data', '"cache", "storage"');
  
  return response;
}

async function handleAdminApiRoute(request: NextRequest) {
  // Check CSRF protection for non-GET requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    const csrfResponse = CSRFProtection.middleware()(request);
    if (csrfResponse) {
      return csrfResponse;
    }
  }

  const response = NextResponse.next();

  // Add security headers for admin routes
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Add cache-control headers to prevent caching of admin API responses
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
  
  // HSTS for HTTPS
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // CSP for admin routes
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-ancestors 'none';"
  );

  return response;
}

async function handleLoginRoute(request: NextRequest) {
  const sessionCookie = SessionManager.getSessionCookie(request);
  const clientIP = SessionManager.getClientIP(request);

  if (sessionCookie) {
    const session = await SessionManager.validateSession(sessionCookie, clientIP);
    
    if (session && session.isAdmin) {
      // Already logged in as admin, redirect to dashboard
      return NextResponse.redirect(new URL('/app/dashboard', request.url));
    }
  }

  // Not logged in or invalid session, show login page
  return NextResponse.next();
}

async function handleRootRoute(request: NextRequest) {
  const sessionCookie = SessionManager.getSessionCookie(request);
  const clientIP = SessionManager.getClientIP(request);

  if (sessionCookie) {
    const session = await SessionManager.validateSession(sessionCookie, clientIP);
    
    if (session && session.isAdmin) {
      // Already logged in as admin, redirect to dashboard
      return NextResponse.redirect(new URL('/app/dashboard', request.url));
    }
  }

  // Not logged in or invalid session, redirect to login
  return NextResponse.redirect(new URL('/admin/login', request.url));
}

export const config = {
  matcher: [
    '/',
    '/admin/login',
    '/app/:path*',
    '/api/admin/:path*'
  ]
};
