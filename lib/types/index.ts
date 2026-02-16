// Intent classification result
export interface IntentClassification {
  type: 'single_request' | 'workflow' | 'api_info' | 'self_awareness';
  confidence: number;
  reasoning: string;
  estimatedSteps?: number;
}

// Curl generation result with execution info
export interface CurlGenerationResult {
  type: 'curl_command';
  explanation: string;
  curl: string;
  shouldExecute: boolean;
  isAuthEndpoint: boolean;
  tokenPath?: string;
  note?: string;
  executed?: boolean;
  result?: unknown;
  missingFields?: string[]; // Fields that are required but not provided
  hasPlaceholders?: boolean; // Whether the curl contains placeholder values
}

// API information result
export interface ApiInfoResult {
  type: 'api_info';
  explanation: string;
  apiInfo?: {
    endpoint: string;
    method: string;
    summary?: string;
    description?: string;
    parameters?: Array<{
      name: string;
      in: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
    requestBody?: {
      description?: string;
      schema?: unknown;
    };
    responses?: Record<string, {
      description: string;
    }>;
  };
}

// Self-awareness result
export interface SelfAwarenessResult {
  type: 'self_awareness';
  response: string;
}

// Union type for all chat response types
export type ChatResponse = 
  | CurlGenerationResult 
  | ApiInfoResult 
  | SelfAwarenessResult 
  | {
      type: 'error';
      message: string;
    };

// Workflow step definition
export interface WorkflowStep {
  stepNumber: number;
  description: string;
  action: {
    endpoint: string;
    method: string;
    purpose: string;
    body?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
  extractFields?: string[];
  notes?: string;
}

// Workflow plan result
export interface WorkflowPlan {
  workflowName: string;
  description: string;
  steps: WorkflowStep[];
  estimatedTotalSteps: number;
}

// Chat message type
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    type?: 'curl' | 'api_info' | 'error';
    curl?: string;
    executed?: boolean;
    result?: unknown;
  };
}

// Swagger/OpenAPI document type (simplified)
export interface SwaggerDoc {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  host?: string;
  basePath?: string;
  schemes?: string[];
  paths: Record<string, Record<string, unknown>>;
  components?: unknown;
  definitions?: unknown;
}

// Execution result from curl command
export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  response?: unknown;
}

// LLM Message format
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// LLM Provider interface
export interface LLMProviderConfig {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}
