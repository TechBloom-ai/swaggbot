import { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionService } from '@/lib/services/session';
import {
  handleApiError,
  createSuccessResponse,
  ValidationError,
  NotFoundError,
} from '@/lib/errors';
import { log } from '@/lib/logger';

const updateSessionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  swaggerUrl: z.string().url().optional(),
  authToken: z.string().nullable().optional(),
});

// GET /api/session/[id] - Get session details
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    log.info('Fetching session', { sessionId: id });

    const session = await sessionService.findById(id);

    if (!session) {
      throw new NotFoundError('Session', id);
    }

    log.info('Session fetched', { sessionId: id });

    return createSuccessResponse({ session });
  } catch (error) {
    log.error('Failed to get session', error, { route: 'GET /api/session/[id]' });
    return handleApiError(error);
  }
}

// PATCH /api/session/[id] - Update session
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('Invalid JSON body');
    }

    // Validate input
    const validation = updateSessionSchema.safeParse(body);
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

    log.info('Updating session', { sessionId: id, updates: Object.keys(validation.data) });

    // Check if session exists
    const existingSession = await sessionService.findById(id);
    if (!existingSession) {
      throw new NotFoundError('Session', id);
    }

    // Update session
    const session = await sessionService.update(id, validation.data);
    log.info('Session updated', { sessionId: id });

    return createSuccessResponse({ session });
  } catch (error) {
    log.error('Failed to update session', error, { route: 'PATCH /api/session/[id]' });
    return handleApiError(error);
  }
}

// DELETE /api/session/[id] - Delete session
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    log.info('Deleting session', { sessionId: id });

    // Check if session exists
    const existingSession = await sessionService.findById(id);
    if (!existingSession) {
      throw new NotFoundError('Session', id);
    }

    await sessionService.delete(id);

    log.info('Session deleted', { sessionId: id });

    return createSuccessResponse({ success: true });
  } catch (error) {
    log.error('Failed to delete session', error, { route: 'DELETE /api/session/[id]' });
    return handleApiError(error);
  }
}
