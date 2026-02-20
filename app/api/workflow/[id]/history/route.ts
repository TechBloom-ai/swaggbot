import { NextRequest } from 'next/server';

import { workflowService } from '@/lib/services/workflow';
import { handleApiError, createSuccessResponse, NotFoundError } from '@/lib/errors';
import { log } from '@/lib/logger';

// GET /api/workflow/[id]/history - Get workflow execution history with cursor-based pagination
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Parse pagination params
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get('cursor') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const validatedLimit = Math.min(100, Math.max(1, limit));

    log.info('Fetching workflow execution history', {
      workflowId: id,
      cursor: cursor || 'none',
      limit: validatedLimit,
    });

    // Check if workflow exists
    const workflow = await workflowService.findById(id);
    if (!workflow) {
      throw new NotFoundError('Workflow', id);
    }

    // Get execution history with pagination
    const result = await workflowService.getExecutionHistory(id, cursor, validatedLimit);

    // Parse response data
    const parsedExecutions = result.executions.map(execution => ({
      ...execution,
      response: execution.response ? JSON.parse(execution.response) : null,
    }));

    log.info('Workflow execution history fetched', {
      workflowId: id,
      executionCount: result.executions.length,
      hasMore: result.pagination.hasMore,
    });

    return createSuccessResponse({
      workflowId: id,
      executions: parsedExecutions,
      pagination: result.pagination,
    });
  } catch (error) {
    log.error('Failed to get workflow history', error, {
      route: 'GET /api/workflow/[id]/history',
    });
    return handleApiError(error);
  }
}
