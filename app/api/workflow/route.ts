import { NextRequest } from 'next/server';
import { z } from 'zod';

import { workflowService } from '@/lib/services/workflow';
import { sessionService } from '@/lib/services/session';
import {
  handleApiError,
  createSuccessResponse,
  ValidationError,
  NotFoundError,
} from '@/lib/errors';
import { log } from '@/lib/logger';

const createWorkflowSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID format'),
  description: z.string().min(1, 'Description is required').max(1000, 'Description too long'),
});

// POST /api/workflow - Create workflow from natural language
export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('Invalid JSON body');
    }

    // Validate input
    const validation = createWorkflowSchema.safeParse(body);
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

    const { sessionId, description } = validation.data;

    log.info('Creating workflow', { sessionId, descriptionLength: description.length });

    // Check if session exists
    const session = await sessionService.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    // Create workflow
    const workflow = await workflowService.create({ sessionId, description });

    log.info('Workflow created', {
      workflowId: workflow.id,
      steps: JSON.parse(workflow.steps).length,
    });

    return createSuccessResponse({ workflow }, 201);
  } catch (error) {
    log.error('Failed to create workflow', error, { route: 'POST /api/workflow' });
    return handleApiError(error);
  }
}

// GET /api/workflow?sessionId={id} - List all workflows for a session with pagination
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
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Validate pagination params
    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(100, Math.max(1, limit));

    log.info('Fetching workflows for session', {
      sessionId,
      page: validatedPage,
      limit: validatedLimit,
    });

    // Check if session exists
    const session = await sessionService.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    const result = await workflowService.findBySessionId(sessionId, validatedPage, validatedLimit);

    log.info('Workflows fetched', {
      sessionId,
      count: result.workflows.length,
      total: result.pagination.total,
      page: result.pagination.page,
    });

    return createSuccessResponse(result);
  } catch (error) {
    log.error('Failed to list workflows', error, { route: 'GET /api/workflow' });
    return handleApiError(error);
  }
}
