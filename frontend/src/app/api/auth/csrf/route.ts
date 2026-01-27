import { NextRequest, NextResponse } from 'next/server';
import { CSRFProtection } from '@/lib/csrf-protection';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Generate new CSRF token
    const token = CSRFProtection.generateToken();
    
    // Create response
    const response = NextResponse.json({
      token,
      message: 'CSRF token generated',
    });

    // Set the token in a cookie
    CSRFProtection.setTokenCookie(response, token);

    // Security headers
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('X-Content-Type-Options', 'nosniff');

    return response;
  } catch (error) {
    console.error('CSRF token generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    );
  }
}
