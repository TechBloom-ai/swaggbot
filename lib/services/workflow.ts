import { eq, desc, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { workflows, workflowExecutions, Workflow, WorkflowExecution } from '@/lib/db/schema';
import { getLLMProvider } from '@/lib/llm';
import { executeCurl } from '@/lib/utils/curl';
import { WorkflowStep } from '@/lib/types';
import { log } from '@/lib/logger';

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

    const results: ExecutionResult['steps'] = [];
    const extractedData: Record<string, unknown> = {};
    let allSuccess = true;

    try {
      for (const step of steps) {
        log.info(`Executing workflow step ${step.stepNumber}`, {
          workflowId,
          step: step.description,
        });

        try {
          // Replace placeholders in endpoint with extracted data
          let endpoint = step.action.endpoint;
          for (const [key, value] of Object.entries(extractedData)) {
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            endpoint = endpoint.replace(
              new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'),
              String(value)
            );
          }

          // Build curl command
          const method = step.action.method || 'GET';
          const baseUrl = session.baseUrl || '';
          const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

          let curl = `curl -X ${method} '${url}' -H 'Content-Type: application/json'`;

          // Add auth token if available
          if (session.authToken) {
            const authHeader = session.authToken.startsWith('Bearer ')
              ? session.authToken
              : `Bearer ${session.authToken}`;
            curl += ` -H 'Authorization: ${authHeader}'`;
          }

          // Add body if present
          if (step.action.body && Object.keys(step.action.body).length > 0) {
            const body = this.buildRequestBody(step, steps, extractedData);
            curl += ` -d '${body}'`;
          }

          // Execute the curl
          const executionResult = await executeCurl(curl);

          // Record execution
          await this.recordExecution(workflowId, step.stepNumber, {
            request: curl,
            response: executionResult.response,
            status: executionResult.success ? 'completed' : 'failed',
            error: executionResult.success ? null : executionResult.stderr || 'Execution failed',
          });

          // Check for token expiration
          if (executionResult.httpCode === 401) {
            results.push({
              step: step.stepNumber,
              description: step.description,
              success: false,
              error: 'Authentication token expired',
            });
            allSuccess = false;
            break;
          }

          if (executionResult.success && executionResult.response) {
            // Extract data for future steps
            if (step.extractFields && step.extractFields.length > 0) {
              this.extractDataFromResponse(executionResult.response, step, extractedData);
            }

            results.push({
              step: step.stepNumber,
              description: step.description,
              success: true,
              result: executionResult.response,
            });
          } else {
            results.push({
              step: step.stepNumber,
              description: step.description,
              success: false,
              error: executionResult.stderr || 'Execution failed',
            });
            allSuccess = false;
            break;
          }
        } catch (error) {
          log.error(`Step ${step.stepNumber} failed`, error);
          results.push({
            step: step.stepNumber,
            description: step.description,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          allSuccess = false;
          break;
        }
      }

      // Update workflow status
      const completedAt = new Date();
      await db
        .update(workflows)
        .set({
          status: allSuccess ? 'completed' : 'failed',
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
        success: allSuccess,
        steps: results,
        summary: `### Workflow executed with ${results.length} steps\n\n${stepSummaries}`,
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
   * Build request body with placeholder replacement
   */
  private buildRequestBody(
    step: WorkflowStep,
    allSteps: WorkflowStep[],
    extractedData: Record<string, unknown>
  ): string {
    if (!step.action.body) {
      return '{}';
    }

    // Build field-to-step mapping
    const fieldToStepMap: Record<string, number> = {};
    for (const s of allSteps) {
      if (s.stepNumber >= step.stepNumber) {
        continue;
      }
      if (s.extractFields && s.extractFields.length > 0) {
        for (const field of s.extractFields) {
          if (field === 'id' || field === '[0].id' || field === '0.id') {
            const semanticField = this.extractSemanticFieldName(s.description);
            if (semanticField) {
              fieldToStepMap[semanticField] = s.stepNumber;
            }
          } else {
            fieldToStepMap[field] = s.stepNumber;
          }
        }
      }
    }

    // Replace placeholders in body
    let body = JSON.stringify(step.action.body);

    // Handle semantic keys
    for (const [key, value] of Object.entries(extractedData)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const placeholder = `"\\{\\{${escapedKey}\\}\\}"`;
      if (body.includes(`{{${key}}}`)) {
        body = body.replace(new RegExp(placeholder, 'g'), JSON.stringify(value));
      }
    }

    // Resolve remaining placeholders
    let bodyObj: Record<string, unknown>;
    try {
      bodyObj = JSON.parse(body);
    } catch {
      bodyObj = step.action.body;
    }

    for (const [fieldName, fieldValue] of Object.entries(bodyObj)) {
      if (
        typeof fieldValue === 'string' &&
        fieldValue.startsWith('{{') &&
        fieldValue.endsWith('}}')
      ) {
        const placeholderContent = fieldValue.slice(2, -2);
        let resolvedValue: unknown = undefined;

        // Strategy 1: Look for step that extracts this specific field
        const targetStepNumber = fieldToStepMap[fieldName];
        if (targetStepNumber) {
          const stepKey = `step${targetStepNumber}_0_id`;
          resolvedValue = extractedData[stepKey];
          if (resolvedValue === undefined) {
            resolvedValue = extractedData[fieldName];
          }
        }

        // Strategy 2: If placeholder contains array notation
        if (resolvedValue === undefined && placeholderContent.includes('[')) {
          const normalizedPlaceholder = placeholderContent.replace(/\[(\d+)\]/g, '$1');
          for (const prevStep of allSteps) {
            if (prevStep.stepNumber >= step.stepNumber) {
              continue;
            }
            const stepKey = `step${prevStep.stepNumber}_${normalizedPlaceholder.replace(/\./g, '_')}`;
            if (extractedData[stepKey] !== undefined) {
              resolvedValue = extractedData[stepKey];
              break;
            }
          }
        }

        // Strategy 3: Look for any step that might have extracted an ID
        if (resolvedValue === undefined && fieldName.endsWith('_id')) {
          for (const prevStep of allSteps) {
            if (prevStep.stepNumber >= step.stepNumber) {
              continue;
            }
            const stepIdKey = `step${prevStep.stepNumber}_0_id`;
            if (extractedData[stepIdKey] !== undefined) {
              if (this.fieldMatchesStepDescription(fieldName, prevStep.description)) {
                resolvedValue = extractedData[stepIdKey];
                break;
              }
            }
          }
        }

        if (resolvedValue !== undefined) {
          body = body.replace(`"${fieldValue}"`, JSON.stringify(resolvedValue));
        }
      }
    }

    return body;
  }

  /**
   * Extract data from response based on step extractFields
   */
  private extractDataFromResponse(
    response: unknown,
    step: WorkflowStep,
    extractedData: Record<string, unknown>
  ): void {
    if (!step.extractFields) {
      return;
    }

    for (const field of step.extractFields) {
      // Check if field uses filter syntax
      const filterMatch = field.match(/^\[([^=]+)=([^\]]+)\](?:\.(.*))?$/);

      if (filterMatch) {
        const value = this.extractFieldFromResponse(response, field);
        if (value !== undefined) {
          extractedData[field] = value;
          extractedData[`step${step.stepNumber}_${field}`] = value;
        }
      } else if (field.match(/^(\[?(\d+)\]?)\.(.+)$/)) {
        const arrayIndexMatch = field.match(/^(\[?(\d+)\]?)\.(.+)$/);
        if (arrayIndexMatch) {
          const [, , index, propPath] = arrayIndexMatch;
          const value = this.extractFieldFromResponse(response, field);

          let storageKey: string;
          const semanticField = this.extractSemanticFieldName(step.description);

          if (semanticField) {
            storageKey = semanticField;
          } else {
            storageKey = `step${step.stepNumber}_${propPath.replace(/\./g, '_')}`;
          }

          if (value !== undefined) {
            extractedData[storageKey] = value;
            const stepSpecificKey = `step${step.stepNumber}_${index}_${propPath}`;
            extractedData[stepSpecificKey] = value;
            extractedData[`step${step.stepNumber}_${field}`] = value;
          }
        }
      } else {
        const value = this.extractFieldFromResponse(response, '0.id');
        if (value !== undefined) {
          const semanticField = this.extractSemanticFieldName(step.description);
          const storageKey = semanticField || field;

          extractedData[storageKey] = value;
          extractedData[`step${step.stepNumber}_${field}`] = value;
        }
      }
    }
  }

  /**
   * Extract field value from response using dot notation
   */
  private extractFieldFromResponse(response: unknown, field: string): unknown {
    if (!response || typeof response !== 'object') {
      return undefined;
    }

    // Check for filter syntax
    const filterMatch = field.match(/^\[([^=]+)=([^\]]+)\](?:\.(.*))?$/);
    if (filterMatch) {
      const [, filterField, filterValue, extractPath] = filterMatch;
      return this.extractFromFilteredArray(response, filterField, filterValue, extractPath);
    }

    const parts = field.split('.');
    let current: unknown = response;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (Array.isArray(current) && !isNaN(Number(part))) {
        current = current[Number(part)];
      } else if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Extract values from array by filtering on a field value
   */
  private extractFromFilteredArray(
    response: unknown,
    filterField: string,
    filterValue: string,
    extractPath?: string
  ): unknown {
    if (!Array.isArray(response)) {
      return undefined;
    }

    // Find all matching items (case-insensitive)
    const matches = response.filter(item => {
      if (item && typeof item === 'object') {
        const itemValue = (item as Record<string, unknown>)[filterField];
        const itemStr = String(itemValue || '').toLowerCase();
        const filterStr = filterValue.toLowerCase();
        return itemStr === filterStr;
      }
      return false;
    });

    if (matches.length === 0) {
      return undefined;
    }

    const extractField = (item: unknown): unknown => {
      if (!extractPath) {
        return item;
      }
      return this.extractFieldFromResponse(item, extractPath);
    };

    if (matches.length === 1) {
      return extractField(matches[0]);
    } else {
      return matches.map(extractField);
    }
  }

  /**
   * Extract semantic field name from step description
   */
  private extractSemanticFieldName(description: string): string | null {
    const desc = description.toLowerCase();

    const fieldMatch = desc.match(/(\w+_id)/);
    if (fieldMatch) {
      return fieldMatch[1];
    }

    if (desc.includes('type service')) {
      return 'type_service_id';
    } else if (desc.includes('payment')) {
      return 'payment_method_id';
    } else if (desc.includes('role')) {
      return 'role_id';
    } else if (desc.includes('employment relationship')) {
      return 'employment_relationship_id';
    } else if (desc.includes('professional area')) {
      return 'professional_area_id';
    } else if (desc.includes('user')) {
      return 'user_id';
    } else if (desc.includes('patient')) {
      return 'patient_id';
    } else if (desc.includes('doctor') || desc.includes('physician')) {
      return 'doctor_id';
    } else if (desc.includes('department')) {
      return 'department_id';
    } else if (desc.includes('category')) {
      return 'category_id';
    } else if (desc.includes('product')) {
      return 'product_id';
    } else if (desc.includes('order')) {
      return 'order_id';
    } else if (desc.includes('client')) {
      return 'client_id';
    } else if (desc.includes('customer')) {
      return 'customer_id';
    } else if (desc.includes('service')) {
      return 'service_id';
    }

    const fetchMatch = desc.match(/fetch\s+(\w+(?:\s+\w+)*)/);
    if (fetchMatch) {
      const resourceName = fetchMatch[1].trim();
      const singular = resourceName.replace(/s$/, '');
      return singular.replace(/\s+/g, '_') + '_id';
    }

    return null;
  }

  /**
   * Check if field name matches step description
   */
  private fieldMatchesStepDescription(fieldName: string, description: string): boolean {
    const field = fieldName.toLowerCase().replace(/_id$/, '');
    const desc = description.toLowerCase();
    const fieldWords = field.replace(/_/g, ' ');
    return desc.includes(fieldWords) || fieldWords.split(' ').every(word => desc.includes(word));
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
