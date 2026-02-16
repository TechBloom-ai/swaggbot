import { BaseLLMProvider } from './base';
import { promptManager } from '@/lib/prompts';
import {
  IntentClassification,
  CurlGenerationResult,
  WorkflowStep,
  LLMMessage,
} from '@/lib/types';

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
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Moonshot API error: ${response.status} ${error}`);
    }
    
    const data: MoonshotResponse = await response.json();
    return data.choices[0]?.message?.content || '';
  }
  
  async generateCurl(
    swaggerDoc: string,
    message: string,
    authToken?: string
  ): Promise<CurlGenerationResult> {
    const systemPromptTemplate = promptManager.loadPrompt('curl-generation-system');
    const userPromptTemplate = promptManager.loadPrompt('curl-generation-user');
    
    const systemPrompt = promptManager.render(systemPromptTemplate.template, {
      swaggerDoc,
      authToken: authToken || null,
    });
    
    const userPrompt = promptManager.render(userPromptTemplate.template, {
      userMessage: message,
    });
    
    const response = await this.makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    
    const parsed = this.safeJsonParse(response);
    
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid response format from LLM');
    }
    
    const result = parsed as Record<string, unknown>;
    
    // Handle shouldExecute - LLM might return it as string "true" or boolean true
    let shouldExecute = false;
    if (typeof result.shouldExecute === 'boolean') {
      shouldExecute = result.shouldExecute;
    } else if (typeof result.shouldExecute === 'string') {
      shouldExecute = result.shouldExecute.toLowerCase() === 'true';
    }
    
    // Handle isAuthEndpoint similarly
    let isAuthEndpoint = false;
    if (typeof result.isAuthEndpoint === 'boolean') {
      isAuthEndpoint = result.isAuthEndpoint;
    } else if (typeof result.isAuthEndpoint === 'string') {
      isAuthEndpoint = result.isAuthEndpoint.toLowerCase() === 'true';
    }
    
    console.log('[MoonshotProvider] Generated curl result:', {
      shouldExecute,
      isAuthEndpoint,
      curl: result.curl ? 'present' : 'missing',
    });
    
    return {
      type: 'curl_command',
      explanation: result.explanation as string || '',
      curl: this.cleanCurlCommand(result.curl as string || ''),
      shouldExecute,
      isAuthEndpoint,
      tokenPath: result.tokenPath as string | undefined,
      note: result.note as string | undefined,
    };
  }
  
  async classifyIntent(message: string): Promise<IntentClassification> {
    const promptTemplate = promptManager.loadPrompt('intent-classification');
    
    const prompt = promptManager.render(promptTemplate.template, {
      userMessage: message,
    });
    
    const response = await this.makeRequest([
      { role: 'system', content: promptManager.getSystemPrompt() },
      { role: 'user', content: prompt },
    ]);
    
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
  
  async planWorkflow(swaggerDoc: string, request: string): Promise<WorkflowStep[]> {
    const promptTemplate = promptManager.loadPrompt('workflow-planning');
    
    const prompt = promptManager.render(promptTemplate.template, {
      swaggerDoc,
      userMessage: request,
    });
    
    const response = await this.makeRequest([
      { role: 'system', content: promptManager.getSystemPrompt() },
      { role: 'user', content: prompt },
    ]);
    
    const parsed = this.safeJsonParse(response);
    
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid workflow plan format');
    }
    
    const result = parsed as Record<string, unknown>;
    const steps = result.steps as WorkflowStep[] || [];
    
    return steps;
  }
  
  async extractData(
    response: unknown,
    extractionPrompt: string
  ): Promise<Record<string, unknown>> {
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
