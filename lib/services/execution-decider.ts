import { CurlGenerationResult } from '@/lib/types';
import { log } from '@/lib/logger';

export interface ExecutionDecision {
  shouldExecute: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
}

/**
 * ExecutionDecider Service
 * Determines whether a curl command should be executed based on
 * LLM flags, user intent, and safety rules
 */
export class ExecutionDecider {
  /**
   * Decide whether to execute a curl command
   */
  decide(
    curlResult: CurlGenerationResult,
    userMessage: string,
    hasExplicitExecutionIntent: boolean
  ): ExecutionDecision {
    const lowerMessage = userMessage.toLowerCase();
    const lowerCurl = curlResult.curl.toLowerCase();

    // Always execute by default if LLM says shouldExecute
    // BUT require explicit confirmation for destructive operations
    const shouldActuallyExecute = curlResult.shouldExecute || hasExplicitExecutionIntent;

    // Check for DELETE requests - always require explicit confirmation
    if (lowerCurl.includes('-x delete') || lowerCurl.includes('delete')) {
      if (!this.hasExplicitConfirmation(lowerMessage, 'delete')) {
        log.info('DELETE request requires explicit confirmation');
        return {
          shouldExecute: false,
          reason: 'delete_confirmation_required',
          requiresConfirmation: true,
        };
      }
    }

    // Check for PUT/PATCH requests - require explicit confirmation
    if (lowerCurl.includes('-x put') || lowerCurl.includes('-x patch')) {
      if (!this.hasExplicitConfirmation(lowerMessage, 'update')) {
        log.info('UPDATE request requires explicit confirmation');
        return {
          shouldExecute: false,
          reason: 'update_confirmation_required',
          requiresConfirmation: true,
        };
      }
    }

    // Check for missing fields or placeholders
    if (
      curlResult.hasPlaceholders ||
      (curlResult.missingFields && curlResult.missingFields.length > 0)
    ) {
      log.info('Request has placeholders or missing fields');
      return {
        shouldExecute: false,
        reason: 'missing_fields',
        requiresConfirmation: false,
      };
    }

    if (shouldActuallyExecute) {
      return { shouldExecute: true };
    }

    // Default: don't execute if no explicit intent
    return {
      shouldExecute: false,
      reason: 'no_explicit_execution_intent',
      requiresConfirmation: false,
    };
  }

  /**
   * Check if user message contains explicit confirmation for an action
   */
  private hasExplicitConfirmation(message: string, action: 'delete' | 'update'): boolean {
    const lowerMessage = message.toLowerCase();

    const confirmationPatterns = {
      delete: [
        /(?:yes|yeah|sure|ok|okay).*delete/i,
        /delete.*(?:anyway|regardless|please)/i,
        /(?:go ahead|proceed).*delete/i,
        /(?:i want to|please).*delete/i,
        /execute.*delete/i,
        /run.*delete/i,
      ],
      update: [
        /(?:yes|yeah|sure|ok|okay).*update/i,
        /update.*(?:anyway|regardless|please)/i,
        /(?:go ahead|proceed).*update/i,
        /(?:i want to|please).*update/i,
        /execute.*update/i,
        /run.*update/i,
      ],
    };

    const patterns = confirmationPatterns[action];
    return patterns.some(pattern => pattern.test(lowerMessage));
  }
}

// Singleton instance
export const executionDecider = new ExecutionDecider();
