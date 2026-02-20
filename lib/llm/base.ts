import {
  IntentClassification,
  CurlGenerationResult,
  WorkflowStep,
  LLMMessage,
  LLMProviderConfig,
} from '@/lib/types';
import { promptManager } from '@/lib/prompts';
import { log } from '@/lib/logger';

export abstract class BaseLLMProvider {
  abstract readonly name: string;

  protected config: LLMProviderConfig;

  constructor(config: LLMProviderConfig = {}) {
    this.config = {
      temperature: 1,
      maxTokens: 4000,
      ...config,
    };
  }

  // Each provider implements its own transport
  protected abstract makeRequest(messages: LLMMessage[]): Promise<string>;

  // Generate curl command from natural language request
  async generateCurl(
    swaggerDoc: string,
    message: string,
    hasAuth: boolean,
    history?: LLMMessage[]
  ): Promise<CurlGenerationResult> {
    const systemPromptTemplate = promptManager.loadPrompt('curl-generation-system');
    const userPromptTemplate = promptManager.loadPrompt('curl-generation-user');

    const authStatus = hasAuth
      ? 'Authentication is available. DO NOT include the Authorization header in the curl command - it will be added automatically by the backend.'
      : 'No authentication token available. Mention if the endpoint requires authentication.';

    const systemPrompt = promptManager.render(systemPromptTemplate.template, {
      swaggerDoc,
      authStatus,
    });

    const userPrompt = promptManager.render(userPromptTemplate.template, {
      userMessage: message,
    });

    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

    if (history && history.length > 0) {
      messages.push(...history);
    }

    messages.push({ role: 'user', content: userPrompt });

    const response = await this.makeRequest(messages);

    const parsed = this.safeJsonParse(response);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid response format from LLM');
    }

    const result = parsed as Record<string, unknown>;

    let shouldExecute = true;
    if (typeof result.shouldExecute === 'boolean') {
      shouldExecute = result.shouldExecute;
    } else if (typeof result.shouldExecute === 'string') {
      shouldExecute = result.shouldExecute.toLowerCase() !== 'false';
    }

    let isAuthEndpoint = false;
    if (typeof result.isAuthEndpoint === 'boolean') {
      isAuthEndpoint = result.isAuthEndpoint;
    } else if (typeof result.isAuthEndpoint === 'string') {
      isAuthEndpoint = result.isAuthEndpoint.toLowerCase() === 'true';
    }

    log.info('Generated curl result', {
      shouldExecute,
      isAuthEndpoint,
      hasCurl: !!result.curl,
    });

    return {
      type: 'curl_command',
      explanation: (result.explanation as string) || '',
      curl: this.cleanCurlCommand((result.curl as string) || ''),
      shouldExecute,
      isAuthEndpoint,
      tokenPath: result.tokenPath as string | undefined,
      note: result.note as string | undefined,
    };
  }

  // Classify user intent
  async classifyIntent(message: string, history?: LLMMessage[]): Promise<IntentClassification> {
    const promptTemplate = promptManager.loadPrompt('intent-classification');

    const prompt = promptManager.render(promptTemplate.template, {
      userMessage: message,
    });

    const messages: LLMMessage[] = [{ role: 'system', content: promptManager.getSystemPrompt() }];

    if (history && history.length > 0) {
      messages.push(...history);
    }

    messages.push({ role: 'user', content: prompt });

    const response = await this.makeRequest(messages);

    const parsed = this.safeJsonParse(response);

    if (!parsed || typeof parsed !== 'object') {
      return {
        type: 'api_info',
        confidence: 0.5,
        reasoning: 'Failed to parse classification, defaulting to api_info',
      };
    }

    const result = parsed as Record<string, unknown>;

    return {
      type: (result.type as IntentClassification['type']) || 'api_info',
      confidence: (result.confidence as number) || 0.5,
      reasoning: (result.reasoning as string) || '',
      estimatedSteps: result.estimatedSteps as number | undefined,
    };
  }

  // Plan a multi-step workflow
  async planWorkflow(
    swaggerDoc: string,
    request: string,
    hasAuth: boolean
  ): Promise<WorkflowStep[]> {
    const promptTemplate = promptManager.loadPrompt('workflow-planning');

    const prompt = promptManager.render(promptTemplate.template, {
      swaggerDoc,
      userMessage: request,
      authStatus: hasAuth
        ? 'User already has a valid authentication token. DO NOT include authentication steps in the workflow.'
        : 'No authentication token available. Include authentication as first step if needed.',
    });

    log.info('Planning workflow', { promptLength: prompt.length });

    const originalMaxTokens = this.config.maxTokens;
    this.config.maxTokens = 8000;

    const response = await this.makeRequest([
      { role: 'system', content: promptManager.getSystemPrompt() },
      { role: 'user', content: prompt },
    ]);

    this.config.maxTokens = originalMaxTokens;

    log.info('Raw workflow response received', { responsePreview: response.substring(0, 500) });

    const parsed = this.safeJsonParse(response);

    if (!parsed || typeof parsed !== 'object') {
      log.error('Failed to parse workflow response', new Error('Invalid JSON'), {
        response: response.substring(0, 200),
      });
      throw new Error(`Invalid workflow plan format: ${response.substring(0, 200)}`);
    }

    const result = parsed as Record<string, unknown>;

    if (!result.steps) {
      log.error('Missing steps in workflow plan', new Error('Missing steps field'), { result });
      throw new Error('Workflow plan missing required "steps" field');
    }

    const steps = result.steps as WorkflowStep[];

    if (!Array.isArray(steps)) {
      log.error('Steps is not an array', new Error('Invalid steps format'), { steps });
      throw new Error('Workflow steps must be an array');
    }

    return steps;
  }

  // Extract data from API response
  async extractData(response: unknown, extractionPrompt: string): Promise<Record<string, unknown>> {
    const prompt = `${extractionPrompt}\n\nResponse to extract from:\n${JSON.stringify(response, null, 2)}`;

    const result = await this.makeRequest([
      { role: 'system', content: promptManager.getSystemPrompt() },
      { role: 'user', content: prompt },
    ]);

    const parsed = this.safeJsonParse(result);

    if (!parsed || typeof parsed !== 'object') {
      return { extracted: result };
    }

    return parsed as Record<string, unknown>;
  }

  // General chat completion
  async chat(messages: LLMMessage[]): Promise<string> {
    return this.makeRequest(messages);
  }

  // Helper method to safely parse JSON
  protected safeJsonParse(text: string): unknown {
    try {
      const jsonMatch = text.match(/```(?:json)?\n?([\s\S]*?)```/);
      const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim();
      return JSON.parse(jsonText);
    } catch {
      try {
        const jsonLikeMatch = text.match(/\{[\s\S]*\}/);
        if (jsonLikeMatch) {
          return JSON.parse(jsonLikeMatch[0]);
        }
      } catch {
        // Still failed, return null
      }
      return null;
    }
  }

  // Helper to clean up curl command
  protected cleanCurlCommand(curl: string): string {
    return curl.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
