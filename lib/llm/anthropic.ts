import { LLMMessage } from '@/lib/types';
import { log } from '@/lib/logger';

import { BaseLLMProvider } from './base';

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicProvider extends BaseLLMProvider {
  readonly name = 'anthropic';

  private apiKey: string;
  private model: string;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor() {
    super({ temperature: 1, maxTokens: 4000 });

    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
  }

  protected async makeRequest(messages: LLMMessage[]): Promise<string> {
    // Anthropic uses a different format: system prompt is a top-level field,
    // not a message role. Extract system messages and merge them.
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const systemPrompt = systemMessages.map(m => m.content).join('\n\n');

    const bodyPayload: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.config.maxTokens,
      messages: nonSystemMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemPrompt) {
      bodyPayload.system = systemPrompt;
    }

    // Only include temperature if it's within Anthropic's range (0-1)
    if (this.config.temperature !== undefined && this.config.temperature <= 1) {
      bodyPayload.temperature = this.config.temperature;
    }

    log.info('Anthropic API Request', {
      model: this.model,
      messageCount: nonSystemMessages.length,
      hasSystem: !!systemPrompt,
      totalChars: messages.reduce((sum, m) => sum + m.content.length, 0),
      maxTokens: this.config.maxTokens,
    });

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data: AnthropicResponse = await response.json();

    // Anthropic returns content as an array of content blocks
    const content = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    log.info('Anthropic API Response', {
      contentLength: content.length,
      stopReason: data.stop_reason,
      usage: data.usage,
    });

    return content;
  }
}
