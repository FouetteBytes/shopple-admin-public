import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.INTERNAL_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;

export async function GET(
  request: NextRequest,
  context: { params: { store: string; category: string; filename: string } }
) {
  if (!BACKEND_URL) {
    return NextResponse.json({ error: 'Backend URL not configured' }, { status: 500 });
  }

  const { store, category, filename } = context.params;
  const backendEndpoint = `${BACKEND_URL}/api/crawler/storage/files/${encodeURIComponent(store)}/${encodeURIComponent(category)}/${encodeURIComponent(filename)}/download-inspect`;

  try {
    const backendResponse = await fetch(backendEndpoint, {
      method: 'GET',
      headers: {
        Cookie: request.headers.get('cookie') ?? '',
      },
    });

    if (!backendResponse.ok || !backendResponse.body) {
      const errorBody = await backendResponse.text();
      return NextResponse.json(
        {
          error: 'Failed to download file',
          details: errorBody || backendResponse.statusText,
        },
        { status: backendResponse.status }
      );
    }

    const headersToForward = [
      'content-type',
      'content-length',
      'content-disposition',
      'x-shopple-storage-status',
      'x-shopple-inspect',
    ];
    const responseHeaders = new Headers();
    backendResponse.headers.forEach((value, key) => {
      if (headersToForward.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Download & inspect proxy failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
