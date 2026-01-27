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

// Helper function to run cleanup
async function runCleanup() {
  try {
    const crawlerPath = resolveCrawlerPath();
    
    const command = `python -c "
import sys
import os
sys.path.append('.')
from dotenv import load_dotenv
load_dotenv()
from clean_file_manager import CleanFileStorageManager
import json

manager = CleanFileStorageManager()
try:
    result = manager.cleanup_old_files()
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e), 'success': False}))
"`;

  const { stdout, stderr } = await execAsync(command, { cwd: crawlerPath });
    
    if (stderr) {
      console.error('Cleanup stderr:', stderr);
    }
    
    const result = JSON.parse(stdout.trim());
    return result;
  } catch (error) {
    console.error('Error running cleanup:', error);
    return { error: 'Failed to execute cleanup', success: false };
  }
}

// POST: Trigger cleanup of old local files
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

    const result = await runCleanup();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message || 'Cleanup completed',
        files_removed: result.files_removed || 0
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Cleanup failed' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Cleanup API error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger cleanup' },
      { status: 500 }
    );
  }
}
