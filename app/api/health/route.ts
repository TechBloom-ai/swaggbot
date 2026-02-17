import { createSuccessResponse, handleApiError } from '@/lib/errors';
import { log } from '@/lib/logger';

export async function GET() {
  try {
    log.debug('Health check requested');

    return createSuccessResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    log.error('Health check failed', error);
    return handleApiError(error);
  }
}
