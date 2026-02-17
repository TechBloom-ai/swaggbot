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

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
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
        uri: 'swaggbot://sessions',
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

  if (uri === 'swaggbot://sessions') {
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
  const sessionMatch = uri.match(/^swaggbot:\/\/session\/([^/]+)(?:\/swagger)?$/);
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
