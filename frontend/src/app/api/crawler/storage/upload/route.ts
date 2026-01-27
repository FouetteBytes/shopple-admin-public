import { NextRequest, NextResponse } from 'next/server';
import SessionManager from '@/lib/session-manager';
import { resolveCrawlerPath } from '@/lib/crawler-path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Helper function to get client IP
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0] || realIP || 'unknown';
}

// Helper function to run auto upload
async function runAutoUpload(store: string, category?: string) {
  try {
    const crawlerPath = resolveCrawlerPath();
    
    let command = `python -c "
import sys
import os
sys.path.append('.')
from dotenv import load_dotenv
load_dotenv()
from clean_file_manager import CleanFileStorageManager
import json

manager = CleanFileStorageManager()
try:
    result = manager.auto_upload_new_files('${store}'`;
    
    if (category) {
      command += `, '${category}'`;
    }
    
    command += `)
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e), 'success': False}))
"`;

    const { stdout, stderr } = await execAsync(command, { cwd: crawlerPath });
    
    if (stderr) {
      console.error('Auto upload stderr:', stderr);
    }
    
    const result = JSON.parse(stdout.trim());
    return result;
  } catch (error) {
    console.error('Error running auto upload:', error);
    return { error: 'Failed to execute auto upload', success: false };
  }
}

// POST: Trigger auto-upload for a specific store/category
export async function POST(request: NextRequest) {
  try {
    let session = null;
    
    const sessionCookie = SessionManager.getSessionCookie(request);
    const clientIP = getClientIP(request);
    
    if (sessionCookie) {
      session = await SessionManager.validateSession(sessionCookie, clientIP);
    }

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Admin privileges required' }, { status: 403 });
    }

    const body = await request.json();
    const { store, category } = body;

    if (!store) {
      return NextResponse.json({ error: 'Store is required' }, { status: 400 });
    }

    const result = await runAutoUpload(store, category);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message || 'Auto upload completed',
        uploaded_files: result.uploaded_files || [],
        count: result.count || 0
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Auto upload failed' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Auto upload API error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger auto upload' },
      { status: 500 }
    );
  }
}

// GET: Check upload status and list pending files
export async function GET(request: NextRequest) {
  try {
    let session = null;
    
    const sessionCookie = SessionManager.getSessionCookie(request);
    const clientIP = getClientIP(request);
    
    if (sessionCookie) {
      session = await SessionManager.validateSession(sessionCookie, clientIP);
    }

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Admin privileges required' }, { status: 403 });
    }

    // Get query parameters
    const url = new URL(request.url);
    const store = url.searchParams.get('store') || 'keells';

    // Check for pending uploads by scanning local output directory
    const crawlerPath = resolveCrawlerPath();
    
    const command = `python -c "
import os
import json
from datetime import datetime

output_path = './output'
pending_files = []

if os.path.exists(output_path):
    for store in os.listdir(output_path):
        store_path = os.path.join(output_path, store)
        if not os.path.isdir(store_path):
            continue
            
        for category in os.listdir(store_path):
            category_path = os.path.join(store_path, category)
            if not os.path.isdir(category_path):
                continue
                
            for filename in os.listdir(category_path):
                if filename.endswith('.json'):
                    file_path = os.path.join(category_path, filename)
                    stat = os.stat(file_path)
                    pending_files.append({
                        'store': store,
                        'category': category,
                        'filename': filename,
                        'size': stat.st_size,
                        'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        'path': file_path
                    })

result = {
    'success': True,
    'pending_files': pending_files,
    'total': len(pending_files)
}

print(json.dumps(result))
"`;

  const { stdout, stderr } = await execAsync(command, { cwd: crawlerPath });
    
    if (stderr) {
      console.error('Check upload stderr:', stderr);
    }
    
    const result = JSON.parse(stdout.trim());
    
    // Filter by store if specified
    if (store !== 'all') {
      result.pending_files = result.pending_files.filter((file: any) => file.store === store);
      result.total = result.pending_files.length;
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Check upload API error:', error);
    return NextResponse.json(
      { error: 'Failed to check upload status' },
      { status: 500 }
    );
  }
}
