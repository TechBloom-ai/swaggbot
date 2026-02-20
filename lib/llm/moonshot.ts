import { LLMMessage } from '@/lib/types';
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

  protected async makeRequest(messages: LLMMessage[]): Promise<string> {
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
}
