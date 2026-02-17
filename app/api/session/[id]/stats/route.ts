import { NextRequest } from 'next/server';

import { sessionService } from '@/lib/services/session';
import { handleApiError, createSuccessResponse, NotFoundError } from '@/lib/errors';
import { log } from '@/lib/logger';

// GET /api/session/[id]/stats - Get session statistics
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    log.info('Fetching session stats', { sessionId: id });

    // Check if session exists
    const session = await sessionService.findById(id);
    if (!session) {
      throw new NotFoundError('Session', id);
    }

    const stats = await sessionService.getStats(id);

    log.info('Session stats fetched', { sessionId: id });

    return createSuccessResponse({ stats });
  } catch (error) {
    log.error('Failed to get session stats', error, { route: 'GET /api/session/[id]/stats' });
    return handleApiError(error);
  }
}
