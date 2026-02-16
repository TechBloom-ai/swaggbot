import {
  IntentClassification,
  CurlGenerationResult,
  WorkflowStep,
  LLMMessage,
  LLMProviderConfig,
} from '@/lib/types';

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
  
  // Generate curl command from natural language request
  abstract generateCurl(
    swaggerDoc: string,
    message: string,
    authToken?: string,
    history?: LLMMessage[]
  ): Promise<CurlGenerationResult>;
  
  // Classify user intent
  abstract classifyIntent(message: string, history?: LLMMessage[]): Promise<IntentClassification>;
  
  // Plan a multi-step workflow
  abstract planWorkflow(
    swaggerDoc: string,
    request: string,
    authToken?: string
  ): Promise<WorkflowStep[]>;
  
  // Extract data from API response
  abstract extractData(
    response: unknown,
    extractionPrompt: string
  ): Promise<Record<string, unknown>>;
  
  // General chat completion
  abstract chat(messages: LLMMessage[]): Promise<string>;
  
  // Helper method to safely parse JSON
  protected safeJsonParse(text: string): unknown {
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```(?:json)?\n?([\s\S]*?)```/);
      const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim();
      return JSON.parse(jsonText);
    } catch {
      // Try more aggressive extraction - look for JSON-like content
      try {
        // Find content between first { and last }
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
    return curl
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
