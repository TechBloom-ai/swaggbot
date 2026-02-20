import { getLLMProvider } from '@/lib/llm';
import { IntentClassification, LLMMessage } from '@/lib/types';
import { log } from '@/lib/logger';

export interface WorkflowReferenceResult {
  isWorkflowReference: boolean;
  workflowId?: string;
}

/**
 * IntentClassifier Service
 * Classifies user messages into intent categories
 * Detects workflow references in conversation context
 */
export class IntentClassifier {
  private llm: ReturnType<typeof getLLMProvider>;

  constructor() {
    this.llm = getLLMProvider();
  }

  /**
   * Classify user intent from message and history
   */
  async classify(message: string, history?: LLMMessage[]): Promise<IntentClassification> {
    log.info('Classifying intent', { message: message.substring(0, 100) });

    try {
      const classification = await this.llm.classifyIntent(message, history);
      log.info('Intent classified', {
        type: classification.type,
        confidence: classification.confidence,
      });
      return classification;
    } catch (error) {
      log.error(
        'Intent classification failed',
        error instanceof Error ? error : new Error(String(error))
      );
      // Fallback to single_request if classification fails
      return {
        type: 'single_request',
        confidence: 0.5,
        reasoning: 'Classification failed, defaulting to single request',
      };
    }
  }

  /**
   * Detect if user is referencing a previous workflow
   * Examples: "run that workflow again", "execute it", "do that again"
   */
  detectWorkflowReference(message: string, history?: LLMMessage[]): WorkflowReferenceResult {
    const lowerMessage = message.toLowerCase().trim();

    // Direct workflow reference patterns
    const workflowPatterns = [
      /(?:run|execute|do|perform)\s+(?:that|the|it|this)\s+(?:workflow|automation|task|process)/i,
      /(?:run|execute|do|perform)\s+it\s+again/i,
      /(?:try|run)\s+(?:that|it)\s+(?:again|one more time)/i,
      /(?:rerun|re-run|retry)\s+(?:that|the|it|this)/i,
      /(?:execute|run)\s+(?:workflow|automation)\s+(?:\d+|#\d+|number\s+\d+)/i,
    ];

    for (const pattern of workflowPatterns) {
      if (pattern.test(lowerMessage)) {
        log.info('Workflow reference detected', { message: lowerMessage });
        return { isWorkflowReference: true };
      }
    }

    // Check if last assistant message was about a workflow
    if (history && history.length >= 2) {
      const lastAssistantMessage = [...history].reverse().find(m => m.role === 'assistant');
      if (lastAssistantMessage) {
        const lastContent = lastAssistantMessage.content.toLowerCase();
        if (
          lastContent.includes('workflow') &&
          (lowerMessage.includes('run it') ||
            lowerMessage.includes('execute it') ||
            lowerMessage.includes('do it') ||
            lowerMessage.includes('try it'))
        ) {
          log.info('Workflow reference detected from context', { message: lowerMessage });
          return { isWorkflowReference: true };
        }
      }
    }

    return { isWorkflowReference: false };
  }

  /**
   * Check if message contains explicit action words
   * indicating user wants to execute
   */
  hasExplicitExecutionIntent(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    const executionWords = ['execute', 'run', 'test', 'try', 'call', 'send'];

    return executionWords.some(word => lowerMessage.includes(word));
  }
}

// Singleton instance
export const intentClassifier = new IntentClassifier();
