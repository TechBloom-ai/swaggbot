import { getLLMProvider } from '@/lib/llm';
import { sessionService } from './session';
import { executeCurl, validateCurlCommand } from '@/lib/utils/curl';
import { tokenExtractorService } from './tokenExtractor';
import { messageService } from './message';
import {
  ChatResponse,
  IntentClassification,
  ChatMessage,
  LLMMessage,
} from '@/lib/types';
import { Message } from '@/lib/db/schema';

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

    // Load recent message history
    let history: LLMMessage[] = [];
    let userMessageId: string | undefined;
    try {
      const recentMessages = await messageService.getRecentMessages(input.sessionId, 10);
      history = this.convertMessagesToLLMFormat(recentMessages);

      // Save user message
      const userMessage = await messageService.create({
        sessionId: input.sessionId,
        role: 'user',
        content: input.message,
      });
      userMessageId = userMessage.id;
    } catch (error) {
      console.error('[ChatService] Failed to load history or save user message:', error);
      // Explain to user and offer to continue without history
      return {
        type: 'error',
        message: 'I had trouble loading our conversation history. This might be a temporary issue. Please try again, or if the problem persists, I can continue without remembering our previous conversation.',
      };
    }

    // Check if user is referencing a previous workflow
    const workflowReference = await this.detectWorkflowReference(input.message, history);
    if (workflowReference.shouldReexecute && workflowReference.workflowId) {
      return this.handleWorkflowReexecution(session, workflowReference.workflowId, input.message, history);
    }

    // Classify intent with history
    const intent = await this.getLLM().classifyIntent(input.message, history);

    // Route to appropriate handler
    let response: ChatResponse;
    switch (intent.type) {
      case 'single_request':
        response = await this.handleSingleRequest(session, input.message, history);
        break;

      case 'workflow':
        response = await this.handleWorkflow(session, input.message, history);
        break;

      case 'api_info':
        response = await this.handleApiInfo(session, input.message, history);
        break;

      case 'self_awareness':
        response = this.handleSelfAwareness();
        break;

      default:
        response = {
          type: 'api_info',
          explanation: 'I can help you explore and interact with your API. Try asking me to perform specific actions like "get all users" or ask questions like "what endpoints are available?"',
        };
    }

    // Save assistant response
    try {
      // Extract content based on response type
      let content: string;
      if (response.type === 'error') {
        content = response.message;
      } else if (response.type === 'curl_command' || response.type === 'api_info') {
        content = response.explanation;
      } else if (response.type === 'self_awareness') {
        content = response.response;
      } else {
        content = 'I processed your request.';
      }

      const assistantMessage = await messageService.create({
        sessionId: input.sessionId,
        role: 'assistant',
        content,
        metadata: JSON.stringify({
          type: response.type,
          curl: (response as any).curl,
          executed: (response as any).executed,
          result: (response as any).result,
          workflowId: (response as any).workflowId,
        }),
      });

      // Update response with message ID
      (response as any).messageId = assistantMessage.id;
    } catch (error) {
      console.error('[ChatService] Failed to save assistant message:', error);
      // Don't fail the whole request if saving fails
    }

    return response;
  }

  private convertMessagesToLLMFormat(messages: Message[]): LLMMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  private async detectWorkflowReference(message: string, history: LLMMessage[]): Promise<{ shouldReexecute: boolean; workflowId?: string }> {
    const lowerMessage = message.toLowerCase();

    // Detect workflow reference phrases
    const workflowPhrases = [
      'that workflow',
      'the workflow',
      'previous workflow',
      'last workflow',
      'run it again',
      'execute it again',
      'do it again',
      're-run',
      'rerun',
    ];

    const isReferencingWorkflow = workflowPhrases.some(phrase => lowerMessage.includes(phrase));

    if (!isReferencingWorkflow) {
      return { shouldReexecute: false };
    }

    // Find the most recent workflow in history
    try {
      // Get the last 10 messages from the database to find workflow metadata
      // Since history only contains content, we need to query DB for metadata
      // For now, we'll look through the last message's metadata
      // This is a simplified approach - in production you might want more sophisticated detection

      return { shouldReexecute: false }; // Let the normal flow handle it for now
    } catch (error) {
      console.error('[ChatService] Failed to detect workflow reference:', error);
      return { shouldReexecute: false };
    }
  }

  private async handleWorkflowReexecution(
    session: any,
    workflowId: string,
    message: string,
    history: LLMMessage[]
  ): Promise<ChatResponse> {
    // This will be implemented in Phase 5
    return {
      type: 'error',
      message: 'Workflow reexecution is not yet implemented. Please describe what you want to do.',
    };
  }
  
  private async handleSingleRequest(session: ReturnType<typeof sessionService.findById> extends Promise<infer T> ? T : never, message: string, history?: LLMMessage[]): Promise<ChatResponse> {
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
        session.authToken || undefined,
        history
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
          httpCode: executionResult.httpCode,
          hasResponse: !!executionResult.response,
          stderr: executionResult.stderr || null,
        });

        // Check for token expiration (401 Unauthorized)
        if (executionResult.httpCode === 401) {
          console.warn('[ChatService] Received 401 Unauthorized - token expired');
          return {
            type: 'error',
            message: '⚠️ **Authentication token expired.** Please redo the login again or ask me to do this for you.',
          };
        }

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
  
  private async handleApiInfo(session: ReturnType<typeof sessionService.findById> extends Promise<infer T> ? T : never, message: string, history?: LLMMessage[]): Promise<ChatResponse> {
    if (!session) {
      return {
        type: 'error',
        message: 'Session not found',
      };
    }

    const formattedSwagger = sessionService.getFormattedSwagger(session);

    try {
      // Build messages array with history
      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: `You are Swaggbot, an API assistant. The user is asking about the following API:\n\n${formattedSwagger}\n\nProvide a helpful, concise answer about the API structure, endpoints, and usage.`,
        },
      ];

      if (history && history.length > 0) {
        messages.push(...history);
      }

      messages.push({
        role: 'user',
        content: message,
      });

      // Use LLM to answer API questions
      const response = await this.getLLM().chat(messages);

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

  private async handleWorkflow(session: ReturnType<typeof sessionService.findById> extends Promise<infer T> ? T : never, message: string, history?: LLMMessage[]): Promise<ChatResponse> {
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
        steps = await this.getLLM().planWorkflow(formattedSwagger, message, session.authToken || undefined);
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
      console.log('[ChatService] Workflow steps:', steps.map(s => ({ step: s.stepNumber, desc: s.description, method: s.action.method, endpoint: s.action.endpoint })));

      // Validate workflow has proper foreign key fetching for POST requests
      const postSteps = steps.filter(s => s.action.method?.toUpperCase() === 'POST');
      for (const postStep of postSteps) {
        const missingForeignKeySteps = this.validateForeignKeySteps(postStep, steps, formattedSwagger);
        if (missingForeignKeySteps.length > 0) {
          console.warn(`[ChatService] Workflow validation failed: POST ${postStep.action.endpoint} is missing foreign key fetching steps for:`, missingForeignKeySteps);
          return {
            type: 'error',
            message: `Workflow planning error: The LLM failed to include required foreign key fetching steps for ${postStep.action.endpoint}. Missing: ${missingForeignKeySteps.join(', ')}. Please try again.`,
          };
        }
      }

      // Execute workflow steps
      const results: Array<{step: number; description: string; success: boolean; result?: unknown; error?: string}> = [];
      const extractedData: Record<string, unknown> = {};

      for (const step of steps) {
        console.log(`[ChatService] Executing step ${step.stepNumber}: ${step.description}`);

        try {
          // Replace placeholders in endpoint with extracted data
          let endpoint = step.action.endpoint;
          for (const [key, value] of Object.entries(extractedData)) {
            // Escape special regex characters in the key for filter syntax
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            endpoint = endpoint.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), String(value));
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
            // Build field-to-step mapping dynamically based on extractFields from previous steps
            const fieldToStepMap: Record<string, number> = {};
            
            // Look at all previous steps to build the mapping
            for (const s of steps) {
              if (s.stepNumber >= step.stepNumber) continue; // Only look at previous steps
              
              if (s.extractFields && s.extractFields.length > 0) {
                // Map each extracted field to this step
                for (const field of s.extractFields) {
                  // Handle different field patterns:
                  // - "id" -> map to generic field names based on step description
                  // - "[0].id" or "0.id" -> array index extraction
                  // - "type_service_id" -> specific field name
                  
                  if (field === 'id' || field === '[0].id' || field === '0.id') {
                    // Extract semantic field name from step description
                    // e.g., "Fetch type services" -> "type_service_id"
                    const semanticField = this.extractSemanticFieldName(s.description);
                    if (semanticField) {
                      fieldToStepMap[semanticField] = s.stepNumber;
                      console.log(`[ChatService] Mapped ${semanticField} to step ${s.stepNumber} (from: "${s.description}")`);
                    }
                  } else {
                    // Direct field name like "type_service_id"
                    fieldToStepMap[field] = s.stepNumber;
                    console.log(`[ChatService] Mapped ${field} to step ${s.stepNumber}`);
                  }
                }
              }
            }

            // Replace placeholders in body
            let body = JSON.stringify(step.action.body);
            console.log(`[ChatService] Original body with placeholders:`, body);

            // First, handle semantic keys (like {{type_service_id}})
            for (const [key, value] of Object.entries(extractedData)) {
              // Escape special regex characters in key
              const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const placeholder = `"\\{\\{${escapedKey}\\}\\}"`;
              if (body.includes(`{{${key}}}`)) {
                body = body.replace(new RegExp(placeholder, 'g'), JSON.stringify(value));
                console.log(`[ChatService] Replaced {{${key}}} with:`, value);
              }
            }

            // Parse body to find which fields still have placeholders
            let bodyObj: Record<string, unknown>;
            try {
              bodyObj = JSON.parse(body);
            } catch (e) {
              console.error(`[ChatService] Failed to parse body:`, e);
              bodyObj = step.action.body;
            }

            for (const [fieldName, fieldValue] of Object.entries(bodyObj)) {
              if (typeof fieldValue === 'string' && fieldValue.startsWith('{{') && fieldValue.endsWith('}}')) {
                // This field still has a placeholder, try to resolve it
                console.log(`[ChatService] Found unresolved placeholder in ${fieldName}: ${fieldValue}`);
                
                // Extract the placeholder content (e.g., "{{[0].id}}" -> "[0].id")
                const placeholderContent = fieldValue.slice(2, -2);
                
                // Try multiple strategies to find the value
                let resolvedValue: unknown = undefined;
                let resolutionSource = '';

                // Strategy 1: Look for step that extracts this specific field
                const targetStepNumber = fieldToStepMap[fieldName];
                if (targetStepNumber) {
                  const stepKey = `step${targetStepNumber}_0_id`;
                  resolvedValue = extractedData[stepKey];
                  resolutionSource = stepKey;
                  
                  if (resolvedValue === undefined) {
                    // Try the semantic key directly
                    resolvedValue = extractedData[fieldName];
                    resolutionSource = fieldName;
                  }
                }

                // Strategy 2: If placeholder contains array notation like [0].id, look for it directly
                if (resolvedValue === undefined && placeholderContent.includes('[')) {
                  // Convert {{[0].id}} format to step-specific key
                  const normalizedPlaceholder = placeholderContent.replace(/\[(\d+)\]/g, '$1');
                  for (const prevStep of steps) {
                    if (prevStep.stepNumber >= step.stepNumber) continue;
                    const stepKey = `step${prevStep.stepNumber}_${normalizedPlaceholder.replace(/\./g, '_')}`;
                    if (extractedData[stepKey] !== undefined) {
                      resolvedValue = extractedData[stepKey];
                      resolutionSource = stepKey;
                      break;
                    }
                  }
                }

                // Strategy 3: Look for any step that might have extracted an ID
                if (resolvedValue === undefined && fieldName.endsWith('_id')) {
                  for (const prevStep of steps) {
                    if (prevStep.stepNumber >= step.stepNumber) continue;
                    // Look for any id extracted from this step
                    const stepIdKey = `step${prevStep.stepNumber}_0_id`;
                    if (extractedData[stepIdKey] !== undefined) {
                      // Check if this step's description matches the field semantically
                      const semanticMatch = this.fieldMatchesStepDescription(fieldName, prevStep.description);
                      if (semanticMatch) {
                        resolvedValue = extractedData[stepIdKey];
                        resolutionSource = stepIdKey;
                        break;
                      }
                    }
                  }
                }

                if (resolvedValue !== undefined) {
                  body = body.replace(`"${fieldValue}"`, JSON.stringify(resolvedValue));
                  console.log(`[ChatService] Replaced ${fieldValue} in ${fieldName} with:`, resolvedValue, `(from: ${resolutionSource})`);
                } else {
                  console.warn(`[ChatService] Could not resolve placeholder ${fieldValue} in ${fieldName}`);
                  console.warn(`[ChatService] Available extracted data keys:`, Object.keys(extractedData));
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
            httpCode: executionResult.httpCode,
            stderr: executionResult.stderr || null,
            stdout: executionResult.stdout ? executionResult.stdout.substring(0, 500) : null,
          });

          // Check for token expiration (401 Unauthorized)
          if (executionResult.httpCode === 401) {
            console.warn(`[ChatService] Step ${step.stepNumber} received 401 Unauthorized - token expired`);
            results.push({
              step: step.stepNumber,
              description: step.description,
              success: false,
              error: 'Authentication token expired',
            });

            // Build error message with token expiration notice
            const stepSummaries = results.map(r =>
              `- ${r.success ? '✅' : '❌'} **Step ${r.step}:** ${r.description}${r.error ? ` (${r.error})` : ''}`
            ).join('\n');

            const errorMessage = `### Workflow stopped at step ${step.stepNumber}\n\n${stepSummaries}\n\n⚠️ **Authentication token expired.** Please redo the login again or ask me to do this for you.`;

            return {
              type: 'error',
              message: errorMessage,
            };
          }

          if (executionResult.success && executionResult.response) {
            // Extract data for future steps
            if (step.extractFields && step.extractFields.length > 0) {
              for (const field of step.extractFields) {
                // First, check if field uses filter syntax (e.g., "[name=Mauricio Henrique].id")
                const filterMatch = field.match(/^\[([^=]+)=([^\]]+)\](?:\.(.*))?$/);
                
                if (filterMatch) {
                  // Filter syntax extraction
                  // Store using the filter pattern as the key so it matches the placeholder
                  const value = this.extractFieldFromResponse(executionResult.response, field);
                  if (value !== undefined) {
                    // Use the filter pattern itself as the storage key
                    extractedData[field] = value;
                    // Also store with step-specific key
                    extractedData[`step${step.stepNumber}_${field}`] = value;
                    console.log(`[ChatService] Step ${step.stepNumber} extracted ${field} as ${field}:`, value);
                  }
                } else if (field.match(/^(\[?(\d+)\]?)\.(.+)$/)) {
                  // Array index path like "0.id" or "[0].id"
                  const arrayIndexMatch = field.match(/^(\[?(\d+)\]?)\.(.+)$/);
                  const [, , index, propPath] = arrayIndexMatch!;
                  const value = this.extractFieldFromResponse(executionResult.response, field);

                  // Generate a unique storage key from the step description
                  let storageKey: string;
                  const semanticField = this.extractSemanticFieldName(step.description);
                  
                  if (semanticField) {
                    storageKey = semanticField;
                  } else {
                    // Fallback: use step number to make it unique
                    storageKey = `step${step.stepNumber}_${propPath.replace(/\./g, '_')}`;
                  }

                  // Store with step-specific key to prevent overwriting
                  if (value !== undefined) {
                    extractedData[storageKey] = value;
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
                    // Use semantic field name if available, otherwise use the raw field
                    const semanticField = this.extractSemanticFieldName(step.description);
                    const storageKey = semanticField || field;
                    
                    extractedData[storageKey] = value;
                    // Also store with step-specific key
                    extractedData[`step${step.stepNumber}_${field}`] = value;
                    console.log(`[ChatService] Step ${step.stepNumber} extracted ${field} as ${storageKey}:`, value);
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
        `- ${r.success ? '✅' : '❌'} **Step ${r.step}:** ${r.description}${r.error ? ` (${r.error})` : ''}`
      ).join('\n');

      return {
        type: 'curl_command',
        explanation: `### Workflow executed with ${results.length} steps\n\n${stepSummaries}`,
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

    // Check for filter syntax: [field=value].path or [field=value]
    const filterMatch = field.match(/^\[([^=]+)=([^\]]+)\](?:\.(.*))?$/);
    if (filterMatch) {
      const [, filterField, filterValue, extractPath] = filterMatch;
      return this.extractFromFilteredArray(response, filterField, filterValue, extractPath);
    }

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

  /**
   * Extract values from array by filtering on a field value
   * Supports case-insensitive matching
   * Returns single value if one match, array if multiple matches
   */
  private extractFromFilteredArray(
    response: unknown,
    filterField: string,
    filterValue: string,
    extractPath?: string
  ): unknown {
    if (!Array.isArray(response)) {
      console.log(`[ChatService] Filter response is not an array:`, typeof response);
      return undefined;
    }

    console.log(`[ChatService] Filtering array by ${filterField}=${filterValue}, extractPath=${extractPath || 'none'}`);

    // Find all matching items (case-insensitive)
    const matches = response.filter(item => {
      if (item && typeof item === 'object') {
        const itemValue = (item as Record<string, unknown>)[filterField];
        const itemStr = String(itemValue || '').toLowerCase();
        const filterStr = filterValue.toLowerCase();
        return itemStr === filterStr;
      }
      return false;
    });

    console.log(`[ChatService] Found ${matches.length} matches for ${filterField}=${filterValue}`);

    if (matches.length === 0) {
      return undefined;
    }

    // Extract the specified field from each match
    const extractField = (item: unknown): unknown => {
      if (!extractPath) {
        return item;
      }
      return this.extractFieldFromResponse(item, extractPath);
    };

    if (matches.length === 1) {
      // Single match - return the extracted value directly
      const result = extractField(matches[0]);
      console.log(`[ChatService] Single match extracted:`, result);
      return result;
    } else {
      // Multiple matches - return array of extracted values
      const results = matches.map(extractField);
      console.log(`[ChatService] Multiple matches extracted:`, results.length, 'items');
      return results;
    }
  }

  /**
   * Extract a semantic field name from a step description.
   * E.g., "Fetch type services to get a valid type_service_id" -> "type_service_id"
   * E.g., "Fetch payment methods" -> "payment_method_id"
   */
  private extractSemanticFieldName(description: string): string | null {
    const desc = description.toLowerCase();
    
    // Look for explicit field mentions in the description
    const fieldMatch = desc.match(/(\w+_id)/);
    if (fieldMatch) {
      return fieldMatch[1];
    }
    
    // Map common patterns to field names
    if (desc.includes('type service')) {
      return 'type_service_id';
    } else if (desc.includes('payment')) {
      return 'payment_method_id';
    } else if (desc.includes('role')) {
      return 'role_id';
    } else if (desc.includes('employment relationship')) {
      return 'employment_relationship_id';
    } else if (desc.includes('professional area')) {
      return 'professional_area_id';
    } else if (desc.includes('user')) {
      return 'user_id';
    } else if (desc.includes('patient')) {
      return 'patient_id';
    } else if (desc.includes('doctor') || desc.includes('physician')) {
      return 'doctor_id';
    } else if (desc.includes('department')) {
      return 'department_id';
    } else if (desc.includes('category')) {
      return 'category_id';
    } else if (desc.includes('product')) {
      return 'product_id';
    } else if (desc.includes('order')) {
      return 'order_id';
    } else if (desc.includes('client')) {
      return 'client_id';
    } else if (desc.includes('customer')) {
      return 'customer_id';
    } else if (desc.includes('service')) {
      return 'service_id';
    }
    
    // Try to extract from "Fetch X to get Y" pattern
    const fetchMatch = desc.match(/fetch\s+(\w+(?:\s+\w+)*)/);
    if (fetchMatch) {
      // Convert "type services" to "type_service_id"
      const resourceName = fetchMatch[1].trim();
      // Remove plural 's' if present, replace spaces with underscores, add _id
      const singular = resourceName.replace(/s$/, '');
      return singular.replace(/\s+/g, '_') + '_id';
    }
    
    return null;
  }

  /**
   * Check if a field name semantically matches a step description.
   * E.g., "type_service_id" matches "Fetch type services"
   */
  private fieldMatchesStepDescription(fieldName: string, description: string): boolean {
    const field = fieldName.toLowerCase().replace(/_id$/, '');
    const desc = description.toLowerCase();
    
    // Remove underscores from field for comparison
    const fieldWords = field.replace(/_/g, ' ');
    
    // Check if field words appear in description
    return desc.includes(fieldWords) || 
           fieldWords.split(' ').every(word => desc.includes(word));
  }

  /**
   * Validate that a POST step has required foreign key fetching steps before it.
   * Returns array of missing foreign key field names.
   */
  private validateForeignKeySteps(
    postStep: { stepNumber: number; action: { endpoint: string; method: string }; description: string },
    allSteps: Array<{ stepNumber: number; action: { endpoint: string; method: string }; description: string }>,
    swaggerDoc: string
  ): string[] {
    const missingForeignKeys: string[] = [];
    
    // Parse the swagger doc to find the POST endpoint schema
    // Look for the endpoint in the formatted swagger
    const endpointMatch = swaggerDoc.match(new RegExp(`### POST ${postStep.action.endpoint.replace(/\//g, '\\/')}([\\s\\S]*?)(?=###|\\n## |$)`));
    if (!endpointMatch) {
      console.log(`[ChatService] Could not find swagger definition for POST ${postStep.action.endpoint}`);
      return missingForeignKeys;
    }
    
    const endpointDoc = endpointMatch[0];
    
    // Look for Request Body > Fields section
    const fieldsMatch = endpointDoc.match(/Request Body:[\s\S]*?Fields:([\s\S]*?)(?=Responses:|###|## |$)/);
    if (!fieldsMatch) {
      console.log(`[ChatService] No fields section found for POST ${postStep.action.endpoint}`);
      return missingForeignKeys;
    }
    
    const fieldsSection = fieldsMatch[1];
    
    // Find all fields that are marked as REQUIRED and end with _id
    const fieldLines = fieldsSection.split('\n');
    const requiredForeignKeys: string[] = [];
    
    for (const line of fieldLines) {
      // Match lines like "- type_service_id: string (REQUIRED) [FOREIGN KEY]"
      const fieldMatch = line.match(/-\s+(\w+_id):\s+\w+\s+\(REQUIRED\).*\[FOREIGN KEY\]/i);
      if (fieldMatch) {
        requiredForeignKeys.push(fieldMatch[1]);
      }
    }
    
    if (requiredForeignKeys.length === 0) {
      console.log(`[ChatService] No required foreign keys found for POST ${postStep.action.endpoint}`);
      return missingForeignKeys;
    }
    
    console.log(`[ChatService] POST ${postStep.action.endpoint} requires foreign keys:`, requiredForeignKeys);
    
    // Check if there are GET steps before this POST step that fetch these foreign keys
    const previousSteps = allSteps.filter(s => s.stepNumber < postStep.stepNumber);
    
    for (const foreignKey of requiredForeignKeys) {
      // Extract the resource name from the foreign key (e.g., "type_service_id" -> "type service")
      const resourceName = foreignKey.replace(/_id$/, '').replace(/_/g, ' ');
      
      // Check if any previous step fetches this resource
      const hasFetchingStep = previousSteps.some(step => {
        const stepDesc = step.description.toLowerCase();
        const stepEndpoint = step.action.endpoint.toLowerCase();
        
        // Check if step description mentions the resource
        const descMatches = stepDesc.includes(resourceName.toLowerCase()) ||
                           stepDesc.includes(resourceName.replace(/s$/, '').toLowerCase());
        
        // Check if step endpoint is related to the resource
        const endpointMatches = stepEndpoint.includes(resourceName.replace(/_/g, '-')) ||
                               stepEndpoint.includes(resourceName.replace(/_/g, ''));
        
        return step.action.method?.toUpperCase() === 'GET' && (descMatches || endpointMatches);
      });
      
      if (!hasFetchingStep) {
        missingForeignKeys.push(foreignKey);
        console.warn(`[ChatService] Missing foreign key fetching step for: ${foreignKey}`);
      }
    }
    
    return missingForeignKeys;
  }
}

// Singleton instance
export const chatService = new ChatService();
