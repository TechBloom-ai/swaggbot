import { getLLMProvider } from '@/lib/llm';
import { executeCurl, validateCurlCommand } from '@/lib/utils/curl';
import { ChatResponse, LLMMessage } from '@/lib/types';
import { Message } from '@/lib/db/schema';
import { log } from '@/lib/logger';

import { RequestExecutor } from './request-executor';
import { sessionService } from './session';
import { tokenExtractorService } from './tokenExtractor';
import { messageService } from './message';

export interface ChatInput {
  sessionId: string;
  message: string;
}

export class ChatService {
  private llm: ReturnType<typeof getLLMProvider> | null = null;

  private getLLM() {
    if (!this.llm) {
      this.llm = getLLMProvider();
    }
    return this.llm;
  }

  async processMessage(input: ChatInput): Promise<ChatResponse> {
    // Get session
    const session = await sessionService.findById(input.sessionId);
    if (!session) {
      return {
        type: 'error',
        message: 'Session not found',
      };
    }

    // Update last accessed
    await sessionService.updateLastAccessed(input.sessionId);

    // Load recent message history
    let history: LLMMessage[] = [];
    let _userMessageId: string | undefined;
    try {
      const recentMessages = await messageService.getRecentMessages(input.sessionId, 10);
      history = this.convertMessagesToLLMFormat(recentMessages);

      // Save user message
      const userMessage = await messageService.create({
        sessionId: input.sessionId,
        role: 'user',
        content: input.message,
      });
      _userMessageId = userMessage.id;
    } catch (error) {
      log.error('Failed to load history or save user message', error, {
        sessionId: input.sessionId,
        operation: 'load_history_and_save_message',
      });
      // Explain to user and offer to continue without history
      return {
        type: 'error',
        message:
          'I had trouble loading our conversation history. This might be a temporary issue. Please try again, or if the problem persists, I can continue without remembering our previous conversation.',
      };
    }

    // Check if user is referencing a previous workflow
    const workflowReference = await this.detectWorkflowReference(input.message, history);
    if (workflowReference.shouldReexecute && workflowReference.workflowId) {
      return this.handleWorkflowReexecution(
        session,
        workflowReference.workflowId,
        input.message,
        history
      );
    }

    // Classify intent with history
    const intent = await this.getLLM().classifyIntent(input.message, history);

    // Route to appropriate handler
    let response: ChatResponse;
    switch (intent.type) {
      case 'single_request':
        response = await this.handleSingleRequest(session, input.message, history);
        break;

      case 'workflow':
        response = await this.handleWorkflow(session, input.message, history);
        break;

      case 'api_info':
        response = await this.handleApiInfo(session, input.message, history);
        break;

      case 'self_awareness':
        response = this.handleSelfAwareness();
        break;

      default:
        response = {
          type: 'api_info',
          explanation:
            'I can help you explore and interact with your API. Try asking me to perform specific actions like "get all users" or ask questions like "what endpoints are available?"',
        };
    }

    // Save assistant response
    try {
      // Extract content based on response type
      let content: string;
      if (response.type === 'error') {
        content = response.message;
      } else if (response.type === 'curl_command' || response.type === 'api_info') {
        content = response.explanation;
      } else if (response.type === 'self_awareness') {
        content = response.response;
      } else {
        content = 'I processed your request.';
      }

      const assistantMessage = await messageService.create({
        sessionId: input.sessionId,
        role: 'assistant',
        content,
        metadata: JSON.stringify({
          type: response.type,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          curl: (response as any).curl,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          executed: (response as any).executed,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          result: (response as any).result,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          workflowId: (response as any).workflowId,
        }),
      });

      // Update response with message ID
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response as any).messageId = assistantMessage.id;
    } catch (error) {
      log.error('Failed to save assistant message', error, {
        sessionId: input.sessionId,
        operation: 'save_assistant_message',
      });
      // Don't fail the whole request if saving fails
    }

    return response;
  }

  private convertMessagesToLLMFormat(messages: Message[]): LLMMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  private async detectWorkflowReference(
    message: string,
    _history: LLMMessage[]
  ): Promise<{ shouldReexecute: boolean; workflowId?: string }> {
    const lowerMessage = message.toLowerCase();

    // Detect workflow reference phrases
    const workflowPhrases = [
      'that workflow',
      'the workflow',
      'previous workflow',
      'last workflow',
      'run it again',
      'execute it again',
      'do it again',
      're-run',
      'rerun',
    ];

    const isReferencingWorkflow = workflowPhrases.some(phrase => lowerMessage.includes(phrase));

    if (!isReferencingWorkflow) {
      return { shouldReexecute: false };
    }

    // Find the most recent workflow in history
    try {
      // Get the last 10 messages from the database to find workflow metadata
      // Since history only contains content, we need to query DB for metadata
      // For now, we'll look through the last message's metadata
      // This is a simplified approach - in production you might want more sophisticated detection

      return { shouldReexecute: false }; // Let the normal flow handle it for now
    } catch (error) {
      log.error('Failed to detect workflow reference', error, {
        operation: 'detect_workflow_reference',
      });
      return { shouldReexecute: false };
    }
  }

  private async handleWorkflowReexecution(
    _session: unknown,
    _workflowId: string,
    _message: string,
    _history: LLMMessage[]
  ): Promise<ChatResponse> {
    // This will be implemented in Phase 5
    return {
      type: 'error',
      message: 'Workflow reexecution is not yet implemented. Please describe what you want to do.',
    };
  }

  private async handleSingleRequest(
    session: ReturnType<typeof sessionService.findById> extends Promise<infer T> ? T : never,
    message: string,
    history?: LLMMessage[]
  ): Promise<ChatResponse> {
    if (!session) {
      return {
        type: 'error',
        message: 'Session not found',
      };
    }

    const formattedSwagger = sessionService.getFormattedSwagger(session);

    try {
      // Generate curl command - pass boolean indicating if auth is available (never the actual token)
      const curlResult = await this.getLLM().generateCurl(
        formattedSwagger,
        message,
        !!session.authToken,
        history
      );

      // Check if LLM misunderstood and said it can't execute
      const hasRefusalLanguage =
        curlResult.explanation?.toLowerCase().includes("can't") ||
        curlResult.explanation?.toLowerCase().includes('cannot') ||
        curlResult.explanation?.toLowerCase().includes('unable to') ||
        curlResult.explanation?.toLowerCase().includes("i'm not able") ||
        curlResult.explanation?.toLowerCase().includes('i am not able') ||
        curlResult.explanation?.toLowerCase().includes("i don't have") ||
        curlResult.explanation?.toLowerCase().includes('i do not have') ||
        curlResult.explanation?.toLowerCase().includes('i can only') ||
        curlResult.explanation?.toLowerCase().includes('local server') ||
        curlResult.explanation?.toLowerCase().includes('your server') ||
        curlResult.explanation?.toLowerCase().includes('to your');

      if (hasRefusalLanguage) {
        log.info('Detected refusal language in explanation, retrying...');

        // Retry with more explicit instruction
        const retryMessage = `${message} (Generate ONLY the JSON response with shouldExecute: true)`;
        const retryResult = await this.getLLM().generateCurl(
          formattedSwagger,
          retryMessage,
          !!session.authToken
        );

        // Use retry result if it's better
        const retryHasRefusal =
          retryResult.explanation?.toLowerCase().includes("can't") ||
          retryResult.explanation?.toLowerCase().includes('cannot') ||
          retryResult.explanation?.toLowerCase().includes('unable to') ||
          retryResult.explanation?.toLowerCase().includes('local server') ||
          retryResult.explanation?.toLowerCase().includes('your server') ||
          retryResult.explanation?.toLowerCase().includes('to your');

        if (!retryHasRefusal && retryResult.curl) {
          log.info('Retry successful, using new result');
          Object.assign(curlResult, retryResult);
        } else {
          // If retry still has refusal, keep the curl but force execution and clean explanation
          log.info('Retry still has refusal, forcing execution anyway');
          curlResult.shouldExecute = true;
          curlResult.explanation = `Executing API request: ${curlResult.curl?.split(' ')[2] || 'API endpoint'}`;
        }
      }

      // Validate curl command
      const validation = validateCurlCommand(curlResult.curl);
      if (!validation.valid) {
        return {
          type: 'error',
          message: `Invalid curl command: ${validation.error}`,
        };
      }

      let executionResult = null;

      log.info('Curl generation result', {
        shouldExecute: curlResult.shouldExecute,
        isAuthEndpoint: curlResult.isAuthEndpoint,
        curlPreview: curlResult.curl?.substring(0, 50) + '...',
      });

      // Always execute by default. Only skip if LLM explicitly set shouldExecute=false
      // AND user didn't use action words. The prompt instructs shouldExecute=false only for DELETE.
      const lowerMessage = message.toLowerCase();
      const explicitlyAskedToExecute =
        lowerMessage.includes('execute') ||
        lowerMessage.includes('run') ||
        lowerMessage.includes('test') ||
        lowerMessage.includes('try') ||
        lowerMessage.includes('call') ||
        lowerMessage.includes('send');

      const shouldActuallyExecute = curlResult.shouldExecute || explicitlyAskedToExecute;

      // Execute if shouldExecute is true or user explicitly asked
      if (shouldActuallyExecute) {
        log.info('Executing curl command...');

        // Inject auth header if token is available (LLM doesn't include it for security)
        let curlCommand = curlResult.curl;
        if (session.authToken && !curlCommand.includes('Authorization')) {
          const authHeader = session.authToken.startsWith('Bearer ')
            ? session.authToken
            : `Bearer ${session.authToken}`;
          curlCommand += ` -H 'Authorization: ${authHeader}'`;
          log.info('Injected Authorization header');
        }

        executionResult = await executeCurl(curlCommand);
        log.info('Execution result', {
          success: executionResult.success,
          httpCode: executionResult.httpCode,
          hasResponse: !!executionResult.response,
          hasStderr: !!executionResult.stderr,
        });

        // Check for token expiration (401 Unauthorized)
        if (executionResult.httpCode === 401) {
          log.warn('Received 401 Unauthorized - token expired');
          return {
            type: 'error',
            message:
              '⚠️ **Authentication token expired.** Please redo the login again or ask me to do this for you.',
          };
        }

        // If this is an auth endpoint and we got a successful response, extract and save token
        if (curlResult.isAuthEndpoint && executionResult.success && executionResult.response) {
          log.info('Auth endpoint detected, extracting token...');

          // Use the comprehensive token extractor with fallback strategies
          const extractionResult = tokenExtractorService.extractToken(
            executionResult.response,
            curlResult.tokenPath
          );

          if (extractionResult.success && extractionResult.token) {
            log.info('Token extracted successfully, saving to session...');
            await sessionService.updateAuthToken(session.id, extractionResult.token);

            // Add success message to the explanation
            curlResult.explanation = `${curlResult.explanation}\n\n✅ Authentication successful! Token has been automatically saved to your session.`;
          } else {
            log.warn('Failed to extract token', { error: extractionResult.error });
          }
        }
      } else {
        log.info('Not executing - shouldExecute is false');

        // Generate appropriate message based on why execution was skipped
        let skipReason: string;
        const lowerCurl = curlResult.curl.toLowerCase();

        if (lowerCurl.includes('-x delete') || lowerCurl.includes('delete')) {
          skipReason =
            "I cannot execute DELETE requests automatically as they may delete important data. If you really want to delete this resource, please review the curl command below and execute it manually, or explicitly ask me to 'execute the delete request'.";
        } else if (lowerCurl.includes('-x put') || lowerCurl.includes('-x patch')) {
          skipReason =
            "I cannot execute this UPDATE request automatically as it may modify existing data. If you really want to update this resource, please review the curl command below and execute it manually, or explicitly ask me to 'execute the update request'.";
        } else if (
          curlResult.hasPlaceholders ||
          (curlResult.missingFields && curlResult.missingFields.length > 0)
        ) {
          skipReason = `I cannot execute this request because some required information is missing. ${curlResult.missingFields ? `Missing fields: ${curlResult.missingFields.join(', ')}.` : ''} Please provide the required values.`;
        } else {
          skipReason =
            "I cannot execute this request automatically. This may be a sensitive operation that requires manual review. Please review the curl command below and execute it manually if you're sure, or ask me to execute it explicitly.";
        }

        return {
          type: 'api_info',
          explanation: `${skipReason}\n\nHere's the curl command I generated:\n\`\`\`bash\n${curlResult.curl}\n\`\`\``,
        };
      }

      return {
        type: 'curl_command',
        explanation: curlResult.explanation,
        curl: curlResult.curl,
        shouldExecute: curlResult.shouldExecute,
        ...(executionResult && {
          executed: executionResult.success,
          result: executionResult.response,
        }),
        ...(curlResult.note && { note: curlResult.note }),
      } as ChatResponse;
    } catch (error) {
      log.error('Failed to handle single request', error, {
        sessionId: session.id,
        operation: 'handle_single_request',
      });
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to generate command',
      };
    }
  }

  private async handleApiInfo(
    session: ReturnType<typeof sessionService.findById> extends Promise<infer T> ? T : never,
    message: string,
    history?: LLMMessage[]
  ): Promise<ChatResponse> {
    if (!session) {
      return {
        type: 'error',
        message: 'Session not found',
      };
    }

    const formattedSwagger = sessionService.getFormattedSwagger(session);

    try {
      // Build messages array with history
      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: `You are Swaggbot, an API assistant. The user is asking about the following API:\n\n${formattedSwagger}\n\nProvide a helpful, concise answer about the API structure, endpoints, and usage.`,
        },
      ];

      if (history && history.length > 0) {
        messages.push(...history);
      }

      messages.push({
        role: 'user',
        content: message,
      });

      // Use LLM to answer API questions
      const response = await this.getLLM().chat(messages);

      return {
        type: 'api_info',
        explanation: response,
      };
    } catch (error) {
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to get API information',
      };
    }
  }

  private handleSelfAwareness(): ChatResponse {
    return {
      type: 'api_info',
      explanation:
        "I'm Swaggbot, your API assistant! I help you interact with APIs using natural language. I can generate curl commands, execute API calls, and answer questions about your API's structure. Just tell me what you want to do, like 'get all users' or 'create a new product'.",
    };
  }

  private async handleWorkflow(
    session: ReturnType<typeof sessionService.findById> extends Promise<infer T> ? T : never,
    message: string,
    _history?: LLMMessage[]
  ): Promise<ChatResponse> {
    if (!session) {
      return {
        type: 'error',
        message: 'Session not found',
      };
    }

    const formattedSwagger = sessionService.getFormattedSwagger(session);

    try {
      console.log('[ChatService] Planning workflow for:', message);

      // Plan the workflow using LLM
      let steps;
      try {
        steps = await this.getLLM().planWorkflow(formattedSwagger, message, !!session.authToken);
      } catch (planError) {
        console.error('[ChatService] Workflow planning failed:', planError);
        return {
          type: 'error',
          message: `Failed to plan workflow: ${planError instanceof Error ? planError.message : 'Unknown error'}. The API might not support the requested operation or the response format was invalid.`,
        };
      }

      if (!steps || steps.length === 0) {
        return {
          type: 'error',
          message: 'Could not plan workflow. No steps generated.',
        };
      }

      console.log('[ChatService] Workflow planned with', steps.length, 'steps');
      console.log(
        '[ChatService] Workflow steps:',
        steps.map(s => ({
          step: s.stepNumber,
          desc: s.description,
          method: s.action.method,
          endpoint: s.action.endpoint,
        }))
      );

      // Validate workflow has proper foreign key fetching for POST requests
      const postSteps = steps.filter(s => s.action.method?.toUpperCase() === 'POST');
      for (const postStep of postSteps) {
        const missingForeignKeySteps = this.validateForeignKeySteps(
          postStep,
          steps,
          formattedSwagger
        );
        if (missingForeignKeySteps.length > 0) {
          console.warn(
            `[ChatService] Workflow validation failed: POST ${postStep.action.endpoint} is missing foreign key fetching steps for:`,
            missingForeignKeySteps
          );
          return {
            type: 'error',
            message: `Workflow planning error: The LLM failed to include required foreign key fetching steps for ${postStep.action.endpoint}. Missing: ${missingForeignKeySteps.join(', ')}. Please try again.`,
          };
        }
      }

      // Execute workflow steps using RequestExecutor
      const executor = new RequestExecutor({
        baseUrl: session.baseUrl || '',
        authToken: session.authToken || undefined,
      });

      const execResult = await executor.executeSteps(steps);

      // Format results for chat response
      const results = execResult.steps.map(step => ({
        step: step.step,
        description: step.description,
        success: step.success,
        result: step.response,
        error: step.error,
      }));

      const allSuccess = execResult.success;

      if (allSuccess) {
        return {
          type: 'workflow_result',
          message: `Workflow completed successfully with ${results.length} steps.`,
          curl: 'Workflow execution completed',
          shouldExecute: true,
          executed: true,
          result: results,
        } as ChatResponse;
      } else {
        const failedStep = results.find(r => !r.success);
        return {
          type: 'error',
          message: `Workflow failed at step ${failedStep?.step}: ${failedStep?.error || 'Unknown error'}`,
          curl: 'Workflow execution failed',
          shouldExecute: true,
          executed: false,
          result: results,
        } as ChatResponse;
      }
    } catch (error) {
      console.error('[ChatService] Workflow execution failed:', error);
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to execute workflow',
      };
    }
  }

  // Note: Helper methods moved to RequestExecutor service

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
export const chatService = new ChatService();
