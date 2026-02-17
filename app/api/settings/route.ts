import { NextRequest } from 'next/server';

import { cleanupService } from '@/lib/services/cleanup';
import { handleApiError, createSuccessResponse } from '@/lib/errors';
import { log } from '@/lib/logger';

// GET /api/settings - Get application info and database stats
export async function GET() {
  try {
    log.info('Fetching settings and database stats');

    const stats = await cleanupService.getStats();

    const appInfo = {
      name: 'Swaggbot',
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
    };

    return createSuccessResponse({
      appInfo,
      database: {
        ...stats,
        sizeFormatted: formatBytes(stats.databaseSize),
      },
    });
  } catch (error) {
    log.error('Failed to get settings', error);
    return handleApiError(error);
  }
}

// POST /api/settings - Run database cleanup
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'cleanup') {
      log.info('Running database cleanup');
      const result = await cleanupService.runFullCleanup();

      if (result.success) {
        return createSuccessResponse({
          success: true,
          message: 'Cleanup completed successfully',
          deleted: {
            sessions: result.deletedSessions,
            workflows: result.deletedWorkflows,
            messages: result.deletedMessages,
          },
        });
      } else {
        return createSuccessResponse(
          {
            success: false,
            error: result.error,
          },
          500
        );
      }
    }

    if (action === 'stats') {
      const stats = await cleanupService.getStats();
      return createSuccessResponse({ stats });
    }

    return createSuccessResponse({ error: 'Invalid action' }, 400);
  } catch (error) {
    log.error('Failed to run cleanup', error);
    return handleApiError(error);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
