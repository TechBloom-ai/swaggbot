import { LLMMessage } from '@/lib/types';
import { log } from '@/lib/logger';

import { BaseLLMProvider } from './base';

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaProvider extends BaseLLMProvider {
  readonly name = 'ollama';

  private model: string;
  private baseUrl: string;

  constructor() {
    super({ temperature: 1, maxTokens: 4000 });

    this.model = process.env.OLLAMA_MODEL || 'llama3.1';
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  }

  protected async makeRequest(messages: LLMMessage[]): Promise<string> {
    const bodyPayload = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
      },
    };

    log.info('Ollama API Request', {
      model: this.model,
      baseUrl: this.baseUrl,
      messageCount: messages.length,
      totalChars: messages.reduce((sum, m) => sum + m.content.length, 0),
      maxTokens: this.config.maxTokens,
    });

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });
    } catch {
      throw new Error(
        `Failed to connect to Ollama at ${this.baseUrl}. ` +
          `Make sure Ollama is running (ollama serve) and the model "${this.model}" is pulled.`
      );
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${error}`);
    }

    const data: OllamaResponse = await response.json();
    const content = data.message?.content || '';

    log.info('Ollama API Response', {
      contentLength: content.length,
      done: data.done,
      evalCount: data.eval_count,
      totalDuration: data.total_duration,
    });

    return content;
  }
}
