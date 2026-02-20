/**
 * Request Executor Service
 * Shared execution logic for workflow steps and chat commands
 * Eliminates duplication between chat.ts and workflow.ts
 */

import { WorkflowStep } from '@/lib/types';
import { log } from '@/lib/logger';
import { executeCurl } from '@/lib/utils/curl';

export interface RequestContext {
  baseUrl: string;
  authToken?: string;
}

export interface ExecutionOptions {
  workflowId?: string;
  onStepComplete?: (step: number, result: StepResult) => void | Promise<void>;
  onAuthSuccess?: (token: string, tokenPath?: string) => void | Promise<void>;
}

export interface StepResult {
  step: number;
  description: string;
  success: boolean;
  curl?: string;
  response?: unknown;
  error?: string;
  extractedData?: Record<string, unknown>;
  httpCode?: number;
}

export interface ExecutionResult {
  success: boolean;
  steps: StepResult[];
  extractedData: Record<string, unknown>;
}

export class RequestExecutor {
  constructor(
    private context: RequestContext,
    private options?: ExecutionOptions
  ) {}

  /**
   * Execute a series of workflow steps
   */
  async executeSteps(steps: WorkflowStep[]): Promise<ExecutionResult> {
    const results: StepResult[] = [];
    const extractedData: Record<string, unknown> = {};

    for (const step of steps) {
      const result = await this.executeStep(step, steps, extractedData);
      results.push(result);

      if (!result.success) {
        log.error(
          `[WORKFLOW] Step ${step.stepNumber} failed`,
          new Error(result.error || 'Unknown error')
        );
        return {
          success: false,
          steps: results,
          extractedData,
        };
      }

      // Call optional callback for recording
      if (this.options?.onStepComplete) {
        await this.options.onStepComplete(step.stepNumber, result);
      }
    }

    return {
      success: true,
      steps: results,
      extractedData,
    };
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    allSteps: WorkflowStep[],
    extractedData: Record<string, unknown>
  ): Promise<StepResult> {
    try {
      // Build and execute curl command
      const curl = this.buildCurlCommand(step, extractedData);
      log.info(`[WORKFLOW] Built curl command for step ${step.stepNumber}`, {
        description: step.description,
        curl: curl.substring(0, 500),
        curlLength: curl.length,
      });

      const executionResult = await executeCurl(curl);

      // Check for HTTP errors
      if (!executionResult.success) {
        return {
          step: step.stepNumber,
          description: step.description,
          success: false,
          curl,
          error: executionResult.stderr || `HTTP ${executionResult.httpCode}: Request failed`,
          httpCode: executionResult.httpCode,
        };
      }

      // Extract data from response
      this.extractDataFromResponse(executionResult.response, step, extractedData);

      return {
        step: step.stepNumber,
        description: step.description,
        success: true,
        curl,
        response: executionResult.response,
        httpCode: executionResult.httpCode,
        extractedData: { ...extractedData },
      };
    } catch (error) {
      log.error(
        `Step ${step.stepNumber} execution error`,
        error instanceof Error ? error : new Error(String(error))
      );
      return {
        step: step.stepNumber,
        description: step.description,
        success: false,
        error: error instanceof Error ? error.message : 'Step execution failed',
      };
    }
  }

  /**
   * Build curl command from step and accumulated data
   */
  buildCurlCommand(step: WorkflowStep, extractedData: Record<string, unknown>): string {
    // Resolve endpoint placeholders using sophisticated resolution logic
    let endpoint = step.action.endpoint || '';
    const fieldToStepMap = this.buildFieldToStepMap(step, extractedData);

    // Find all {{placeholders}} in endpoint and resolve them
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    let match;
    const placeholders: string[] = [];

    // Collect all placeholders first (to avoid regex lastIndex issues)
    while ((match = placeholderRegex.exec(endpoint)) !== null) {
      placeholders.push(match[1]);
    }

    // Resolve each placeholder
    for (const placeholderName of placeholders) {
      const resolvedValue = this.resolvePlaceholder(
        placeholderName,
        placeholderName,
        fieldToStepMap,
        extractedData
      );

      if (resolvedValue !== undefined) {
        const escapedPlaceholder = placeholderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        endpoint = endpoint.replace(
          new RegExp(`\\{\\{${escapedPlaceholder}\\}\\}`, 'g'),
          String(resolvedValue)
        );
      } else {
        log.warn(`[CURL-BUILD] Could not resolve placeholder: {{${placeholderName}}}`, {
          placeholder: placeholderName,
          availableFields: Object.keys(extractedData),
        });
      }
    }

    // Build URL
    const method = step.action.method || 'GET';
    const url = endpoint.startsWith('http') ? endpoint : `${this.context.baseUrl}${endpoint}`;

    // Build base curl command
    let curl = `curl -X ${method} '${url}' -H 'Content-Type: application/json'`;

    // Add auth token if available
    if (this.context.authToken) {
      const authHeader = this.context.authToken.startsWith('Bearer ')
        ? this.context.authToken
        : `Bearer ${this.context.authToken}`;
      curl += ` -H 'Authorization: ${authHeader}'`;
    }

    // Add body if present
    if (step.action.body && Object.keys(step.action.body).length > 0) {
      const body = this.resolveBodyPlaceholders(step.action.body, step, extractedData);
      curl += ` -d '${body}'`;
    }

    return curl;
  }

  /**
   * Resolve placeholders in request body
   * Option B: Resolve placeholders sequentially - 1st occurrence → step 1, 2nd → step 2, etc.
   */
  private resolveBodyPlaceholders(
    body: Record<string, unknown>,
    step: WorkflowStep,
    extractedData: Record<string, unknown>
  ): string {
    const resolvedBody: Record<string, unknown> = {};

    // Track occurrence count for each placeholder pattern
    // This allows sequential resolution: 1st {{[0].id}} → step1, 2nd {{[0].id}} → step2, etc.
    const placeholderOccurrences: Record<string, number> = {};

    log.info('[CURL-BUILD] Starting sequential placeholder resolution', {
      stepNumber: step.stepNumber,
      bodyFields: Object.keys(body),
      availableSteps: Object.keys(extractedData)
        .filter(k => k.startsWith('step'))
        .map(k => k.match(/step(\d+)_/)?.[1])
        .filter((v, i, a) => v && a.indexOf(v) === i),
    });

    for (const [fieldName, fieldValue] of Object.entries(body)) {
      if (
        typeof fieldValue === 'string' &&
        fieldValue.startsWith('{{') &&
        fieldValue.endsWith('}}')
      ) {
        const placeholderName = fieldValue.slice(2, -2);

        // Increment occurrence counter for this placeholder
        placeholderOccurrences[placeholderName] =
          (placeholderOccurrences[placeholderName] || 0) + 1;
        const occurrenceIndex = placeholderOccurrences[placeholderName];

        log.info(`[CURL-BUILD] Resolving body placeholder (occurrence #${occurrenceIndex})`, {
          fieldName,
          placeholder: placeholderName,
          occurrence: occurrenceIndex,
        });

        // Use sequential resolution strategy
        const resolvedValue = this.resolvePlaceholderSequential(
          placeholderName,
          fieldName,
          occurrenceIndex,
          step,
          extractedData
        );

        log.info(`[CURL-BUILD] Resolved placeholder value`, {
          fieldName,
          placeholder: placeholderName,
          occurrence: occurrenceIndex,
          resolvedValue: resolvedValue?.toString()?.substring(0, 100),
        });

        resolvedBody[fieldName] = resolvedValue !== undefined ? resolvedValue : fieldValue;
      } else {
        resolvedBody[fieldName] = fieldValue;
      }
    }

    return JSON.stringify(resolvedBody);
  }

  /**
   * Resolve placeholder using sequential strategy (Option B)
   * 1st occurrence of any ID placeholder → step 1, 2nd occurrence → step 2, etc.
   * This handles cases where body uses semantic names ({{professional_area_id}})
   * but steps extracted generic IDs ([0].id)
   */
  private resolvePlaceholderSequential(
    placeholderName: string,
    fieldName: string,
    occurrenceIndex: number,
    currentStep: WorkflowStep,
    extractedData: Record<string, unknown>
  ): unknown {
    // First, try to find steps that directly extracted this field name
    let availableSteps = Object.keys(extractedData)
      .filter(key => key.startsWith('step'))
      .map(key => {
        const match = key.match(/step(\d+)_(.+)/);
        return match ? { stepNum: parseInt(match[1], 10), field: match[2] } : null;
      })
      .filter((item): item is { stepNum: number; field: string } => item !== null)
      .filter(item => item.stepNum < currentStep.stepNumber)
      .filter(item => item.field === placeholderName)
      .map(item => item.stepNum)
      .sort((a, b) => a - b);

    // If no direct match, look for steps that extracted generic IDs ([0].id, id, etc.)
    // This handles the case where body uses {{professional_area_id}} but step extracted [0].id
    if (availableSteps.length === 0) {
      const idPatterns = ['[0].id', '0.id', 'id', '[0].uuid', '0.uuid', 'uuid'];

      availableSteps = Object.keys(extractedData)
        .filter(key => key.startsWith('step'))
        .map(key => {
          const match = key.match(/step(\d+)_(.+)/);
          return match ? { stepNum: parseInt(match[1], 10), field: match[2] } : null;
        })
        .filter((item): item is { stepNum: number; field: string } => item !== null)
        .filter(item => item.stepNum < currentStep.stepNumber)
        .filter(item => idPatterns.some(pattern => item.field === pattern))
        .map(item => item.stepNum)
        .sort((a, b) => a - b);

      log.info(`[CURL-BUILD] Using ID pattern matching for sequential resolution`, {
        placeholder: placeholderName,
        idPatterns,
        matchedSteps: availableSteps,
      });
    }

    log.info(`[CURL-BUILD] Sequential resolution lookup`, {
      placeholder: placeholderName,
      occurrence: occurrenceIndex,
      availableStepsWithField: availableSteps,
      currentStepNumber: currentStep.stepNumber,
    });

    // Check if we have enough steps for this occurrence
    if (occurrenceIndex > availableSteps.length) {
      log.warn(`[CURL-BUILD] Not enough steps for occurrence #${occurrenceIndex}`, {
        placeholder: placeholderName,
        availableSteps: availableSteps.length,
        requestedOccurrence: occurrenceIndex,
      });
      return undefined;
    }

    // Get the step number for this occurrence (1-indexed occurrence → 0-indexed array)
    const targetStepNum = availableSteps[occurrenceIndex - 1];

    // Try to find the actual extracted field for this step
    // It could be the exact placeholder name or a generic ID pattern
    let storageKey = `step${targetStepNum}_${placeholderName}`;
    if (extractedData[storageKey] === undefined) {
      // Try generic ID patterns
      const idPatterns = ['[0].id', '0.id', 'id', '[0].uuid', '0.uuid', 'uuid'];
      for (const pattern of idPatterns) {
        const key = `step${targetStepNum}_${pattern}`;
        if (extractedData[key] !== undefined) {
          storageKey = key;
          break;
        }
      }
    }

    log.info(`[CURL-BUILD] Resolved to specific step`, {
      placeholder: placeholderName,
      occurrence: occurrenceIndex,
      targetStep: targetStepNum,
      storageKey,
      value: extractedData[storageKey]?.toString()?.substring(0, 50),
    });

    return extractedData[storageKey];
  }

  /**
   * Build mapping of field names to step numbers
   */
  private buildFieldToStepMap(
    currentStep: WorkflowStep,
    extractedData: Record<string, unknown>
  ): Record<string, number> {
    const fieldToStepMap: Record<string, number> = {};

    // Get all available steps from extractedData keys
    const availableSteps = Object.keys(extractedData)
      .filter(key => key.startsWith('step'))
      .map(key => {
        const match = key.match(/step(\d+)_/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((stepNum): stepNum is number => stepNum !== null);

    for (const stepNum of availableSteps) {
      if (stepNum >= currentStep.stepNumber) {
        continue;
      }

      // Look for fields extracted by this step
      const stepPrefix = `step${stepNum}_`;
      const stepFields = Object.keys(extractedData).filter(key => key.startsWith(stepPrefix));

      for (const field of stepFields) {
        const fieldName = field.replace(stepPrefix, '');
        fieldToStepMap[fieldName] = stepNum;

        // Also map semantic name if it's an ID field with semantic naming (e.g., professional_area_id)
        if (fieldName.endsWith('_id')) {
          fieldToStepMap[fieldName] = stepNum;
        }
      }
    }

    return fieldToStepMap;
  }

  /**
   * Resolve a single placeholder using fallback strategies
   */
  private resolvePlaceholder(
    placeholderName: string,
    fieldName: string,
    fieldToStepMap: Record<string, number>,
    extractedData: Record<string, unknown>
  ): unknown {
    // Strategy 1: Direct lookup in extracted data
    if (extractedData[placeholderName] !== undefined) {
      return extractedData[placeholderName];
    }

    // Strategy 2: Look up via field-to-step mapping
    const stepNum = fieldToStepMap[placeholderName];
    if (stepNum !== undefined) {
      const stepKey = `step${stepNum}_${placeholderName}`;
      if (extractedData[stepKey] !== undefined) {
        return extractedData[stepKey];
      }
      // Try just 'id' if looking for an ID field
      if (placeholderName.endsWith('_id')) {
        const idKey = `step${stepNum}_id`;
        if (extractedData[idKey] !== undefined) {
          return extractedData[idKey];
        }
      }
    }

    // Strategy 3: For _id fields, try to find any step with a matching semantic ID
    if (fieldName.endsWith('_id')) {
      for (const [key, value] of Object.entries(extractedData)) {
        if (key.endsWith('_semantic_id') && value === fieldName.replace('_id', '')) {
          const stepMatch = key.match(/step(\d+)_semantic_id/);
          if (stepMatch) {
            const stepNum = parseInt(stepMatch[1], 10);
            const idKey = `step${stepNum}_id`;
            if (extractedData[idKey] !== undefined) {
              return extractedData[idKey];
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Extract data from response based on step configuration
   */
  extractDataFromResponse(
    response: unknown,
    step: WorkflowStep,
    extractedData: Record<string, unknown>
  ): void {
    if (!step.extractFields || step.extractFields.length === 0) {
      return;
    }

    for (const field of step.extractFields) {
      let value = this.extractFieldFromResponse(response, field);

      // If direct extraction failed and the field looks like a semantic name (e.g., professional_area_id),
      // try common ID extraction patterns as fallback.
      // This handles the case where the LLM uses semantic extractFields names but the API
      // response uses generic keys like "id" inside array elements.
      if (value === undefined && field.endsWith('_id')) {
        const idFallbackPatterns = ['0.id', '[0].id', 'id', '0.uuid', '[0].uuid', 'uuid'];
        for (const pattern of idFallbackPatterns) {
          value = this.extractFieldFromResponse(response, pattern);
          if (value !== undefined) {
            log.info(
              `[EXTRACT] Semantic field "${field}" resolved via fallback pattern "${pattern}"`,
              {
                step: step.stepNumber,
                field,
                fallbackPattern: pattern,
                value: String(value).substring(0, 100),
              }
            );
            break;
          }
        }
      }

      if (value !== undefined) {
        // Store with step prefix
        const storageKey = `step${step.stepNumber}_${field}`;
        extractedData[storageKey] = value;

        // For ID fields, also store semantic name
        if (field === 'id' || field === '[0].id' || field.endsWith('_id')) {
          const semanticName = this.extractSemanticFieldName(step.description);
          if (semanticName) {
            extractedData[`step${step.stepNumber}_semantic_id`] = semanticName;
          }
        }

        log.debug(`Extracted field`, { step: step.stepNumber, field, value });
      } else {
        log.warn(
          `[EXTRACT] Failed to extract field "${field}" from step ${step.stepNumber} response`,
          {
            step: step.stepNumber,
            field,
            responseType: typeof response,
            isArray: Array.isArray(response),
          }
        );
      }
    }
  }

  /**
   * Extract single field value from response using dot notation
   */
  extractFieldFromResponse(response: unknown, field: string): unknown {
    if (!response || typeof response !== 'object') {
      return undefined;
    }

    // Handle filter syntax: [field=value].path
    const filterMatch = field.match(/^\[([^=]+)=([^\]]+)\](?:\.(.*))?$/);
    if (filterMatch) {
      const [, filterField, filterValue, extractPath] = filterMatch;
      return this.extractFromFilteredArray(response, filterField, filterValue, extractPath);
    }

    // Handle regular dot notation
    const parts = field.split('.');
    let current: unknown = response;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle array index notation
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
   * Extract from filtered array using [field=value] syntax
   */
  private extractFromFilteredArray(
    response: unknown,
    filterField: string,
    filterValue: string,
    extractPath?: string
  ): unknown {
    if (!response || typeof response !== 'object') {
      return undefined;
    }

    // Get array from response (could be root or a field)
    let array: unknown[] = [];
    if (Array.isArray(response)) {
      array = response;
    } else {
      // Look for array in common response patterns
      const obj = response as Record<string, unknown>;
      const possibleArrayFields = ['data', 'items', 'results', 'records'];
      for (const field of possibleArrayFields) {
        if (Array.isArray(obj[field])) {
          array = obj[field];
          break;
        }
      }
    }

    if (!Array.isArray(array)) {
      return undefined;
    }

    // Find matching item
    const match = array.find((item: unknown) => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const itemObj = item as Record<string, unknown>;
      return String(itemObj[filterField]) === filterValue;
    });

    if (!match) {
      return undefined;
    }

    // Extract value
    if (extractPath) {
      return this.extractFieldFromResponse(match, extractPath);
    }

    return match;
  }

  /**
   * Extract semantic field name from step description
   */
  extractSemanticFieldName(description: string): string | null {
    const lowerDesc = description.toLowerCase();

    // Common patterns for entity extraction
    const patterns = [
      // "Fetch/Get/Find type services" -> type_service
      {
        regex: /(?:fetch|get|find|retrieve)\s+(.+?)(?:\s+by|\s+for|\s+with|$)/i,
        transform: this.singularize,
      },
      // "Create new type service" -> type_service
      {
        regex: /(?:create|add|make)\s+(?:new\s+)?(.+?)(?:\s+for|\s+with|$)/i,
        transform: this.singularize,
      },
    ];

    for (const pattern of patterns) {
      const match = lowerDesc.match(pattern.regex);
      if (match && match[1]) {
        const entity = pattern.transform(match[1].trim());
        return `${entity}_id`;
      }
    }

    return null;
  }

  /**
   * Convert plural to singular (basic implementation)
   */
  private singularize(word: string): string {
    // Handle common pluralization patterns
    if (word.endsWith('ies')) {
      return word.slice(0, -3) + 'y';
    }
    if (word.endsWith('es')) {
      return word.slice(0, -2);
    }
    if (word.endsWith('s') && !word.endsWith('ss')) {
      return word.slice(0, -1);
    }
    return word;
  }
}
