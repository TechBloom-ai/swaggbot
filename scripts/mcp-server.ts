import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { sessionService } from '../lib/services/session.js';
import { chatService } from '../lib/services/chat.js';
import { workflowService } from '../lib/services/workflow.js';
import { executeCurl } from '../lib/utils/curl.js';

// Error types for structured error handling
interface MCPError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
}

const createError = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
  suggestion?: string
): MCPError => ({
  code,
  message,
  details,
  suggestion,
});

const errorToText = (error: MCPError): string => {
  let text = `Error [${error.code}]: ${error.message}`;
  if (error.suggestion) {
    text += `\n\n💡 Suggestion: ${error.suggestion}`;
  }
  return text;
};

// Swagger/OpenAPI types
interface SwaggerParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'body';
  required?: boolean;
  type?: string;
  schema?: {
    type?: string;
    items?: {
      type?: string;
    };
  };
  description?: string;
}

interface SwaggerOperation {
  summary?: string;
  description?: string;
  parameters?: SwaggerParameter[];
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: {
          type?: string;
          properties?: Record<string, unknown>;
          required?: string[];
        };
      };
    };
  };
}

interface SwaggerPath {
  [method: string]: SwaggerOperation;
}

interface SwaggerDoc {
  paths?: Record<string, SwaggerPath>;
  basePath?: string;
  servers?: Array<{ url: string }>;
}

interface EndpointInfo {
  path: string;
  method: string;
  summary: string;
  description: string;
  parameters: SwaggerParameter[];
  hasRequestBody: boolean;
}

// Helper function to parse swagger and extract endpoints
function parseSwaggerEndpoints(swaggerDoc: SwaggerDoc): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];
  const paths = swaggerDoc.paths || {};

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem as SwaggerPath)) {
      if (typeof operation !== 'object' || operation === null) {
        continue;
      }

      // Skip non-HTTP methods (like parameters at path level)
      const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
      if (!httpMethods.includes(method.toLowerCase())) {
        continue;
      }

      const params: SwaggerParameter[] = [];

      // Add path parameters
      const pathParams = (path.match(/{([^}]+)}/g) || []).map(p => ({
        name: p.slice(1, -1),
        in: 'path' as const,
        required: true,
        type: 'string',
        description: `Path parameter: ${p.slice(1, -1)}`,
      }));
      params.push(...pathParams);

      // Add operation parameters
      if (operation.parameters) {
        for (const param of operation.parameters) {
          // Skip if already added as path param
          if (params.some(p => p.name === param.name && p.in === 'path')) {
            continue;
          }
          params.push(param);
        }
      }

      // Check for request body (OpenAPI 3.0+)
      const hasRequestBody = !!operation.requestBody;

      endpoints.push({
        path,
        method: method.toUpperCase(),
        summary: operation.summary || `${method.toUpperCase()} ${path}`,
        description: operation.description || '',
        parameters: params,
        hasRequestBody,
      });
    }
  }

  return endpoints;
}

// Helper function to format endpoint list for display
function formatEndpointList(endpoints: EndpointInfo[]): string {
  if (endpoints.length === 0) {
    return 'No endpoints found in the API documentation.';
  }

  let result = `Found ${endpoints.length} endpoints:\n\n`;

  endpoints.forEach((endpoint, index) => {
    result += `${index + 1}. ${endpoint.method} ${endpoint.path}\n`;
    result += `   ${endpoint.summary}\n`;

    if (endpoint.parameters.length > 0) {
      result += `   Parameters:\n`;
      endpoint.parameters.forEach(param => {
        const required = param.required ? ' (required)' : '';
        const type = param.type || param.schema?.type || 'string';
        result += `     - ${param.name}: ${type}${required}\n`;
      });
    }

    if (endpoint.hasRequestBody) {
      result += `   Request body: JSON object\n`;
    }

    result += '\n';
  });

  return result;
}

// Helper function to validate endpoint parameters
function validateEndpointParameters(
  endpoint: EndpointInfo,
  parameters: Record<string, unknown>,
  body?: Record<string, unknown>
): { valid: boolean; error?: string } {
  const missingParams: string[] = [];

  for (const param of endpoint.parameters) {
    if (param.required && param.in !== 'body') {
      const value = parameters[param.name];
      if (value === undefined || value === null || value === '') {
        missingParams.push(param.name);
      }
    }
  }

  if (endpoint.hasRequestBody && !body) {
    return {
      valid: false,
      error: 'This endpoint requires a request body. Please provide the body parameter.',
    };
  }

  if (missingParams.length > 0) {
    return {
      valid: false,
      error: `Missing required parameters: ${missingParams.join(', ')}`,
    };
  }

  return { valid: true };
}

// Helper function to build and execute endpoint curl command
async function executeEndpoint(
  session: { baseUrl: string | null; authToken: string | null },
  endpoint: EndpointInfo,
  parameters: Record<string, unknown>,
  body?: Record<string, unknown>
): Promise<{ success: boolean; response?: unknown; error?: string; httpCode?: number }> {
  // Build URL with path parameters
  let url = endpoint.path;
  for (const [key, value] of Object.entries(parameters)) {
    const param = endpoint.parameters.find(p => p.name === key && p.in === 'path');
    if (param) {
      url = url.replace(`{${key}}`, String(value));
    }
  }

  // Add query parameters
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    const param = endpoint.parameters.find(p => p.name === key && p.in === 'query');
    if (param && value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach(v => queryParams.append(key, String(v)));
      } else {
        queryParams.append(key, String(value));
      }
    }
  }

  const baseUrl = session.baseUrl || '';
  let fullUrl = `${baseUrl}${url}`;
  const queryString = queryParams.toString();
  if (queryString) {
    fullUrl += `?${queryString}`;
  }

  // Build curl command
  let curl = `curl -X ${endpoint.method} '${fullUrl}'`;
  curl += ` -H 'Content-Type: application/json'`;

  // Add auth header if session has auth token
  if (session.authToken) {
    const authHeader = session.authToken.startsWith('Bearer ')
      ? session.authToken
      : `Bearer ${session.authToken}`;
    curl += ` -H 'Authorization: ${authHeader}'`;
  }

  // Add body if present
  if (body && Object.keys(body).length > 0) {
    curl += ` -d '${JSON.stringify(body)}'`;
  }

  // Execute curl
  const result = await executeCurl(curl);

  return {
    success: result.success,
    response: result.response,
    error: result.stderr || undefined,
    httpCode: result.httpCode,
  };
}

// Initialize MCP Server
const server = new Server(
  {
    name: 'swaggbot',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'swaggbot_create_session',
        description: 'Create a new API session from a Swagger/OpenAPI URL',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'User-friendly name for the session',
            },
            swaggerUrl: {
              type: 'string',
              description: 'URL to the Swagger/OpenAPI documentation',
            },
          },
          required: ['name', 'swaggerUrl'],
        },
      },
      {
        name: 'swaggbot_list_sessions',
        description: 'List all available API sessions',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'swaggbot_delete_session',
        description: 'Delete an API session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the session to delete',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'swaggbot_chat',
        description: 'Send a message to Swaggbot to interact with an API',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the session to use',
            },
            message: {
              type: 'string',
              description: 'Natural language message describing what you want to do',
            },
          },
          required: ['sessionId', 'message'],
        },
      },
      {
        name: 'swaggbot_create_workflow',
        description:
          'Create a multi-step workflow from a natural language description. Returns the planned workflow steps without executing them. Use swaggbot_execute_workflow to run the workflow.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the session to use',
            },
            description: {
              type: 'string',
              description:
                'Natural language description of what the workflow should accomplish (e.g., "Create a new user with name John, then assign them the Admin role")',
            },
          },
          required: ['sessionId', 'description'],
        },
      },
      {
        name: 'swaggbot_list_workflows',
        description: 'List all workflows for a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the session to list workflows for',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'swaggbot_execute_workflow',
        description:
          'Execute a previously created workflow by its ID. The workflow will run all steps sequentially.',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'ID of the workflow to execute',
            },
          },
          required: ['workflowId'],
        },
      },
      {
        name: 'swaggbot_list_endpoints',
        description:
          'List all available API endpoints for a session with their parameters and descriptions. Use this to discover what operations are available.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the session to inspect',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'swaggbot_execute_endpoint',
        description:
          'Execute a specific API endpoint with automatic parameter validation. Use swaggbot_list_endpoints first to discover available endpoints and their parameters.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the session to use',
            },
            endpoint: {
              type: 'string',
              description: 'API endpoint path (e.g., "/pet/{petId}" or "/pet/findByStatus")',
            },
            method: {
              type: 'string',
              description: 'HTTP method: GET, POST, PUT, PATCH, DELETE',
            },
            parameters: {
              type: 'object',
              description: 'Path and query parameters (optional)',
            },
            body: {
              type: 'object',
              description: 'Request body for POST/PUT/PATCH (optional)',
            },
          },
          required: ['sessionId', 'endpoint', 'method'],
        },
      },
      {
        name: 'swaggbot_set_auth_token',
        description:
          'Manually set the authentication token for a session. Use this after login to save the access token so subsequent requests are authenticated.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the session to set the auth token for',
            },
            token: {
              type: 'string',
              description:
                'The authentication token (e.g., JWT access token). Can be provided with or without "Bearer " prefix.',
            },
          },
          required: ['sessionId', 'token'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'swaggbot_create_session': {
        const { name, swaggerUrl } = args as { name: string; swaggerUrl: string };
        const session = await sessionService.create({ name, swaggerUrl });
        return {
          content: [
            {
              type: 'text',
              text: `Created session "${session.name}" (ID: ${session.id})`,
            },
          ],
        };
      }

      case 'swaggbot_list_sessions': {
        const sessions = await sessionService.findAll();
        if (sessions.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No sessions found. Create one with swaggbot_create_session.',
              },
            ],
          };
        }
        const sessionList = sessions.map(s => `- ${s.name} (ID: ${s.id})`).join('\n');
        return {
          content: [
            {
              type: 'text',
              text: `Available sessions:\n${sessionList}`,
            },
          ],
        };
      }

      case 'swaggbot_delete_session': {
        const { sessionId } = args as { sessionId: string };
        await sessionService.delete(sessionId);
        return {
          content: [
            {
              type: 'text',
              text: `Session ${sessionId} deleted successfully.`,
            },
          ],
        };
      }

      case 'swaggbot_chat': {
        const { sessionId, message } = args as { sessionId: string; message: string };
        const response = await chatService.processMessage({ sessionId, message });

        let responseText = '';

        if (response.type === 'curl_command') {
          responseText = `${response.explanation}\n\n`;
          if (response.curl) {
            responseText += `Command:\n\`\`\`bash\n${response.curl}\n\`\`\`\n\n`;
          }
          if (response.executed) {
            responseText += `✅ Executed successfully\n\n`;
            if (response.result) {
              responseText += `Result:\n\`\`\`json\n${JSON.stringify(response.result, null, 2)}\n\`\`\``;
            }
          }
          if (response.note) {
            responseText += `\nNote: ${response.note}`;
          }
        } else if (response.type === 'api_info') {
          responseText = response.explanation;
        } else if (response.type === 'error') {
          responseText = `❌ Error: ${response.message}`;
        }

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      }

      case 'swaggbot_create_workflow': {
        const { sessionId, description } = args as { sessionId: string; description: string };

        // Verify session exists
        const session = await sessionService.findById(sessionId);
        if (!session) {
          const error = createError(
            'SESSION_NOT_FOUND',
            `Session ${sessionId} not found`,
            { sessionId },
            'Use swaggbot_list_sessions to see available sessions, or create a new one with swaggbot_create_session'
          );
          return {
            content: [{ type: 'text', text: errorToText(error) }],
            isError: true,
          };
        }

        const workflow = await workflowService.create({ sessionId, description });
        const steps = JSON.parse(workflow.steps);

        const stepsText = steps
          .map(
            (step: {
              stepNumber: number;
              description: string;
              action: { method: string; endpoint: string };
            }) =>
              `${step.stepNumber}. ${step.description} (${step.action.method} ${step.action.endpoint})`
          )
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Created workflow "${workflow.name}" (ID: ${workflow.id})\n\nPlanned steps:\n${stepsText}\n\nExecute with: swaggbot_execute_workflow({ workflowId: "${workflow.id}" })`,
            },
          ],
        };
      }

      case 'swaggbot_list_workflows': {
        const { sessionId } = args as { sessionId: string };

        // Verify session exists
        const session = await sessionService.findById(sessionId);
        if (!session) {
          const error = createError(
            'SESSION_NOT_FOUND',
            `Session ${sessionId} not found`,
            { sessionId },
            'Use swaggbot_list_sessions to see available sessions'
          );
          return {
            content: [{ type: 'text', text: errorToText(error) }],
            isError: true,
          };
        }

        const workflows = await workflowService.findBySessionId(sessionId);

        if (workflows.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No workflows found for session "${session.name}". Create one with swaggbot_create_workflow.`,
              },
            ],
          };
        }

        const workflowList = workflows
          .map(w => {
            const status =
              w.status === 'completed'
                ? '✅'
                : w.status === 'failed'
                  ? '❌'
                  : w.status === 'running'
                    ? '🔄'
                    : '⏳';
            return `${status} ${w.name} (ID: ${w.id}) - ${w.status}${w.executionCount > 0 ? ` (${w.executionCount} executions)` : ''}`;
          })
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Workflows for session "${session.name}":\n\n${workflowList}`,
            },
          ],
        };
      }

      case 'swaggbot_execute_workflow': {
        const { workflowId } = args as { workflowId: string };

        // Verify workflow exists
        const workflow = await workflowService.findById(workflowId);
        if (!workflow) {
          const error = createError(
            'WORKFLOW_NOT_FOUND',
            `Workflow ${workflowId} not found`,
            { workflowId },
            'Use swaggbot_list_workflows to see available workflows for a session'
          );
          return {
            content: [{ type: 'text', text: errorToText(error) }],
            isError: true,
          };
        }

        const result = await workflowService.execute(workflowId);

        return {
          content: [
            {
              type: 'text',
              text: result.summary,
            },
          ],
          isError: !result.success,
        };
      }

      case 'swaggbot_list_endpoints': {
        const { sessionId } = args as { sessionId: string };

        // Verify session exists
        const session = await sessionService.findById(sessionId);
        if (!session) {
          const error = createError(
            'SESSION_NOT_FOUND',
            `Session ${sessionId} not found`,
            { sessionId },
            'Use swaggbot_list_sessions to see available sessions'
          );
          return {
            content: [{ type: 'text', text: errorToText(error) }],
            isError: true,
          };
        }

        // Parse swagger and extract endpoints
        const swaggerDoc = JSON.parse(session.swaggerDoc) as SwaggerDoc;
        const endpoints = parseSwaggerEndpoints(swaggerDoc);

        if (endpoints.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No endpoints found in the Swagger documentation for session "${session.name}".`,
              },
            ],
          };
        }

        const formattedList = formatEndpointList(endpoints);

        return {
          content: [
            {
              type: 'text',
              text: `API Endpoints for session "${session.name}":\n\n${formattedList}\nTo execute an endpoint, use swaggbot_execute_endpoint with the endpoint path and method.`,
            },
          ],
        };
      }

      case 'swaggbot_execute_endpoint': {
        const { sessionId, endpoint, method, parameters, body } = args as {
          sessionId: string;
          endpoint: string;
          method: string;
          parameters?: Record<string, unknown>;
          body?: Record<string, unknown>;
        };

        // Verify session exists
        const session = await sessionService.findById(sessionId);
        if (!session) {
          const error = createError(
            'SESSION_NOT_FOUND',
            `Session ${sessionId} not found`,
            { sessionId },
            'Use swaggbot_list_sessions to see available sessions'
          );
          return {
            content: [{ type: 'text', text: errorToText(error) }],
            isError: true,
          };
        }

        // Parse swagger and find the endpoint
        const swaggerDoc = JSON.parse(session.swaggerDoc) as SwaggerDoc;
        const endpoints = parseSwaggerEndpoints(swaggerDoc);

        const targetEndpoint = endpoints.find(
          e => e.path === endpoint && e.method === method.toUpperCase()
        );

        if (!targetEndpoint) {
          const error = createError(
            'ENDPOINT_NOT_FOUND',
            `Endpoint ${method} ${endpoint} not found in the API documentation`,
            { endpoint, method },
            'Use swaggbot_list_endpoints to see all available endpoints'
          );
          return {
            content: [{ type: 'text', text: errorToText(error) }],
            isError: true,
          };
        }

        // Validate parameters
        const validation = validateEndpointParameters(targetEndpoint, parameters || {}, body);

        if (!validation.valid) {
          const error = createError(
            'VALIDATION_ERROR',
            validation.error || 'Parameter validation failed',
            { endpoint, method, parameters },
            'Check the endpoint documentation with swaggbot_list_endpoints'
          );
          return {
            content: [{ type: 'text', text: errorToText(error) }],
            isError: true,
          };
        }

        // Execute the endpoint
        const result = await executeEndpoint(session, targetEndpoint, parameters || {}, body);

        if (!result.success) {
          let suggestion = 'Check that all parameters are correct.';
          if (result.httpCode === 401) {
            suggestion = 'Authentication token expired. Re-authenticate using swaggbot_chat.';
          } else if (result.httpCode === 404) {
            suggestion = 'The resource was not found. Check the endpoint path and path parameters.';
          } else if (result.httpCode === 400) {
            suggestion =
              'Bad request. Verify the request body and parameters match the API schema.';
          }

          const error = createError(
            'EXECUTION_ERROR',
            result.error || `Request failed with HTTP ${result.httpCode}`,
            { endpoint, method, httpCode: result.httpCode },
            suggestion
          );
          return {
            content: [{ type: 'text', text: errorToText(error) }],
            isError: true,
          };
        }

        // Return raw JSON response
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.response, null, 2),
            },
          ],
        };
      }

      case 'swaggbot_set_auth_token': {
        const { sessionId, token } = args as { sessionId: string; token: string };

        // Verify session exists
        const session = await sessionService.findById(sessionId);
        if (!session) {
          const error = createError(
            'SESSION_NOT_FOUND',
            `Session ${sessionId} not found`,
            { sessionId },
            'Use swaggbot_list_sessions to see available sessions'
          );
          return {
            content: [{ type: 'text', text: errorToText(error) }],
            isError: true,
          };
        }

        // Clean up the token (remove Bearer prefix if present for storage)
        const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

        // Update the session's auth token
        await sessionService.updateAuthToken(sessionId, cleanToken);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Authentication token set successfully for session "${session.name}".\n\nSubsequent API calls will now include the Authorization header.`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Create structured error with context
    let mcpError: MCPError;

    if (errorMessage.includes('Session not found')) {
      mcpError = createError(
        'SESSION_NOT_FOUND',
        errorMessage,
        undefined,
        'Use swaggbot_list_sessions to see available sessions'
      );
    } else if (errorMessage.includes('Workflow not found')) {
      mcpError = createError(
        'WORKFLOW_NOT_FOUND',
        errorMessage,
        undefined,
        'Use swaggbot_list_workflows to see available workflows'
      );
    } else if (
      errorMessage.includes('Authentication token expired') ||
      errorMessage.includes('401')
    ) {
      mcpError = createError(
        'AUTH_TOKEN_EXPIRED',
        'Authentication token has expired',
        undefined,
        'Authenticate again using swaggbot_chat with your login endpoint'
      );
    } else if (errorMessage.includes('Failed to fetch Swagger')) {
      mcpError = createError(
        'SWAGGER_FETCH_FAILED',
        errorMessage,
        undefined,
        'Check that the Swagger URL is accessible and returns valid OpenAPI documentation'
      );
    } else if (errorMessage.includes('foreign key')) {
      mcpError = createError(
        'WORKFLOW_VALIDATION_FAILED',
        errorMessage,
        undefined,
        'The workflow planning failed to include necessary data fetching steps. Try rephrasing your description or breaking it into smaller steps.'
      );
    } else {
      mcpError = createError(
        'INTERNAL_ERROR',
        errorMessage,
        undefined,
        'If the problem persists, check the server logs for more details'
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: errorToText(mcpError),
        },
      ],
      isError: true,
    };
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'resource://swaggbot/sessions',
        name: 'API Sessions',
        mimeType: 'application/json',
        description: 'List of all configured API sessions',
      },
    ],
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async request => {
  const { uri } = request.params;

  if (uri === 'resource://swaggbot/sessions') {
    const sessions = await sessionService.findAll();
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(sessions, null, 2),
        },
      ],
    };
  }

  // Handle session-specific resources
  const sessionMatch = uri.match(/^resource:\/\/swaggbot\/session\/([^/]+)(?:\/swagger)?$/);
  if (sessionMatch) {
    const sessionId = sessionMatch[1];
    const session = await sessionService.findById(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (uri.endsWith('/swagger')) {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: session.swaggerDoc,
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(session, null, 2),
        },
      ],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'swaggbot_explore_api',
        description: 'Help me explore this API',
        arguments: [
          {
            name: 'sessionId',
            description: 'ID of the session to explore',
            required: true,
          },
        ],
      },
      {
        name: 'swaggbot_common_tasks',
        description: 'What can I do with this API?',
        arguments: [
          {
            name: 'sessionId',
            description: 'ID of the session',
            required: true,
          },
        ],
      },
      {
        name: 'swaggbot_explore_endpoints',
        description: 'Show me all the API endpoints I can call',
        arguments: [
          {
            name: 'sessionId',
            description: 'ID of the session to explore',
            required: true,
          },
        ],
      },
    ],
  };
});

// Get prompt
server.setRequestHandler(GetPromptRequestSchema, async request => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'swaggbot_explore_api': {
      const { sessionId } = args as { sessionId: string };
      const session = await sessionService.findById(sessionId);

      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const formattedSwagger = sessionService.getFormattedSwagger(session);

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Help me explore this API. Here's the documentation:\n\n${formattedSwagger}\n\nWhat endpoints are available and what can I do with this API?`,
            },
          },
        ],
      };
    }

    case 'swaggbot_common_tasks': {
      const { sessionId } = args as { sessionId: string };
      const session = await sessionService.findById(sessionId);

      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I'm using the API "${session.name}". What are some common tasks I can perform?`,
            },
          },
        ],
      };
    }

    case 'swaggbot_explore_endpoints': {
      const { sessionId } = args as { sessionId: string };
      const session = await sessionService.findById(sessionId);

      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const swaggerDoc = JSON.parse(session.swaggerDoc) as SwaggerDoc;
      const endpoints = parseSwaggerEndpoints(swaggerDoc);

      let endpointList = '';
      if (endpoints.length === 0) {
        endpointList = 'No endpoints found.';
      } else {
        endpointList = endpoints.map(e => `- ${e.method} ${e.path}: ${e.summary}`).join('\n');
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I'm using the API "${session.name}". Here are the available endpoints:\n\n${endpointList}\n\nI can execute any of these endpoints using the swaggbot_execute_endpoint tool. What would you like to do?`,
            },
          },
        ],
      };
    }

    default:
      throw new Error(`Prompt not found: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Swaggbot MCP Server running on stdio');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
