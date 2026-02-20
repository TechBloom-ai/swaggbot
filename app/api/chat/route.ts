import { NextRequest } from 'next/server';
import { z } from 'zod';

import { chatService } from '@/lib/services/chat';
import { messageService } from '@/lib/services/message';
import { handleApiError, createSuccessResponse, ValidationError } from '@/lib/errors';
import { log } from '@/lib/logger';

const chatSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID format'),
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long'),
});

// GET /api/chat - Get message history for a session with cursor-based pagination
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      throw new ValidationError('Session ID is required', {
        sessionId: ['Session ID query parameter is required'],
      });
    }

    // Validate UUID format
    const uuidValidation = z.string().uuid().safeParse(sessionId);
    if (!uuidValidation.success) {
      throw new ValidationError('Invalid session ID format', {
        sessionId: ['Must be a valid UUID'],
      });
    }

    // Parse pagination params
    const cursor = searchParams.get('cursor') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const validatedLimit = Math.min(100, Math.max(1, limit));

    log.info('Fetching message history', {
      sessionId,
      cursor: cursor || 'none',
      limit: validatedLimit,
    });

    // Get recent messages with pagination
    const result = await messageService.getRecentMessages(sessionId, cursor, validatedLimit);

    log.info('Message history fetched', {
      sessionId,
      count: result.messages.length,
      hasMore: result.pagination.hasMore,
    });

    return createSuccessResponse(result);
  } catch (error) {
    log.error('Failed to get message history', error, { route: 'GET /api/chat' });
    return handleApiError(error);
  }
}

// POST /api/chat - Send a message and get response
export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('Invalid JSON body');
    }

    // Validate input
    const validation = chatSchema.safeParse(body);
    if (!validation.success) {
      const fields: Record<string, string[]> = {};
      validation.error.issues.forEach(err => {
        const path = err.path.map(String).join('.');
        if (!fields[path]) {
          fields[path] = [];
        }
        fields[path].push(err.message);
      });
      throw new ValidationError('Invalid input', fields);
    }

    const { sessionId, message } = validation.data;

    log.info('Processing chat message', { sessionId, messageLength: message.length });

    // Process message
    const response = await chatService.processMessage({ sessionId, message });

    log.info('Chat message processed', {
      sessionId,
      responseType: response.type,
      success: response.type !== 'error',
    });

    return createSuccessResponse(response);
  } catch (error) {
    log.error('Failed to process chat message', error, { route: 'POST /api/chat' });
    return handleApiError(error);
  }
}
