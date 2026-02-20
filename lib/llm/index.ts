// LLM providers barrel export
export { BaseLLMProvider } from './base';
export { MoonshotProvider } from './moonshot';
export { OpenAIProvider } from './openai';
export { AnthropicProvider } from './anthropic';
export { OllamaProvider } from './ollama';

import { BaseLLMProvider } from './base';
import { MoonshotProvider } from './moonshot';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';

export type LLMProviderType = 'moonshot' | 'openai' | 'anthropic' | 'ollama';

export function createLLMProvider(provider?: string): BaseLLMProvider {
  const providerName = provider || process.env.LLM_PROVIDER || 'moonshot';

  switch (providerName) {
    case 'moonshot':
      return new MoonshotProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'ollama':
      return new OllamaProvider();
    default:
      throw new Error(
        `Unknown LLM provider: ${providerName}. ` +
          `Supported providers: moonshot, openai, anthropic, ollama`
      );
  }
}

// Singleton instance for reuse
let llmProvider: BaseLLMProvider | null = null;

export function getLLMProvider(): BaseLLMProvider {
  if (!llmProvider) {
    llmProvider = createLLMProvider();
  }
  return llmProvider;
}

export function resetLLMProvider(): void {
  llmProvider = null;
}
