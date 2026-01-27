import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.INTERNAL_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join('/');
    const backendUrl = `${BACKEND_URL}/api/admin/avatar/${path}`;

    console.log('[Avatar Proxy] Fetching:', backendUrl);

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Accept': 'image/png,image/*',
      },
    });

    if (!response.ok) {
      console.error('[Avatar Proxy] Backend returned:', response.status);
      return new NextResponse(null, { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('[Avatar Proxy] Error:', error);
    return new NextResponse(null, { status: 500 });
  }
}
