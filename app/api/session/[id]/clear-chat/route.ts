import { NextRequest } from 'next/server';

import { messageService } from '@/lib/services/message';
import { sessionService } from '@/lib/services/session';
import { handleApiError, createSuccessResponse, NotFoundError } from '@/lib/errors';
import { log } from '@/lib/logger';

// POST /api/session/[id]/clear-chat - Delete all messages for a session
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    log.info('Clearing chat for session', { sessionId: id });

    // Check if session exists
    const session = await sessionService.findById(id);
    if (!session) {
      throw new NotFoundError('Session', id);
    }

    // Count messages before deletion for response
    const messagesBefore = await messageService.getRecentMessages(id, undefined, 1);
    const hasMessages = messagesBefore.messages.length > 0 || messagesBefore.pagination.hasMore;

    // Delete all messages
    await messageService.deleteBySessionId(id);

    // Get count of deleted messages (approximate if there were more than limit)
    let deletedCount = messagesBefore.messages.length;
    if (messagesBefore.pagination.hasMore) {
      // If there were more messages, we don't know exact count, but we know there were some
      deletedCount = messagesBefore.messages.length + 1; // At least 1 more
    }

    log.info('Chat cleared successfully', { sessionId: id, deletedCount });

    return createSuccessResponse({
      success: true,
      deletedCount,
      message: hasMessages
        ? `Deleted ${deletedCount} message${deletedCount === 1 ? '' : 's'}`
        : 'No messages to delete',
    });
  } catch (error) {
    log.error('Failed to clear chat', error, { route: 'POST /api/session/[id]/clear-chat' });
    return handleApiError(error);
  }
}
