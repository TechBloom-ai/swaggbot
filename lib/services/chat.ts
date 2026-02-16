import { getLLMProvider } from '@/lib/llm';
import { sessionService } from './session';
import { executeCurl, validateCurlCommand } from '@/lib/utils/curl';
import { tokenExtractorService } from './tokenExtractor';
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
        return this.handleWorkflow(session, input.message);
      
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
      const hasRefusalLanguage = 
        curlResult.explanation?.toLowerCase().includes("can't") || 
        curlResult.explanation?.toLowerCase().includes("cannot") ||
        curlResult.explanation?.toLowerCase().includes("unable to") ||
        curlResult.explanation?.toLowerCase().includes("i'm not able") ||
        curlResult.explanation?.toLowerCase().includes("i am not able") ||
        curlResult.explanation?.toLowerCase().includes("i don't have") ||
        curlResult.explanation?.toLowerCase().includes("i do not have") ||
        curlResult.explanation?.toLowerCase().includes("i can only") ||
        curlResult.explanation?.toLowerCase().includes("local server") ||
        curlResult.explanation?.toLowerCase().includes("your server") ||
        curlResult.explanation?.toLowerCase().includes("to your");
      
      if (hasRefusalLanguage) {
        console.log('[ChatService] Detected refusal language in explanation, retrying...');
        
        // Retry with more explicit instruction
        const retryMessage = `${message} (Generate ONLY the JSON response with shouldExecute: true)`;
        const retryResult = await this.getLLM().generateCurl(
          formattedSwagger,
          retryMessage,
          session.authToken || undefined
        );
        
        // Use retry result if it's better
        const retryHasRefusal = 
          retryResult.explanation?.toLowerCase().includes("can't") || 
          retryResult.explanation?.toLowerCase().includes("cannot") ||
          retryResult.explanation?.toLowerCase().includes("unable to") ||
          retryResult.explanation?.toLowerCase().includes("local server") ||
          retryResult.explanation?.toLowerCase().includes("your server") ||
          retryResult.explanation?.toLowerCase().includes("to your");
        
        if (!retryHasRefusal && retryResult.curl) {
          console.log('[ChatService] Retry successful, using new result');
          Object.assign(curlResult, retryResult);
        } else {
          // If retry still has refusal, keep the curl but force execution and clean explanation
          console.log('[ChatService] Retry still has refusal, forcing execution anyway');
          curlResult.shouldExecute = true;
          curlResult.explanation = `Executing API request: ${curlResult.curl?.split(' ')[2] || 'API endpoint'}`;
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
      
      // Always execute by default. Only skip if LLM explicitly set shouldExecute=false
      // AND user didn't use action words. The prompt instructs shouldExecute=false only for DELETE.
      const lowerMessage = message.toLowerCase();
      const explicitlyAskedToExecute = 
        lowerMessage.includes('execute') ||
        lowerMessage.includes('run') ||
        lowerMessage.includes('test') ||
        lowerMessage.includes('try') ||
        lowerMessage.includes('call') ||
        lowerMessage.includes('send') ||
        lowerMessage.includes('fazer') ||
        lowerMessage.includes('listar') ||
        lowerMessage.includes('buscar') ||
        lowerMessage.includes('criar') ||
        lowerMessage.includes('pegar') ||
        lowerMessage.includes('obter');
      
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
          console.log('[ChatService] Auth endpoint detected, extracting token...');
          
          // Use the comprehensive token extractor with fallback strategies
          const extractionResult = tokenExtractorService.extractToken(
            executionResult.response,
            curlResult.tokenPath
          );
          
          if (extractionResult.success && extractionResult.token) {
            console.log('[ChatService] Token extracted successfully, saving to session...');
            await sessionService.updateAuthToken(session.id, extractionResult.token);
            
            // Add success message to the explanation
            curlResult.explanation = `${curlResult.explanation}\n\n✅ Authentication successful! Token has been automatically saved to your session.`;
          } else {
            console.warn('[ChatService] Failed to extract token:', extractionResult.error);
          }
        }
      } else {
        console.log('[ChatService] Not executing - shouldExecute is false');
        
        // Generate appropriate message based on why execution was skipped
        let skipReason: string;
        const lowerCurl = curlResult.curl.toLowerCase();
        
        if (lowerCurl.includes('-x delete') || lowerCurl.includes('delete')) {
          skipReason = "I cannot execute DELETE requests automatically as they may delete important data. If you really want to delete this resource, please review the curl command below and execute it manually, or explicitly ask me to 'execute the delete request'.";
        } else if (lowerCurl.includes('-x put') || lowerCurl.includes('-x patch')) {
          skipReason = "I cannot execute this UPDATE request automatically as it may modify existing data. If you really want to update this resource, please review the curl command below and execute it manually, or explicitly ask me to 'execute the update request'.";
        } else if (curlResult.hasPlaceholders || (curlResult.missingFields && curlResult.missingFields.length > 0)) {
          skipReason = `I cannot execute this request because some required information is missing. ${curlResult.missingFields ? `Missing fields: ${curlResult.missingFields.join(', ')}.` : ''} Please provide the required values.`;
        } else {
          skipReason = "I cannot execute this request automatically. This may be a sensitive operation that requires manual review. Please review the curl command below and execute it manually if you're sure, or ask me to execute it explicitly.";
        }
        
        return {
          type: 'api_info',
          explanation: `${skipReason}\n\nHere's the curl command I generated:\n\`\`\`bash\n${curlResult.curl}\n\`\`\``,
        };
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
          content: `You are Swaggbot, an API assistant. The user is asking about the following API:\n\n${formattedSwagger}\n\nProvide a helpful, concise answer about the API structure, endpoints, and usage.`,
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
      explanation: "I'm Swaggbot, your API assistant! I help you interact with APIs using natural language. I can generate curl commands, execute API calls, and answer questions about your API's structure. Just tell me what you want to do, like 'get all users' or 'create a new product'.",
    };
  }

  private async handleWorkflow(session: ReturnType<typeof sessionService.findById> extends Promise<infer T> ? T : never, message: string): Promise<ChatResponse> {
    if (!session) {
      return {
        type: 'error',
        message: 'Session not found',
      };
    }

    const formattedSwagger = sessionService.getFormattedSwagger(session);

    try {
      console.log('[ChatService] Planning workflow for:', message);

      // Plan the workflow using LLM
      let steps;
      try {
        steps = await this.getLLM().planWorkflow(formattedSwagger, message);
      } catch (planError) {
        console.error('[ChatService] Workflow planning failed:', planError);
        return {
          type: 'error',
          message: `Failed to plan workflow: ${planError instanceof Error ? planError.message : 'Unknown error'}. The API might not support the requested operation or the response format was invalid.`,
        };
      }

      if (!steps || steps.length === 0) {
        return {
          type: 'error',
          message: 'Could not plan workflow. No steps generated.',
        };
      }

      console.log('[ChatService] Workflow planned with', steps.length, 'steps');

      // Execute workflow steps
      const results: Array<{step: number; description: string; success: boolean; result?: unknown; error?: string}> = [];
      const extractedData: Record<string, unknown> = {};

      for (const step of steps) {
        console.log(`[ChatService] Executing step ${step.stepNumber}: ${step.description}`);

        try {
          // Replace placeholders in endpoint with extracted data
          let endpoint = step.action.endpoint;
          for (const [key, value] of Object.entries(extractedData)) {
            endpoint = endpoint.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
          }

          // Build curl command
          const method = step.action.method || 'GET';
          const baseUrl = session.baseUrl || '';
          const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

          console.log(`[ChatService] Step ${step.stepNumber} building URL:`, {
            endpoint,
            baseUrl,
            url,
            hasAuth: !!session.authToken,
          });

          let curl = `curl -X ${method} '${url}' -H 'Content-Type: application/json'`;

          // Add auth token if available
          if (session.authToken) {
            // Ensure Bearer prefix is present
            const authHeader = session.authToken.startsWith('Bearer ')
              ? session.authToken
              : `Bearer ${session.authToken}`;
            curl += ` -H 'Authorization: ${authHeader}'`;
          }

          // Add body if present
          if (step.action.body && Object.keys(step.action.body).length > 0) {
            // Build field-to-step mapping based on workflow step order
            const fieldToStepMap: Record<string, number> = {};
            for (const s of steps) {
              const desc = s.description.toLowerCase();
              if (desc.includes('payment')) {
                fieldToStepMap['payment_method_id'] = s.stepNumber;
              } else if (desc.includes('role')) {
                fieldToStepMap['role_id'] = s.stepNumber;
              } else if (desc.includes('employment')) {
                fieldToStepMap['employment_relationship_id'] = s.stepNumber;
              } else if (desc.includes('professional area')) {
                fieldToStepMap['professional_area_id'] = s.stepNumber;
              }
            }

            // Replace placeholders in body
            let body = JSON.stringify(step.action.body);

            // First, handle semantic keys (like {{payment_method_id}})
            for (const [key, value] of Object.entries(extractedData)) {
              // Escape special regex characters in key
              const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              body = body.replace(new RegExp(`"\\{\\{${escapedKey}\\}\\}"`, 'g'), JSON.stringify(value));
            }

            // Parse body to find which fields have placeholders
            const bodyObj = JSON.parse(body);

            for (const [fieldName, fieldValue] of Object.entries(bodyObj)) {
              if (typeof fieldValue === 'string' && fieldValue.startsWith('{{') && fieldValue.endsWith('}}')) {
                // This field has a placeholder, find the right value
                const stepNumber = fieldToStepMap[fieldName];

                if (stepNumber) {
                  // Build the step-specific key for this field
                  const stepSpecificKey = `step${stepNumber}_0_id`;
                  const semanticKey = fieldName; // e.g., "payment_method_id"

                  // Try step-specific key first, then semantic key
                  let value: unknown = extractedData[stepSpecificKey];
                  if (value === undefined) {
                    value = extractedData[semanticKey];
                  }

                  if (value !== undefined) {
                    body = body.replace(`"${fieldValue}"`, JSON.stringify(value));
                    console.log(`[ChatService] Replaced ${fieldValue} in ${fieldName} with:`, value);
                  } else {
                    console.warn(`[ChatService] Could not find value for ${fieldName}, tried keys: ${stepSpecificKey}, ${semanticKey}`);
                  }
                } else {
                  console.warn(`[ChatService] No step mapping found for field: ${fieldName}`);
                }
              }
            }

            curl += ` -d '${body}'`;
          }

          // Log the curl command
          console.log(`[ChatService] Step ${step.stepNumber} curl:`, curl);

          // Execute the curl
          const executionResult = await executeCurl(curl);

          console.log(`[ChatService] Step ${step.stepNumber} execution result:`, {
            success: executionResult.success,
            exitCode: executionResult.exitCode,
            hasResponse: !!executionResult.response,
            stderr: executionResult.stderr || null,
            stdout: executionResult.stdout ? executionResult.stdout.substring(0, 500) : null,
          });

          if (executionResult.success && executionResult.response) {
            // Extract data for future steps
            if (step.extractFields && step.extractFields.length > 0) {
              for (const field of step.extractFields) {
                // Check if field is an array index path like "0.id" or "[0].id"
                const arrayIndexMatch = field.match(/^(\[?(\d+)\]?)\.(.+)$/);

                if (arrayIndexMatch) {
                  // Extract using the path (e.g., "0.id" or "[0].id" means first array item's id property)
                  const [, , index, propPath] = arrayIndexMatch;
                  const value = this.extractFieldFromResponse(executionResult.response, field);

                  // Generate a unique storage key from the step description
                  // E.g., if step is "Fetch payment methods", use "payment_method_id"
                  let storageKey: string;
                  const desc = step.description.toLowerCase();

                  if (desc.includes('payment')) {
                    storageKey = 'payment_method_id';
                  } else if (desc.includes('role')) {
                    storageKey = 'role_id';
                  } else if (desc.includes('employment')) {
                    storageKey = 'employment_relationship_id';
                  } else if (desc.includes('professional area')) {
                    storageKey = 'professional_area_id';
                  } else {
                    // Fallback: use step number to make it unique
                    storageKey = `step${step.stepNumber}_${propPath.replace(/\./g, '_')}`;
                  }

                  // Store with step-specific key to prevent overwriting
                  // Use step number in the array notation key to make it unique per step
                  if (value !== undefined) {
                    extractedData[storageKey] = value;
                    // Store with step-specific array notation keys to prevent overwriting between steps
                    const stepSpecificKey = `step${step.stepNumber}_${index}_${propPath}`;
                    extractedData[stepSpecificKey] = value;
                    extractedData[`step${step.stepNumber}_${field}`] = value;
                    console.log(`[ChatService] Step ${step.stepNumber} extracted ${field} as ${storageKey} and ${stepSpecificKey}:`, value);
                  }
                } else {
                  // Regular field extraction - semantic key like "payment_method_id"
                  // Extract from first array item's id property
                  const value = this.extractFieldFromResponse(executionResult.response, '0.id');
                  if (value !== undefined) {
                    extractedData[field] = value;
                    // Also store with step-specific key
                    extractedData[`step${step.stepNumber}_${field}`] = value;
                    console.log(`[ChatService] Step ${step.stepNumber} extracted ${field}:`, value);
                  }
                }
              }
            }

            results.push({
              step: step.stepNumber,
              description: step.description,
              success: true,
              result: executionResult.response,
            });
          } else {
            results.push({
              step: step.stepNumber,
              description: step.description,
              success: false,
              error: executionResult.stderr || 'Execution failed',
            });

            // Stop workflow if a step fails
            break;
          }
        } catch (error) {
          console.error(`[ChatService] Step ${step.stepNumber} failed:`, error);
          results.push({
            step: step.stepNumber,
            description: step.description,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          break;
        }
      }

      // Build summary response
      const allSuccess = results.every(r => r.success);
      const stepSummaries = results.map(r =>
        `${r.success ? '✅' : '❌'} Step ${r.step}: ${r.description}${r.error ? ` (${r.error})` : ''}`
      ).join('\n');

      return {
        type: 'curl_command',
        explanation: `Workflow executed with ${results.length} steps:\n\n${stepSummaries}`,
        curl: 'Workflow execution completed',
        shouldExecute: true,
        executed: allSuccess,
        result: results,
      } as ChatResponse;

    } catch (error) {
      console.error('[ChatService] Workflow execution failed:', error);
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to execute workflow',
      };
    }
  }

  private extractFieldFromResponse(response: unknown, field: string): unknown {
    if (!response || typeof response !== 'object') return undefined;

    const parts = field.split('.');
    let current: unknown = response;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;

      if (Array.isArray(current) && !isNaN(Number(part))) {
        current = current[Number(part)];
      } else if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }
}

// Singleton instance
export const chatService = new ChatService();
