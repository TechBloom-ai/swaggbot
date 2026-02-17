import { promptManager } from '@/lib/prompts';
import { IntentClassification, CurlGenerationResult, WorkflowStep, LLMMessage } from '@/lib/types';
import { log } from '@/lib/logger';

import { BaseLLMProvider } from './base';

interface MoonshotResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class MoonshotProvider extends BaseLLMProvider {
  readonly name = 'moonshot';

  private apiKey: string;
  private model: string;
  private baseUrl = 'https://api.moonshot.ai/v1';

  constructor() {
    super({ temperature: 1, maxTokens: 4000 });

    this.apiKey = process.env.MOONSHOT_API_KEY || '';
    this.model = process.env.MOONSHOT_MODEL || 'kimi-k2.5';

    if (!this.apiKey) {
      throw new Error('MOONSHOT_API_KEY environment variable is required');
    }
  }

  private async makeRequest(messages: LLMMessage[]): Promise<string> {
    const bodyPayload = {
      model: this.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    log.info('Moonshot API Request', {
      model: this.model,
      messageCount: messages.length,
      totalChars: messages.reduce((sum, m) => sum + m.content.length, 0),
      maxTokens: this.config.maxTokens,
    });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Moonshot API error: ${response.status} ${error}`);
    }

    const data: MoonshotResponse = await response.json();
    const content = data.choices[0]?.message?.content || '';

    log.info('Moonshot API Response', {
      contentLength: content.length,
      finishReason: data.choices[0]?.finish_reason,
      usage: data.usage,
    });

    return content;
  }

  async generateCurl(
    swaggerDoc: string,
    message: string,
    authToken?: string,
    history?: LLMMessage[]
  ): Promise<CurlGenerationResult> {
    const systemPromptTemplate = promptManager.loadPrompt('curl-generation-system');
    const userPromptTemplate = promptManager.loadPrompt('curl-generation-user');

    const authMessage = authToken
      ? `User has provided token: ${authToken}`
      : 'No token set. Mention if endpoint requires auth.';

    const systemPrompt = promptManager.render(systemPromptTemplate.template, {
      swaggerDoc,
      authToken: authMessage,
    });

    const userPrompt = promptManager.render(userPromptTemplate.template, {
      userMessage: message,
    });

    // Build messages array with history if provided
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

    // Handle shouldExecute - default to true (only false for DELETE requests per prompt rules)
    let shouldExecute = true;
    if (typeof result.shouldExecute === 'boolean') {
      shouldExecute = result.shouldExecute;
    } else if (typeof result.shouldExecute === 'string') {
      shouldExecute = result.shouldExecute.toLowerCase() !== 'false';
    }

    // Handle isAuthEndpoint similarly
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

  async classifyIntent(message: string, history?: LLMMessage[]): Promise<IntentClassification> {
    const promptTemplate = promptManager.loadPrompt('intent-classification');

    const prompt = promptManager.render(promptTemplate.template, {
      userMessage: message,
    });

    // Build messages array with history if provided
    const messages: LLMMessage[] = [{ role: 'system', content: promptManager.getSystemPrompt() }];

    if (history && history.length > 0) {
      messages.push(...history);
    }

    messages.push({ role: 'user', content: prompt });

    const response = await this.makeRequest(messages);

    const parsed = this.safeJsonParse(response);

    if (!parsed || typeof parsed !== 'object') {
      // Fallback classification
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

  async planWorkflow(
    swaggerDoc: string,
    request: string,
    authToken?: string
  ): Promise<WorkflowStep[]> {
    const promptTemplate = promptManager.loadPrompt('workflow-planning');

    const prompt = promptManager.render(promptTemplate.template, {
      swaggerDoc,
      userMessage: request,
      authStatus: authToken
        ? 'User already has a valid authentication token. DO NOT include authentication steps in the workflow.'
        : 'No authentication token available. Include authentication as first step if needed.',
    });

    log.info('Planning workflow', { promptLength: prompt.length });

    // Temporarily increase max tokens for workflow planning
    const originalMaxTokens = this.config.maxTokens;
    this.config.maxTokens = 8000;

    const response = await this.makeRequest([
      { role: 'system', content: promptManager.getSystemPrompt() },
      { role: 'user', content: prompt },
    ]);

    // Restore original max tokens
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

  async chat(messages: LLMMessage[]): Promise<string> {
    return this.makeRequest(messages);
  }
}
