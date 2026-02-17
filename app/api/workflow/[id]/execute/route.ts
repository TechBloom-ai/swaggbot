import { NextRequest } from 'next/server';

import { workflowService } from '@/lib/services/workflow';
import { sessionService } from '@/lib/services/session';
import { handleApiError, createSuccessResponse, NotFoundError } from '@/lib/errors';
import { log } from '@/lib/logger';

// POST /api/workflow/[id]/execute - Execute workflow
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    log.info('Executing workflow', { workflowId: id });

    // Check if workflow exists
    const workflow = await workflowService.findById(id);
    if (!workflow) {
      throw new NotFoundError('Workflow', id);
    }

    // Check if session exists
    const session = await sessionService.findById(workflow.sessionId);
    if (!session) {
      throw new NotFoundError('Session', workflow.sessionId);
    }

    // Execute workflow (synchronous - waits for all steps)
    const result = await workflowService.execute(id);

    log.info('Workflow execution completed', {
      workflowId: id,
      success: result.success,
      stepCount: result.steps.length,
    });

    return createSuccessResponse({
      workflowId: id,
      execution: result,
    });
  } catch (error) {
    log.error('Failed to execute workflow', error, { route: 'POST /api/workflow/[id]/execute' });
    return handleApiError(error);
  }
}
