import { getLLMProvider } from '@/lib/llm';
import { sessionService } from './session';
import { executeCurl, validateCurlCommand, extractTokenFromResponse } from '@/lib/utils/curl';
import {
  ChatResponse,
  IntentClassification,
  ChatMessage,
} from '@/lib/types';

export interface ChatInput {
  sessionId: string;
  message: string;
}

export class ChatService {
  private llm: ReturnType<typeof getLLMProvider> | null = null;
  
  private getLLM() {
    if (!this.llm) {
      this.llm = getLLMProvider();
    }
    return this.llm;
  }
  
  async processMessage(input: ChatInput): Promise<ChatResponse> {
    // Get session
    const session = await sessionService.findById(input.sessionId);
    if (!session) {
      return {
        type: 'error',
        message: 'Session not found',
      };
    }
    
    // Update last accessed
    await sessionService.updateLastAccessed(input.sessionId);
    
    // Classify intent
    const intent = await this.getLLM().classifyIntent(input.message);
    
    // Route to appropriate handler
    switch (intent.type) {
      case 'single_request':
        return this.handleSingleRequest(session, input.message);
      
      case 'workflow':
        return {
          type: 'api_info',
          explanation: 'Workflow execution is available in Phase 2. For now, I can help you with individual API calls or answer questions about the API.',
        };
      
      case 'api_info':
        return this.handleApiInfo(session, input.message);
      
      case 'self_awareness':
        return this.handleSelfAwareness();
      
      default:
        return {
          type: 'api_info',
          explanation: 'I can help you explore and interact with your API. Try asking me to perform specific actions like "get all users" or ask questions like "what endpoints are available?"',
        };
    }
  }
  
  private async handleSingleRequest(session: ReturnType<typeof sessionService.findById> extends Promise<infer T> ? T : never, message: string): Promise<ChatResponse> {
    if (!session) {
      return {
        type: 'error',
        message: 'Session not found',
      };
    }
    
    const formattedSwagger = sessionService.getFormattedSwagger(session);
    
    try {
      // Generate curl command
      const curlResult = await this.getLLM().generateCurl(
        formattedSwagger,
        message,
        session.authToken || undefined
      );
      
      // Check if LLM misunderstood and said it can't execute
      if (curlResult.explanation?.toLowerCase().includes("can't") || 
          curlResult.explanation?.toLowerCase().includes("cannot") ||
          curlResult.explanation?.toLowerCase().includes("unable to")) {
        // Retry with more explicit instruction
        const retryMessage = `${message} (IMPORTANT: Execute this request directly, do not say you cannot execute it)`;
        const retryResult = await this.getLLM().generateCurl(
          formattedSwagger,
          retryMessage,
          session.authToken || undefined
        );
        
        // Use retry result if it's better
        if (!retryResult.explanation?.toLowerCase().includes("can't")) {
          Object.assign(curlResult, retryResult);
        }
      }
      
      // Validate curl command
      const validation = validateCurlCommand(curlResult.curl);
      if (!validation.valid) {
        return {
          type: 'error',
          message: `Invalid curl command: ${validation.error}`,
        };
      }
      
      let executionResult = null;
      
      console.log('[ChatService] Curl generation result:', {
        shouldExecute: curlResult.shouldExecute,
        isAuthEndpoint: curlResult.isAuthEndpoint,
        curl: curlResult.curl?.substring(0, 50) + '...',
      });
      
      // Force execution if user explicitly asked to execute/test/try something
      const lowerMessage = message.toLowerCase();
      const explicitlyAskedToExecute = 
        lowerMessage.includes('execute') ||
        lowerMessage.includes('run') ||
        lowerMessage.includes('test') ||
        lowerMessage.includes('try') ||
        lowerMessage.includes('call') ||
        lowerMessage.includes('send');
      
      const shouldActuallyExecute = curlResult.shouldExecute || explicitlyAskedToExecute;
      
      // Execute if shouldExecute is true or user explicitly asked
      if (shouldActuallyExecute) {
        console.log('[ChatService] Executing curl command...');
        executionResult = await executeCurl(curlResult.curl);
        console.log('[ChatService] Execution result:', {
          success: executionResult.success,
          hasResponse: !!executionResult.response,
          stderr: executionResult.stderr || null,
        });
        
        // If this is an auth endpoint and we got a successful response, extract and save token
        if (curlResult.isAuthEndpoint && executionResult.success && executionResult.response) {
          if (curlResult.tokenPath) {
            const token = extractTokenFromResponse(executionResult.response, curlResult.tokenPath);
            if (token) {
              await sessionService.updateAuthToken(session.id, token);
            }
          }
        }
      } else {
        console.log('[ChatService] Not executing - shouldExecute is false');
      }
      
      return {
        type: 'curl_command',
        explanation: curlResult.explanation,
        curl: curlResult.curl,
        shouldExecute: curlResult.shouldExecute,
        ...(executionResult && {
          executed: executionResult.success,
          result: executionResult.response,
        }),
        ...(curlResult.note && { note: curlResult.note }),
      } as ChatResponse;
    } catch (error) {
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to generate command',
      };
    }
  }
  
  private async handleApiInfo(session: ReturnType<typeof sessionService.findById> extends Promise<infer T> ? T : never, message: string): Promise<ChatResponse> {
    if (!session) {
      return {
        type: 'error',
        message: 'Session not found',
      };
    }
    
    const formattedSwagger = sessionService.getFormattedSwagger(session);
    
    try {
      // Use LLM to answer API questions
      const response = await this.getLLM().chat([
        {
          role: 'system',
          content: `You are SwagBot, an API assistant. The user is asking about the following API:\n\n${formattedSwagger}\n\nProvide a helpful, concise answer about the API structure, endpoints, and usage.`,
        },
        {
          role: 'user',
          content: message,
        },
      ]);
      
      return {
        type: 'api_info',
        explanation: response,
      };
    } catch (error) {
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to get API information',
      };
    }
  }
  
  private handleSelfAwareness(): ChatResponse {
    return {
      type: 'api_info',
      explanation: "I'm SwagBot, your API assistant! I help you interact with APIs using natural language. I can generate curl commands, execute API calls, and answer questions about your API's structure. Just tell me what you want to do, like 'get all users' or 'create a new product'.",
    };
  }
}

// Singleton instance
export const chatService = new ChatService();
