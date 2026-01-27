import { NextRequest, NextResponse } from 'next/server';

// Get backend URL from environment variable
// Prefer internal URL for server-side calls (Docker network), fallback to public URL
const BACKEND_URL = process.env.INTERNAL_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;

console.log('API Route Config:', {
  INTERNAL_BACKEND_URL: process.env.INTERNAL_BACKEND_URL,
  NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  RESOLVED_URL: BACKEND_URL
});

/**
 * Proxy requests to backend API
 * Frontend and backend are hosted separately, so we forward requests to the backend
 */
async function callBackendAPI(endpoint: string, options: RequestInit = {}): Promise<any> {
  try {
    const url = `${BACKEND_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Backend request failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Backend API call error:', error);
    throw error;
  }
}

// GET - List all files
export async function GET(request: NextRequest) {
  try {
    const result = await callBackendAPI('/api/crawler/storage/files', {
      method: 'GET',
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/crawler/storage/files error:', error);
    return NextResponse.json(
      { error: 'Failed to list files', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST - Upload files or trigger auto-upload
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Forward the request to the backend API
    const result = await callBackendAPI('/api/crawler/storage/files', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/crawler/storage/files error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// DELETE - Clear files
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    let body: any = {};
    
    // Try to get parameters from request body first (for smart delete)
    try {
      body = await request.json();
    } catch {
      // If no body or invalid JSON, use query parameters
      const clearAll = url.searchParams.get('clearAll');
      if (clearAll) {
        body = { clearAll: clearAll === 'true' };
      }
    }

    // Forward the DELETE request to the backend API
    const result = await callBackendAPI(`/api/crawler/storage/files?${url.searchParams.toString()}`, {
      method: 'DELETE',
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('DELETE /api/crawler/storage/files error:', error);
    return NextResponse.json(
      { error: 'Failed to delete files', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
