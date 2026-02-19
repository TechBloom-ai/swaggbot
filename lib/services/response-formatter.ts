import { ChatResponse, CurlGenerationResult, ApiInfoResult, MessageMetadata } from '@/lib/types';

import { ExecutionResult as ExecutorResult } from './request-executor';

/**
 * ResponseFormatter Service
 * Handles formatting of chat responses for UI display
 * Extracts content and prepares metadata for database storage
 */
export class ResponseFormatter {
  /**
   * Format a curl command response after execution
   */
  formatCurlResponse(
    curlResult: CurlGenerationResult,
    executed: boolean,
    result?: unknown
  ): ChatResponse {
    return {
      ...curlResult,
      executed,
      result,
    };
  }

  /**
   * Format skip reason when request is not executed
   */
  formatSkipReason(curlResult: CurlGenerationResult, _message: string): ChatResponse {
    const lowerCurl = curlResult.curl.toLowerCase();
    let skipReason: string;

    if (lowerCurl.includes('-x delete') || lowerCurl.includes('delete')) {
      skipReason =
        "I cannot execute DELETE requests automatically as they may delete important data. If you really want to delete this resource, please review the curl command below and execute it manually, or explicitly ask me to 'execute the delete request'.";
    } else if (lowerCurl.includes('-x put') || lowerCurl.includes('-x patch')) {
      skipReason =
        "I cannot execute this UPDATE request automatically as it may modify existing data. If you really want to update this resource, please review the curl command below and execute it manually, or explicitly ask me to 'execute the update request'.";
    } else if (
      curlResult.hasPlaceholders ||
      (curlResult.missingFields && curlResult.missingFields.length > 0)
    ) {
      skipReason = `I cannot execute this request because some required information is missing. ${curlResult.missingFields ? `Missing fields: ${curlResult.missingFields.join(', ')}.` : ''} Please provide the required values.`;
    } else {
      skipReason =
        "I cannot execute this request automatically. This may be a sensitive operation that requires manual review. Please review the curl command below and execute it manually if you're sure, or ask me to execute it explicitly.";
    }

    return {
      type: 'api_info',
      explanation: `${skipReason}\n\nHere's the curl command I generated:\n\`\`\`bash\n${curlResult.curl}\n\`\`\``,
    };
  }

  /**
   * Format workflow execution result
   */
  formatWorkflowResult(execResult: ExecutorResult): ChatResponse {
    const allSuccess = execResult.success;

    if (allSuccess) {
      return {
        type: 'workflow_result',
        message: `Workflow completed successfully with ${execResult.steps.length} steps.`,
        curl: 'Workflow execution completed',
        shouldExecute: true,
        executed: true,
        result: execResult.steps,
      };
    } else {
      const failedStep = execResult.steps.find(s => !s.success);
      return {
        type: 'error',
        message: `Workflow failed at step ${failedStep?.step}: ${failedStep?.error || 'Unknown error'}`,
      };
    }
  }

  /**
   * Format API info response
   */
  formatApiInfo(explanation: string, apiInfo?: ApiInfoResult['apiInfo']): ChatResponse {
    return {
      type: 'api_info',
      explanation,
      apiInfo,
    };
  }

  /**
   * Format self-awareness response
   */
  formatSelfAwareness(response: string): ChatResponse {
    return {
      type: 'self_awareness',
      response,
    };
  }

  /**
   * Format error response
   */
  formatError(message: string): ChatResponse {
    return {
      type: 'error',
      message,
    };
  }

  /**
   * Extract content from response for database storage
   */
  extractContent(response: ChatResponse): string {
    switch (response.type) {
      case 'curl_command':
        return response.explanation;
      case 'api_info':
        return response.explanation;
      case 'self_awareness':
        return response.response;
      case 'workflow_result':
        return response.message;
      case 'error':
        return response.message;
      default:
        return 'Unknown response type';
    }
  }

  /**
   * Build metadata for database storage
   */
  buildMetadata(response: ChatResponse): MessageMetadata {
    const metadata: MessageMetadata = {
      type: this.getResponseType(response),
    };

    switch (response.type) {
      case 'curl_command':
        metadata.curl = response.curl;
        metadata.executed = response.executed;
        metadata.result = response.result;
        break;
      case 'workflow_result':
        metadata.type = 'workflow';
        metadata.executed = response.executed;
        metadata.result = response.result;
        break;
      case 'error':
        metadata.error = response.message;
        break;
    }

    return metadata;
  }

  /**
   * Get the internal type string for a response
   */
  private getResponseType(response: ChatResponse): MessageMetadata['type'] {
    switch (response.type) {
      case 'curl_command':
        return 'curl';
      case 'api_info':
        return 'api_info';
      case 'self_awareness':
        return undefined;
      case 'workflow_result':
        return 'workflow';
      case 'error':
        return 'error';
      default:
        return undefined;
    }
  }
}

// Singleton instance
export const responseFormatter = new ResponseFormatter();
