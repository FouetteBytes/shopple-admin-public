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

// Helper function to interact with storage config
async function runConfigCommand(operation: string, config?: any) {
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
try:`;

    if (operation === 'get') {
      command += `
    result = {'success': True, 'config': manager.config}`;
    } else if (operation === 'save') {
      const configJson = JSON.stringify(config).replace(/"/g, '\\"');
      command += `
    config = json.loads('${configJson}')
    result = manager.save_config(config)`;
    }

    command += `
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e), 'success': False}))
"`;

    const { stdout, stderr } = await execAsync(command, { cwd: crawlerPath });
    
    if (stderr) {
      console.error('Config command stderr:', stderr);
    }
    
    const result = JSON.parse(stdout.trim());
    return result;
  } catch (error) {
    console.error('Error running config command:', error);
    return { error: 'Failed to execute config operation', success: false };
  }
}

// GET: Get storage configuration
export async function GET(request: NextRequest) {
  try {
    let session = null;
    
    // Try session cookie first (new method)
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

    // Get configuration from clean file manager
    const result = await runConfigCommand('get');
    
    if (result.success) {
      return NextResponse.json(result.config);
    } else {
      // Return default configuration if loading fails
      const defaultConfig = {
        storage_mode: 'both',
        auto_upload: true,
        keep_local_days: 7,
        max_local_files: 50,
        auto_cleanup: true
      };
      return NextResponse.json(defaultConfig);
    }

  } catch (error: any) {
    console.error('Storage config GET API error:', error);
    return NextResponse.json(
      { error: 'Failed to get storage configuration' },
      { status: 500 }
    );
  }
}

// POST: Update storage configuration
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

    const config = await request.json();

    // Validate configuration
    const validKeys = [
      'storage_mode', 'auto_upload', 'keep_local_days', 
      'max_local_files', 'auto_cleanup'
    ];

    const validConfig: any = {};
    for (const key of validKeys) {
      if (key in config) {
        validConfig[key] = config[key];
      }
    }

    // Save configuration using clean file manager
    const result = await runConfigCommand('save', validConfig);

    if (result.success) {
      return NextResponse.json({
        message: 'Storage configuration updated successfully',
        config: validConfig
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Failed to save configuration' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Storage config POST API error:', error);
    return NextResponse.json(
      { error: 'Failed to update storage configuration' },
      { status: 500 }
    );
  }
}
