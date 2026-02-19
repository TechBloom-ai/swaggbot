import { ChatResponse, LLMMessage, WorkflowStep } from '@/lib/types';
import { Session } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { executeCurl } from '@/lib/utils/curl';
import { getLLMProvider } from '@/lib/llm';

import { sessionService } from './session';
import { messageService } from './message';
import { tokenExtractorService } from './tokenExtractor';
import { RequestExecutor } from './request-executor';
import { intentClassifier, IntentClassifier } from './intent-classifier';
import { curlGenerator, CurlGenerator } from './curl-generator';
import { executionDecider, ExecutionDecider } from './execution-decider';
import { responseFormatter, ResponseFormatter } from './response-formatter';

export interface ChatInput {
  sessionId: string;
  message: string;
}

/**
 * ChatOrchestrator Service
 * Thin coordinator that orchestrates the chat flow
 * Delegates to focused services for specific responsibilities
 */
export class ChatOrchestrator {
  constructor(
    private intentClassifier: IntentClassifier,
    private curlGenerator: CurlGenerator,
    private executionDecider: ExecutionDecider,
    private responseFormatter: ResponseFormatter
  ) {}

  /**
   * Process a chat message
   * Main entry point that coordinates the entire flow
   */
  async processMessage(input: ChatInput): Promise<ChatResponse> {
    // 1. Get session
    const session = await sessionService.findById(input.sessionId);
    if (!session) {
      return this.responseFormatter.formatError('Session not found');
    }

    // 2. Update session access time
    await sessionService.updateLastAccessed(input.sessionId);

    // 3. Load message history
    const recentMessages = await messageService.getRecentMessages(input.sessionId, 10);
    const history = this.convertMessagesToLLMFormat(recentMessages);

    // 4. Save user message
    await messageService.create({
      sessionId: input.sessionId,
      role: 'user',
      content: input.message,
    });

    try {
      // 5. Detect workflow references
      const workflowRef = this.intentClassifier.detectWorkflowReference(input.message, history);
      if (workflowRef.isWorkflowReference) {
        return this.responseFormatter.formatError(
          'Workflow reexecution not yet implemented. Please create a new workflow.'
        );
      }

      // 6. Classify intent
      const classification = await this.intentClassifier.classify(input.message, history);

      // 7. Route to appropriate handler
      let response: ChatResponse;
      switch (classification.type) {
        case 'single_request':
          response = await this.handleSingleRequest(input.message, session, history);
          break;
        case 'workflow':
          response = await this.handleWorkflow(input.message, session, history);
          break;
        case 'api_info':
          response = await this.handleApiInfo(input.message, session, history);
          break;
        case 'self_awareness':
          response = await this.handleSelfAwareness();
          break;
        default:
          response = this.responseFormatter.formatError('Unknown intent type');
      }

      // 8. Save assistant response
      const content = this.responseFormatter.extractContent(response);
      const metadataObj = this.responseFormatter.buildMetadata(response);
      const metadata = metadataObj ? JSON.stringify(metadataObj) : undefined;
      const savedMessage = await messageService.create({
        sessionId: input.sessionId,
        role: 'assistant',
        content,
        metadata,
      });

      // Attach message ID to response
      if (response.type === 'curl_command') {
        response.messageId = savedMessage.id;
      }

      return response;
    } catch (error) {
      log.error(
        'Chat processing failed',
        error instanceof Error ? error : new Error(String(error))
      );
      return this.responseFormatter.formatError(
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
    }
  }

  /**
   * Handle single API request
   */
  private async handleSingleRequest(
    message: string,
    session: Session,
    history?: LLMMessage[]
  ): Promise<ChatResponse> {
    const formattedSwagger = sessionService.getFormattedSwagger(session);

    // Generate curl command
    const curlResult = await this.curlGenerator.generate({
      swaggerDoc: formattedSwagger,
      message,
      hasAuth: !!session.authToken,
      history,
    });

    if (curlResult.type === 'error') {
      return this.responseFormatter.formatError(curlResult.message);
    }

    // Decide whether to execute
    const hasExplicitIntent = this.intentClassifier.hasExplicitExecutionIntent(message);
    const decision = this.executionDecider.decide(curlResult, message, hasExplicitIntent);

    if (!decision.shouldExecute) {
      return this.responseFormatter.formatSkipReason(curlResult, message);
    }

    // Inject auth token if available
    let curlCommand = curlResult.curl;
    if (session.authToken && !curlCommand.includes('Authorization')) {
      const authHeader = session.authToken.startsWith('Bearer ')
        ? session.authToken
        : `Bearer ${session.authToken}`;
      curlCommand += ` -H 'Authorization: ${authHeader}'`;
      log.info('Injected Authorization header');
    }

    // Execute the request
    const executionResult = await executeCurl(curlCommand);

    // Check for token expiration
    if (executionResult.httpCode === 401) {
      return this.responseFormatter.formatError(
        '⚠️ **Authentication token expired.** Please redo the login again or ask me to do this for you.'
      );
    }

    // Handle auth endpoint token extraction
    if (curlResult.isAuthEndpoint && executionResult.success && executionResult.response) {
      const extractionResult = tokenExtractorService.extractToken(
        executionResult.response,
        curlResult.tokenPath
      );

      if (extractionResult.success && extractionResult.token) {
        await sessionService.updateAuthToken(session.id, extractionResult.token);
        curlResult.explanation = `${curlResult.explanation}\n\n✅ Authentication successful! Token has been automatically saved to your session.`;
      }
    }

    return this.responseFormatter.formatCurlResponse(
      curlResult,
      executionResult.success,
      executionResult.response
    );
  }

  /**
   * Handle workflow request
   */
  private async handleWorkflow(
    message: string,
    session: Session,
    _history?: LLMMessage[]
  ): Promise<ChatResponse> {
    const formattedSwagger = sessionService.getFormattedSwagger(session);

    // Plan workflow
    let steps: WorkflowStep[];
    try {
      steps = await getLLMProvider().planWorkflow(formattedSwagger, message, !!session.authToken);
    } catch (error) {
      return this.responseFormatter.formatError(
        `Failed to plan workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    if (!steps || steps.length === 0) {
      return this.responseFormatter.formatError('Could not plan workflow. No steps generated.');
    }

    // Validate foreign key steps
    const postSteps = steps.filter(s => s.action.method?.toUpperCase() === 'POST');
    for (const postStep of postSteps) {
      const missingForeignKeys = this.validateForeignKeySteps(postStep, steps, formattedSwagger);
      if (missingForeignKeys.length > 0) {
        return this.responseFormatter.formatError(
          `Workflow planning error: Missing foreign key fetching steps for ${postStep.action.endpoint}. Missing: ${missingForeignKeys.join(', ')}.`
        );
      }
    }

    // Execute workflow
    const executor = new RequestExecutor({
      baseUrl: session.baseUrl || '',
      authToken: session.authToken || undefined,
    });

    const execResult = await executor.executeSteps(steps);
    return this.responseFormatter.formatWorkflowResult(execResult);
  }

  /**
   * Handle API info request
   */
  private async handleApiInfo(
    message: string,
    session: Session,
    history?: LLMMessage[]
  ): Promise<ChatResponse> {
    const formattedSwagger = sessionService.getFormattedSwagger(session);

    const llm = getLLMProvider();
    const systemPrompt = `You are a helpful API documentation assistant. Answer questions about the API based on the provided Swagger/OpenAPI documentation. Be concise but informative.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(history || []),
      {
        role: 'user',
        content: `API Documentation:\n${formattedSwagger}\n\nQuestion: ${message}`,
      },
    ];

    const response = await llm.chat(messages);
    return this.responseFormatter.formatApiInfo(response);
  }

  /**
   * Handle self-awareness request
   */
  private async handleSelfAwareness(): Promise<ChatResponse> {
    return this.responseFormatter.formatSelfAwareness(
      "I'm Swaggbot, your AI-powered API testing assistant. I can help you explore APIs, generate and execute curl commands, and automate workflows. How can I help you today?"
    );
  }

  /**
   * Convert messages to LLM format
   */
  private convertMessagesToLLMFormat(
    messages: Array<{ role: string; content: string }>
  ): LLMMessage[] {
    return messages
      .filter((m): m is { role: 'user' | 'assistant' | 'system'; content: string } =>
        ['user', 'assistant', 'system'].includes(m.role)
      )
      .map(m => ({
        role: m.role,
        content: m.content,
      }));
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

// Singleton instance with default dependencies
export const chatOrchestrator = new ChatOrchestrator(
  intentClassifier,
  curlGenerator,
  executionDecider,
  responseFormatter
);
