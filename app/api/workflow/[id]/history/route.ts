import { NextRequest } from 'next/server';

import { workflowService } from '@/lib/services/workflow';
import { handleApiError, createSuccessResponse, NotFoundError } from '@/lib/errors';
import { log } from '@/lib/logger';

// GET /api/workflow/[id]/history - Get workflow execution history
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    log.info('Fetching workflow execution history', { workflowId: id });

    // Check if workflow exists
    const workflow = await workflowService.findById(id);
    if (!workflow) {
      throw new NotFoundError('Workflow', id);
    }

    // Get execution history
    const history = await workflowService.getExecutionHistory(id);

    // Parse response data
    const parsedHistory = history.map(execution => ({
      ...execution,
      response: execution.response ? JSON.parse(execution.response) : null,
    }));

    log.info('Workflow execution history fetched', {
      workflowId: id,
      executionCount: history.length,
    });

    return createSuccessResponse({
      workflowId: id,
      executions: parsedHistory,
    });
  } catch (error) {
    log.error('Failed to get workflow history', error, {
      route: 'GET /api/workflow/[id]/history',
    });
    return handleApiError(error);
  }
}
