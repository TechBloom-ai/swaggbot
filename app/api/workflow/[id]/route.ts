import { NextRequest } from 'next/server';

import { workflowService } from '@/lib/services/workflow';
import { handleApiError, createSuccessResponse, NotFoundError } from '@/lib/errors';
import { log } from '@/lib/logger';

// GET /api/workflow/[id] - Get workflow details
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    log.info('Fetching workflow', { workflowId: id });

    const workflow = await workflowService.findById(id);

    if (!workflow) {
      throw new NotFoundError('Workflow', id);
    }

    // Parse steps for the response
    const steps = JSON.parse(workflow.steps);

    log.info('Workflow fetched', { workflowId: id });

    return createSuccessResponse({
      workflow: {
        ...workflow,
        steps,
      },
    });
  } catch (error) {
    log.error('Failed to get workflow', error, { route: 'GET /api/workflow/[id]' });
    return handleApiError(error);
  }
}
