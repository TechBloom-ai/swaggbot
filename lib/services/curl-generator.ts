import { getLLMProvider } from '@/lib/llm';
import { CurlGenerationResult, LLMMessage } from '@/lib/types';
import { validateCurlCommand } from '@/lib/utils/curl';
import { log } from '@/lib/logger';

export interface CurlGenerationError {
  type: 'error';
  message: string;
}

/**
 * CurlGenerator Service
 * Generates curl commands from natural language using LLM
 * Handles refusal language detection and retry logic
 */
export class CurlGenerator {
  private llm: ReturnType<typeof getLLMProvider>;

  constructor() {
    this.llm = getLLMProvider();
  }

  /**
   * Generate curl command from user message
   * Includes refusal detection and retry logic
   */
  async generate(params: {
    swaggerDoc: string;
    message: string;
    hasAuth: boolean;
    history?: LLMMessage[];
  }): Promise<CurlGenerationResult | CurlGenerationError> {
    const { swaggerDoc, message, hasAuth, history } = params;

    log.info('Generating curl command', { message: message.substring(0, 100) });

    try {
      let curlResult = await this.llm.generateCurl(swaggerDoc, message, hasAuth, history);

      // Check if LLM misunderstood and said it can't execute
      const hasRefusalLanguage = this.detectRefusalLanguage(curlResult.explanation);

      if (hasRefusalLanguage) {
        log.info('Detected refusal language, retrying...');

        // Retry with more explicit instruction
        const retryMessage = `${message} (Generate ONLY the JSON response with shouldExecute: true)`;
        const retryResult = await this.llm.generateCurl(swaggerDoc, retryMessage, hasAuth, history);

        // Use retry result if it's better
        const retryHasRefusal = this.detectRefusalLanguage(retryResult.explanation);

        if (!retryHasRefusal && retryResult.curl) {
          log.info('Retry successful');
          curlResult = retryResult;
        } else {
          // If retry still has refusal, force execution
          log.info('Retry still has refusal, forcing execution');
          curlResult.shouldExecute = true;
          curlResult.explanation = `Executing API request: ${curlResult.curl?.split(' ')[2] || 'API endpoint'}`;
        }
      }

      // Validate the curl command
      const validation = validateCurlCommand(curlResult.curl);
      if (!validation.valid) {
        log.error('Curl validation failed', new Error(validation.error));
        return {
          type: 'error',
          message: `Invalid curl command: ${validation.error}`,
        };
      }

      log.info('Curl generated successfully', {
        shouldExecute: curlResult.shouldExecute,
        isAuthEndpoint: curlResult.isAuthEndpoint,
      });

      return curlResult;
    } catch (error) {
      log.error(
        'Curl generation failed',
        error instanceof Error ? error : new Error(String(error))
      );
      return {
        type: 'error',
        message: `Failed to generate curl command: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Detect if LLM response contains refusal language
   */
  private detectRefusalLanguage(explanation: string): boolean {
    const lowerExplanation = explanation?.toLowerCase() || '';
    const refusalPatterns = [
      "can't",
      'cannot',
      'unable to',
      "i'm not able",
      'i am not able',
      "i don't have",
      'i do not have',
      'i can only',
      'local server',
      'your server',
      'to your',
    ];

    return refusalPatterns.some(pattern => lowerExplanation.includes(pattern));
  }
}

// Singleton instance
export const curlGenerator = new CurlGenerator();
