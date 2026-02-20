import { LLMMessage } from '@/lib/types';
import { log } from '@/lib/logger';

import { BaseLLMProvider } from './base';

interface OpenAIResponse {
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

export class OpenAIProvider extends BaseLLMProvider {
  readonly name = 'openai';

  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor() {
    super({ temperature: 1, maxTokens: 4000 });

    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
    this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  protected async makeRequest(messages: LLMMessage[]): Promise<string> {
    const bodyPayload = {
      model: this.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    log.info('OpenAI API Request', {
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
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data: OpenAIResponse = await response.json();
    const content = data.choices[0]?.message?.content || '';

    log.info('OpenAI API Response', {
      contentLength: content.length,
      finishReason: data.choices[0]?.finish_reason,
      usage: data.usage,
    });

    return content;
  }
}
