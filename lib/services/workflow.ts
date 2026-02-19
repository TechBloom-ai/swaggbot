import { eq, desc, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { workflows, workflowExecutions, Workflow, WorkflowExecution } from '@/lib/db/schema';
import { getLLMProvider } from '@/lib/llm';
import { WorkflowStep } from '@/lib/types';
import { log } from '@/lib/logger';

import { RequestExecutor } from './request-executor';
import { sessionService } from './session';

export interface CreateWorkflowInput {
  sessionId: string;
  description: string;
}

export interface WorkflowWithStats extends Workflow {
  executionCount: number;
  lastExecutedAt: Date | null;
}

export interface ExecutionResult {
  success: boolean;
  steps: Array<{
    step: number;
    description: string;
    success: boolean;
    result?: unknown;
    error?: string;
  }>;
  summary: string;
}

export class WorkflowService {
  private llm: ReturnType<typeof getLLMProvider> | null = null;

  private getLLM() {
    if (!this.llm) {
      this.llm = getLLMProvider();
    }
    return this.llm;
  }

  /**
   * Create a new workflow from natural language description
   */
  async create(input: CreateWorkflowInput): Promise<Workflow> {
    const session = await sessionService.findById(input.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const formattedSwagger = sessionService.getFormattedSwagger(session);

    log.info('Planning workflow', { sessionId: input.sessionId, description: input.description });

    // Plan the workflow using LLM
    let steps: WorkflowStep[];
    try {
      steps = await this.getLLM().planWorkflow(
        formattedSwagger,
        input.description,
        !!session.authToken
      );
    } catch (error) {
      log.error('Workflow planning failed', error);
      throw new Error(
        `Failed to plan workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    if (!steps || steps.length === 0) {
      throw new Error('Could not plan workflow. No steps generated.');
    }

    // Validate workflow has proper foreign key fetching for POST requests
    const postSteps = steps.filter(s => s.action.method?.toUpperCase() === 'POST');
    for (const postStep of postSteps) {
      const missingForeignKeySteps = this.validateForeignKeySteps(
        postStep,
        steps,
        formattedSwagger
      );
      if (missingForeignKeySteps.length > 0) {
        throw new Error(
          `Workflow planning error: The LLM failed to include required foreign key fetching steps for ${postStep.action.endpoint}. Missing: ${missingForeignKeySteps.join(', ')}.`
        );
      }
    }

    // Create workflow record
    const now = new Date();
    const workflow: Workflow = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      name: this.generateWorkflowName(input.description),
      description: input.description,
      steps: JSON.stringify(steps),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    await db.insert(workflows).values(workflow);

    log.info('Workflow created', { workflowId: workflow.id, steps: steps.length });

    return workflow;
  }

  /**
   * Execute a workflow synchronously
   */
  async execute(workflowId: string): Promise<ExecutionResult> {
    const workflow = await this.findById(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const session = await sessionService.findById(workflow.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const steps: WorkflowStep[] = JSON.parse(workflow.steps);
    const now = new Date();

    // Update workflow status to running
    await db
      .update(workflows)
      .set({ status: 'running', updatedAt: now })
      .where(eq(workflows.id, workflowId));

    // Create executor with recording callback
    const executor = new RequestExecutor(
      {
        baseUrl: session.baseUrl || '',
        authToken: session.authToken || undefined,
      },
      {
        workflowId,
        onStepComplete: async (step, result) => {
          await this.recordExecution(workflowId, step, {
            request: result.curl || '',
            response: result.response,
            status: result.success ? 'completed' : 'failed',
            error: result.error || null,
          });
        },
      }
    );

    try {
      // Execute all steps
      const execResult = await executor.executeSteps(steps);

      // Format results
      const results: ExecutionResult['steps'] = execResult.steps.map(step => ({
        step: step.step,
        description: step.description,
        success: step.success,
        result: step.response,
        error: step.error,
      }));

      // Update workflow status
      const completedAt = new Date();
      await db
        .update(workflows)
        .set({
          status: execResult.success ? 'completed' : 'failed',
          updatedAt: completedAt,
          completedAt,
        })
        .where(eq(workflows.id, workflowId));

      const stepSummaries = results
        .map(
          r =>
            `- ${r.success ? '✅' : '❌'} **Step ${r.step}:** ${r.description}${r.error ? ` (${r.error})` : ''}`
        )
        .join('\n');

      return {
        success: execResult.success,
        steps: results,
        summary: `### Workflow executed with ${results.length} steps

${stepSummaries}`,
      };
    } catch (error) {
      // Update workflow status to failed
      await db
        .update(workflows)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(workflows.id, workflowId));

      throw error;
    }
  }

  /**
   * Find workflow by ID
   */
  async findById(id: string): Promise<Workflow | null> {
    const results = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
    return results[0] || null;
  }

  /**
   * List all workflows for a session with execution stats
   */
  async findBySessionId(sessionId: string): Promise<WorkflowWithStats[]> {
    const sessionWorkflows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.sessionId, sessionId))
      .orderBy(desc(workflows.createdAt));

    // Get execution stats for each workflow
    const workflowsWithStats: WorkflowWithStats[] = [];
    for (const workflow of sessionWorkflows) {
      const executions = await db
        .select()
        .from(workflowExecutions)
        .where(eq(workflowExecutions.workflowId, workflow.id))
        .orderBy(desc(workflowExecutions.executedAt))
        .limit(1);

      workflowsWithStats.push({
        ...workflow,
        executionCount: await this.getExecutionCount(workflow.id),
        lastExecutedAt: executions[0]?.executedAt || null,
      });
    }

    return workflowsWithStats;
  }

  /**
   * Get execution history for a workflow
   */
  async getExecutionHistory(workflowId: string): Promise<WorkflowExecution[]> {
    return db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, workflowId))
      .orderBy(desc(workflowExecutions.executedAt));
  }

  /**
   * Record a workflow execution step
   */
  private async recordExecution(
    workflowId: string,
    stepNumber: number,
    data: {
      request: string;
      response: unknown;
      status: 'completed' | 'failed';
      error: string | null;
    }
  ): Promise<void> {
    await db.insert(workflowExecutions).values({
      id: crypto.randomUUID(),
      workflowId,
      stepNumber,
      status: data.status,
      request: data.request,
      response: data.response ? JSON.stringify(data.response) : null,
      error: data.error,
      executedAt: new Date(),
    });
  }

  /**
   * Get execution count for a workflow
   */
  private async getExecutionCount(workflowId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, workflowId));
    return result[0]?.count || 0;
  }

  /**
   * Generate a workflow name from description
   */
  private generateWorkflowName(description: string): string {
    // Take first 50 chars and clean up
    const clean = description
      .replace(/[^\w\s]/g, '')
      .trim()
      .substring(0, 50);
    return clean || 'Untitled Workflow';
  }

  /**
   * Validate POST steps have required foreign key fetching steps
   */
  private validateForeignKeySteps(
    postStep: {
      stepNumber: number;
      action: { endpoint: string; method: string };
      description: string;
    },
    allSteps: Array<{
      stepNumber: number;
      action: { endpoint: string; method: string };
      description: string;
    }>,
    swaggerDoc: string
  ): string[] {
    const missingForeignKeys: string[] = [];

    const endpointMatch = swaggerDoc.match(
      new RegExp(
        `### POST ${postStep.action.endpoint.replace(/\//g, '\\/')}([\\s\\S]*?)(?=###|\\n## |$)`
      )
    );
    if (!endpointMatch) {
      return missingForeignKeys;
    }

    const endpointDoc = endpointMatch[0];
    const fieldsMatch = endpointDoc.match(
      /Request Body:[\s\S]*?Fields:([\s\S]*?)(?=Responses:|###|## |$)/
    );
    if (!fieldsMatch) {
      return missingForeignKeys;
    }

    const fieldsSection = fieldsMatch[1];
    const fieldLines = fieldsSection.split('\n');
    const requiredForeignKeys: string[] = [];

    for (const line of fieldLines) {
      const fieldMatch = line.match(/-\s+(\w+_id):\s+\w+\s+\(REQUIRED\).*\[FOREIGN KEY\]/i);
      if (fieldMatch) {
        requiredForeignKeys.push(fieldMatch[1]);
      }
    }

    if (requiredForeignKeys.length === 0) {
      return missingForeignKeys;
    }

    const previousSteps = allSteps.filter(s => s.stepNumber < postStep.stepNumber);

    for (const foreignKey of requiredForeignKeys) {
      const resourceName = foreignKey.replace(/_id$/, '').replace(/_/g, ' ');

      const hasFetchingStep = previousSteps.some(step => {
        const stepDesc = step.description.toLowerCase();
        const stepEndpoint = step.action.endpoint.toLowerCase();

        const descMatches =
          stepDesc.includes(resourceName.toLowerCase()) ||
          stepDesc.includes(resourceName.replace(/s$/, '').toLowerCase());

        const endpointMatches =
          stepEndpoint.includes(resourceName.replace(/_/g, '-')) ||
          stepEndpoint.includes(resourceName.replace(/_/g, ''));

        return step.action.method?.toUpperCase() === 'GET' && (descMatches || endpointMatches);
      });

      if (!hasFetchingStep) {
        missingForeignKeys.push(foreignKey);
      }
    }

    return missingForeignKeys;
  }
}

// Singleton instance
export const workflowService = new WorkflowService();
