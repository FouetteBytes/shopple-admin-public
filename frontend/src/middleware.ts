import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow access to the admin login page and static assets.
  if (
    pathname.startsWith('/admin/login') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/static')
  ) {
    return NextResponse.next();
  }

  // Client-side authentication handles routing; middleware can enforce tokens if required.
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except those starting with:
     * - api (API routes)
     * - _next/static (static assets)
     * - _next/image (image optimization assets)
     * - favicon.ico (favicon asset)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
