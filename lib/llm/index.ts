import { BaseLLMProvider } from './base';
import { MoonshotProvider } from './moonshot';

export type LLMProviderType = 'moonshot';

export function createLLMProvider(provider?: string): BaseLLMProvider {
  const providerName = provider || process.env.LLM_PROVIDER || 'moonshot';
  
  switch (providerName) {
    case 'moonshot':
      return new MoonshotProvider();
    default:
      throw new Error(`Unknown LLM provider: ${providerName}`);
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

export { BaseLLMProvider } from './base';
export { MoonshotProvider } from './moonshot';
