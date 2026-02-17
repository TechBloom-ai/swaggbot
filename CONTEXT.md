# Swaggbot v2 - Open Source Architecture

## Vision

Swaggbot is an open-source, self-hosted tool that transforms Swagger/OpenAPI documentation into conversational interfaces. Built with Next.js, it provides both a web UI and MCP (Model Context Protocol) server for seamless integration with local AI assistants like Claude Desktop, Cursor, and others.

**Philosophy**: Local-first, single-user, simple to deploy. If you have access to a Swagger doc, you can explore and interact with that API naturally through chat.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Application                       │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │   Web UI (SSR)  │  │   API Routes    │  │  MCP Server │  │
│  │                 │  │                 │  │             │  │
│  │ • Chat Interface│  │ • /api/chat     │  │ • Tools     │  │
│  │ • Session Mgmt  │  │ • /api/session  │  │ • Resources │  │
│  │ • History       │  │ • /api/workflow │  │ • Prompts   │  │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘  │
│           │                    │                   │        │
│           └────────────────────┴───────────────────┘        │
│                              │                              │
│                    ┌─────────┴─────────┐                    │
│                    │   Core Services   │                    │
│                    │                   │                    │
│                    │ • LLM Provider    │                    │
│                    │ • Swagger Parser  │                    │
│                    │ • Workflow Engine │                    │
│                    │ • Session Store   │                    │
│                    └─────────┬─────────┘                    │
│                              │                              │
│                    ┌─────────┴─────────┐                    │
│                    │   Data Layer      │                    │
│                    │                   │                    │
│                    │ • SQLite (libSQL) │                    │
│                    │ • File System     │                    │
│                    └───────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Web UI (Next.js Pages/App Router)

**Purpose**: Chat interface for non-technical users and API exploration

**Features**:
- Real-time chat with API
- Session management (create, list, delete)
- Swagger doc viewer
- Request/response history
- Workflow visualization
- Settings/configuration UI

**Tech Stack**:
- Next.js 14+ (App Router)
- React Server Components
- TailwindCSS + shadcn/ui
- React Query (TanStack Query)

### 2. API Routes (Next.js API)

**Purpose**: HTTP endpoints for web UI and external integrations

**Endpoints**:
```typescript
// Session Management
POST   /api/session          // Create new session
GET    /api/session          // List sessions
GET    /api/session/[id]     // Get session details
DELETE /api/session/[id]     // Delete session
PATCH  /api/session/[id]     // Update session (auth, etc.)

// Chat
POST   /api/chat             // Send message, get response

// Workflow
POST   /api/workflow         // Create workflow
GET    /api/workflow         // List workflows
GET    /api/workflow/[id]    // Get workflow details
POST   /api/workflow/[id]/execute     // Execute workflow

// System
GET    /api/health           // Health check
GET    /api/config           // Get current configuration
```

### 3. MCP Server (Model Context Protocol)

**Purpose**: Enable local AI assistants (Claude Desktop, Cursor, etc.) to interact with Swaggbot

**MCP Resources**:
```typescript
// Sessions
resource://swaggbot/sessions              // List all sessions
resource://swaggbot/session/{id}          // Get specific session
resource://swaggbot/session/{id}/swagger  // Get session's Swagger doc


```

**MCP Tools**:
```typescript
// Session Management
tool: swaggbot_create_session
  - input: { swaggerUrl: string, name?: string }
  - output: { sessionId, name, swaggerUrl }

tool: swaggbot_list_sessions
  - input: {}
  - output: { sessions: [...] }

tool: swaggbot_delete_session
  - input: { sessionId: string }
  - output: { success: boolean }

// Chat
tool: swaggbot_chat
  - input: { sessionId: string, message: string }
  - output: { response, curl?, executed?, result? }

// Workflow
tool: swaggbot_create_workflow
  - input: { sessionId: string, description: string }
  - output: { workflowId, steps: [...] }

tool: swaggbot_execute_workflow
  - input: { workflowId: string }
  - output: { success, steps: [...], summary }
```

**MCP Prompts**:
```typescript
prompt: swaggbot_explore_api
  - description: "Help me explore this API"
  - arguments: { sessionId: string }
  
prompt: swaggbot_common_tasks
  - description: "What can I do with this API?"
  - arguments: { sessionId: string }
```

---

## Technology Stack

| Layer | Technology | Reason |
|-------|-----------|---------|
| **Framework** | Next.js 14+ | Full-stack, SSR, API routes, great DX |
| **Database** | libSQL (Turso) | SQLite-compatible, edge-ready, file-based option |
| **ORM** | Drizzle ORM | Type-safe, lightweight, SQL-like syntax |
| **Styling** | TailwindCSS + shadcn/ui | Modern, accessible, easy to customize |
| **State** | Zustand + React Query | Simple global state + server state management |
| **LLM** | Vercel AI SDK | Universal LLM interface (OpenAI, Anthropic, custom) |
| **MCP** | Official MCP SDK | Model Context Protocol implementation |
| **Validation** | Zod | Type-safe validation, used by Next.js ecosystem |

---

## Database Schema (libSQL/SQLite)

**V2 Philosophy**: No chat history persistence. Sessions store only configuration and authentication, not conversation history. This keeps the database lightweight and focused on state management.

```typescript
// sessions table
interface Session {
  id: string;                    // UUID
  name: string;                  // User-friendly name
  swaggerUrl: string;            // Source URL
  swaggerDoc: string;            // JSON string of Swagger doc
  authToken: string | null;      // Optional auth token
  baseUrl: string | null;        // Extracted from Swagger
  lastAccessedAt: Date;          // For cleanup purposes
  createdAt: Date;
  updatedAt: Date;
}

// workflows table
interface Workflow {
  id: string;                    // UUID
  sessionId: string;             // Foreign key
  name: string;                  // Generated or user-provided
  description: string;           // Original user request
  steps: string;                 // JSON array of workflow steps
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

// workflow_executions table
interface WorkflowExecution {
  id: string;                    // UUID
  workflowId: string;            // Foreign key
  stepNumber: number;            // Which step
  status: 'completed' | 'failed';
  request: string;               // JSON: curl, headers, body
  response: string | null;       // JSON: response data (truncated if large)
  extracted: string | null;      // JSON: extracted values
  error: string | null;          // Error message if failed
  executedAt: Date;
}

// settings table (key-value)
interface Setting {
  key: string;                   // Setting name
  value: string;                 // Setting value (JSON if complex)
  updatedAt: Date;
}
```

### Why No Chat History?

- **Simplicity**: No need to manage conversation state
- **Privacy**: Conversations aren't stored
- **Cost**: No LLM context window management
- **Focus**: Each request is independent, like using curl

---

## Prompt Management System

### Overview

Swaggbot uses a centralized prompt management system to ensure consistent LLM interactions. All prompts are defined in `PROMPTS.md` and loaded at runtime by the LLM providers.

### Prompt Structure

Prompts are organized into categories based on their purpose:

```
lib/prompts/
├── index.ts                    # Prompt loader and manager
├── system.ts                   # System-level prompts
├── intent.ts                   # Intent classification prompts
├── curl.ts                     # Curl generation prompts
├── workflow.ts                 # Workflow planning prompts
├── extraction.ts               # Data extraction prompts
└── examples.ts                 # Few-shot examples
```

### How Prompts Are Used

#### 1. Prompt Loading

```typescript
// lib/prompts/index.ts
import { readFileSync } from 'fs';
import { join } from 'path';

interface PromptTemplate {
  name: string;
  template: string;
  variables: string[];
  examples?: string[];
}

class PromptManager {
  private prompts: Map<string, PromptTemplate> = new Map();
  
  loadPrompt(name: string): PromptTemplate {
    const promptPath = join(process.cwd(), 'PROMPTS.md');
    // Parse PROMPTS.md and extract prompt by name
    // Implementation reads and parses the markdown file
    return this.parsePromptFromMarkdown(name);
  }
  
  render(template: string, variables: Record<string, any>): string {
    // Simple template substitution
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }
}

export const promptManager = new PromptManager();
```

#### 2. Using Prompts in LLM Providers

**Intent Classification**:
```typescript
// In IntentClassifierService or LLM Provider
async classifyIntent(userMessage: string): Promise<IntentClassification> {
  const prompt = promptManager.loadPrompt('intent-classification');
  
  const renderedPrompt = promptManager.render(prompt.template, {
    userMessage,
    examples: prompt.examples?.join('\n')
  });
  
  const response = await this.llm.complete({
    messages: [
      { role: 'system', content: promptManager.loadPrompt('system-main').template },
      { role: 'user', content: renderedPrompt }
    ],
    temperature: 1
  });
  
  return JSON.parse(response);
}
```

**Curl Generation**:
```typescript
// In CurlGeneratorService
async generateCurl(
  swaggerDoc: string, 
  userMessage: string, 
  authToken?: string
): Promise<CurlGenerationResult> {
  const systemPrompt = promptManager.loadPrompt('system-curl-generation');
  const userPrompt = promptManager.loadPrompt('user-curl-generation');
  
  const messages = [
    {
      role: 'system',
      content: promptManager.render(systemPrompt.template, {
        swaggerDoc,
        authToken: authToken || null
      })
    },
    {
      role: 'user',
      content: promptManager.render(userPrompt.template, {
        userMessage
      })
    }
  ];
  
  const response = await this.llm.complete({
    messages,
    temperature: 1
  });
  
  return this.parseResponse(response);
}
```

**Workflow Planning**:
```typescript
// In WorkflowPlannerService
async planWorkflow(
  swaggerDoc: string, 
  userRequest: string
): Promise<WorkflowStep[]> {
  const prompt = promptManager.loadPrompt('workflow-planning');
  
  const renderedPrompt = promptManager.render(prompt.template, {
    swaggerDoc,
    userMessage: userRequest
  });
  
  const response = await this.llm.complete({
    messages: [
      { role: 'system', content: prompt.template }
    ],
    temperature: 1
  });
  
  return JSON.parse(response).steps;
}
```

### Prompt Customization

Users can customize prompts by editing `PROMPTS.md` or providing custom prompt files:

```typescript
// .env.local
CUSTOM_PROMPTS_PATH=./custom-prompts.md
```

```typescript
// lib/prompts/index.ts
class PromptManager {
  private customPromptsPath?: string;
  
  constructor() {
    this.customPromptsPath = process.env.CUSTOM_PROMPTS_PATH;
  }
  
  loadPrompt(name: string): PromptTemplate {
    // Try custom prompts first
    if (this.customPromptsPath) {
      const custom = this.loadFromFile(this.customPromptsPath, name);
      if (custom) return custom;
    }
    
    // Fall back to default PROMPTS.md
    return this.loadFromFile('./PROMPTS.md', name);
  }
}
```

### Prompt Variables

Standard variables available across prompts:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{userMessage}}` | User's natural language request | `"Create a user named John"` |
| `{{swaggerDoc}}` | Formatted Swagger/OpenAPI doc | JSON string |
| `{{authToken}}` | Current session auth token | `"Bearer eyJ..."` |
| `{{sessionId}}` | Current session UUID | `"550e8400-..."` |
| `{{baseUrl}}` | API base URL | `"https://api.example.com"` |

### Temperature Settings by Use Case

| Task | Temperature | Reason |
|------|-------------|---------|
| Intent Classification | 1 | Consistent, predictable |
| Curl Generation | 1 | Balanced creativity |
| Workflow Planning | 1 | Some creativity needed |
| Data Extraction | 1 | Precise, structured |
| API Info Response | 1 | Natural language |

### Testing Prompts

```typescript
// scripts/test-prompts.ts
import { promptManager } from '../lib/prompts';
import { MoonshotProvider } from '../lib/llm/moonshot';

async function testPrompts() {
  const provider = new MoonshotProvider();
  
  // Test intent classification
  const intentResult = await provider.classifyIntent('Create a user');
  console.log('Intent:', intentResult);
  
  // Test curl generation
  const curlResult = await provider.generateCurl(
    mockSwaggerDoc,
    'List all users'
  );
  console.log('Curl:', curlResult);
  
  // Validate JSON structure
  assertValidJson(curlResult);
}

testPrompts();
```

### Prompt Versioning

When updating `PROMPTS.md`:

1. Update version in header
2. Document changes in PROMPTS.md version history
3. Run prompt tests: `npm run test:prompts`
4. Validate with all supported LLM providers
5. Commit with message: `prompts: update curl generation for foreign key handling`

---

## LLM Provider Architecture

**Design**: Pluggable provider system using Vercel AI SDK

```typescript
// providers/BaseProvider.ts
abstract class BaseLLMProvider {
  abstract name: string;
  abstract generateCurl(swaggerDoc: string, message: string, authToken?: string): Promise<CurlGenerationResult>;
  abstract classifyIntent(message: string): Promise<IntentClassification>;
  abstract planWorkflow(swaggerDoc: string, request: string): Promise<WorkflowStep[]>;
  abstract extractData(response: any, extractionPrompt: string): Promise<Record<string, any>>;
}

// providers/MoonshotProvider.ts
class MoonshotProvider extends BaseLLMProvider {
  name = 'moonshot';
  // Implementation using Moonshot API
}

// providers/OpenAIProvider.ts
class OpenAIProvider extends BaseLLMProvider {
  name = 'openai';
  // Implementation using OpenAI API
}

// providers/AnthropicProvider.ts
class AnthropicProvider extends BaseLLMProvider {
  name = 'anthropic';
  // Implementation using Anthropic API
}

// providers/OllamaProvider.ts (for local models)
class OllamaProvider extends BaseLLMProvider {
  name = 'ollama';
  // Implementation using Ollama local API
}
```

**Configuration**:
```typescript
// .env.local
LLM_PROVIDER=moonshot
MOONSHOT_API_KEY=sk-xxx
MOONSHOT_MODEL=kimi-k2.5

# Optional: OpenAI fallback
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4

# Optional: Anthropic fallback
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_MODEL=claude-3-opus

# Optional: Local model
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

---

## Project Structure

```
swaggbot/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Landing page
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Global styles
│   │
│   ├── (dashboard)/              # Dashboard routes (grouped)
│   │   ├── layout.tsx            # Dashboard layout
│   │   ├── page.tsx              # Dashboard home (session list)
│   │   ├── sessions/
│   │   │   ├── page.tsx          # Session list
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx      # Session detail
│   │   │   │   ├── chat/
│   │   │   │   │   └── page.tsx  # Chat interface
│   │   │   │   └── workflow/
│   │   │   │       └── page.tsx  # Workflow viewer
│   │   │   └── new/
│   │   │       └── page.tsx      # Create session
│   │   └── settings/
│   │       └── page.tsx          # Settings page
│   │
│   └── api/                      # API Routes
│       ├── route.ts              # Health check
│       ├── session/
│       │   ├── route.ts          # POST: create, GET: list
│       │   └── [id]/
│       │       └── route.ts      # GET, PATCH, DELETE
│       ├── chat/
│       │   └── route.ts          # POST: send message
│       └── workflow/
│           ├── route.ts          # POST: create, GET: list
│           └── [id]/
│               ├── route.ts      # GET workflow
│               └── execute/
│                   └── route.ts  # POST execute
│
├── components/                   # React Components
│   ├── ui/                       # shadcn/ui components
│   ├── chat/                     # Chat-related components
│   │   ├── ChatWindow.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── ChatInput.tsx
│   │   └── CurlDisplay.tsx
│   ├── session/                  # Session components
│   │   ├── SessionCard.tsx
│   │   ├── SessionList.tsx
│   │   └── CreateSessionForm.tsx
│   ├── workflow/                 # Workflow components
│   │   ├── WorkflowVisualizer.tsx
│   │   └── WorkflowStep.tsx
│   └── layout/                   # Layout components
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
│
├── lib/                          # Core library code
│   ├── db/                       # Database
│   │   ├── index.ts              # Database connection
│   │   ├── schema.ts             # Drizzle schema
│   │   └── migrations/           # Migration files
│   │
│   ├── mcp/                      # MCP Server
│   │   ├── index.ts              # MCP server setup
│   │   ├── resources.ts          # MCP resources
│   │   ├── tools.ts              # MCP tools
│   │   └── prompts.ts            # MCP prompts
│   │
│   ├── llm/                      # LLM Providers
│   │   ├── index.ts              # Provider factory
│   │   ├── types.ts              # Provider types
│   │   ├── base.ts               # Base provider class
│   │   ├── moonshot.ts           # Moonshot provider
│   │   ├── openai.ts             # OpenAI provider
│   │   ├── anthropic.ts          # Anthropic provider
│   │   └── ollama.ts             # Local model provider
│   │
│   ├── services/                 # Business logic
│   │   ├── session.ts            # Session service
│   │   ├── chat.ts               # Chat service
│   │   ├── workflow.ts           # Workflow service
│   │   ├── swagger.ts            # Swagger parser
│   │   └── curl.ts               # Curl generator
│   │
│   ├── types/                    # TypeScript types
│   │   ├── index.ts              # Main types
│   │   ├── api.ts                # API types
│   │   └── mcp.ts                # MCP types
│   │
│   └── utils/                    # Utilities
│       ├── swagger-formatter.ts  # Swagger doc formatter
│       ├── curl-parser.ts        # Curl command parser
│       └── validators.ts         # Validation helpers
│
├── hooks/                        # Custom React hooks
│   ├── useChat.ts                # Chat state management
│   ├── useSession.ts             # Session operations
│   └── useWorkflow.ts            # Workflow operations
│
├── stores/                       # Zustand stores
│   ├── chatStore.ts              # Chat state
│   └── sessionStore.ts           # Session state
│
├── scripts/                      # Utility scripts
│   └── mcp-server.ts             # Standalone MCP server entry
│
├── public/                       # Static assets
├── tests/                        # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── drizzle.config.ts             # Drizzle ORM config
├── next.config.js                # Next.js config
├── tailwind.config.ts            # Tailwind config
├── tsconfig.json                 # TypeScript config
├── package.json
├── docker-compose.yml            # Docker setup
├── Dockerfile
├── .env.example                  # Environment example
└── README.md
```

---

## Installation & Deployment

### Option 1: Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/swaggbot.git
cd swaggbot

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Edit .env.local with your API keys
# MOONSHOT_API_KEY=sk-your-key

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

### Option 2: Docker (Recommended for Self-Hosting)

```bash
# Clone repository
git clone https://github.com/yourusername/swaggbot.git
cd swaggbot

# Copy and edit environment
cp .env.example .env
# Edit .env with your API keys

# Build and run
docker-compose up -d

# Access at http://localhost:3000
```

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  swaggbot:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=file:/app/data/swaggbot.db
      - LLM_PROVIDER=${LLM_PROVIDER:-moonshot}
      - MOONSHOT_API_KEY=${MOONSHOT_API_KEY}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

---

## MCP Configuration

To use Swaggbot with Claude Desktop or other MCP clients:

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "swaggbot": {
      "command": "npx",
      "args": ["-y", "swaggbot-mcp"],
      "env": {
        "SwaggbOT_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

Or if running locally from source:

```json
{
  "mcpServers": {
    "swaggbot": {
      "command": "node",
      "args": ["/path/to/swaggbot/scripts/mcp-server.ts"],
      "env": {
        "DATABASE_URL": "file:/path/to/swaggbot/data/swaggbot.db",
        "LLM_PROVIDER": "moonshot",
        "MOONSHOT_API_KEY": "sk-your-key"
      }
    }
  }
}
```

### Cursor

Add to Cursor settings:

```json
{
  "mcpServers": {
    "swaggbot": {
      "command": "npx",
      "args": ["-y", "swaggbot-mcp"],
      "env": {
        "SwaggbOT_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

---

## Usage Examples

### Web UI

1. Open http://localhost:3000
2. Click "New Session" and enter a Swagger URL
3. Start chatting with the API

### MCP with Claude Desktop

```
User: Can you help me explore the Petstore API?

Claude: I'll help you explore the Petstore API. Let me create a session first.
[Uses swaggbot_create_session tool]

Great! I've created a session. Now let me see what endpoints are available.
[Uses swaggbot_chat tool with message "list all available endpoints"]

The Petstore API has these main endpoints:
- GET /pet/{petId} - Find pet by ID
- POST /pet - Add a new pet
- GET /pet/findByStatus - Finds pets by status
- ...

What would you like to do with this API?
```

### API Usage

```bash
# Create session
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Petstore API",
    "swaggerUrl": "https://petstore.swagger.io/v2/swagger.json"
  }'

# Chat
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "xxx",
    "message": "Get all available pets"
  }'
```

---

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | SQLite database URL | No | `file:./data/swaggbot.db` |
| `LLM_PROVIDER` | Primary LLM provider | No | `moonshot` |
| `MOONSHOT_API_KEY` | Moonshot API key | If using Moonshot | - |
| `MOONSHOT_MODEL` | Moonshot model | No | `kimi-k2.5` |
| `OPENAI_API_KEY` | OpenAI API key | If using OpenAI | - |
| `OPENAI_MODEL` | OpenAI model | No | `gpt-4` |
| `ANTHROPIC_API_KEY` | Anthropic API key | If using Claude | - |
| `ANTHROPIC_MODEL` | Anthropic model | No | `claude-3-opus` |
| `OLLAMA_BASE_URL` | Ollama server URL | If using local | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama model name | If using local | `llama3.1` |
| `NEXT_PUBLIC_APP_URL` | Public app URL | No | `http://localhost:3000` |
| `LOG_LEVEL` | Logging level | No | `info` |

---

## Database Management

### Automatic Cleanup Strategy

To prevent the database from growing indefinitely, Swaggbot includes automatic cleanup policies:

**Default Cleanup Rules:**
- **Sessions**: Auto-delete after 30 days of inactivity (`lastAccessedAt`)
- **Workflows**: Auto-delete completed/failed workflows after 7 days
- **Workflow Executions**: Auto-delete after workflow deletion
- **Swagger Docs**: Kept indefinitely (small size, needed for session operation)

**Configuration:**
```typescript
// .env.local
CLEANUP_ENABLED=true              # Enable automatic cleanup
SESSION_RETENTION_DAYS=30         # Days before inactive sessions are deleted
WORKFLOW_RETENTION_DAYS=7         # Days before completed workflows are deleted
CLEANUP_SCHEDULE="0 2 * * *"      # Run cleanup daily at 2 AM (cron syntax)
```

**Manual Cleanup:**
```bash
# Delete all sessions older than 30 days
npm run db:cleanup:sessions

# Delete all completed workflows older than 7 days
npm run db:cleanup:workflows

# Vacuum database to reclaim space
npm run db:vacuum

# Full cleanup (runs all cleanup tasks)
npm run db:cleanup
```

**Database Size Monitoring:**
The system monitors database size and logs warnings when approaching limits:
- Warning at 100MB
- Error at 500MB
- Auto-cleanup triggers more aggressively when size > 250MB

### Database Migrations

**Why do we need migrations?**

Migrations provide version control for your database schema. They allow you to:

1. **Schema Evolution**: Update database structure as the app evolves without losing data
2. **Team Collaboration**: All developers work with the same schema version
3. **Production Safety**: Safe, reversible changes in production environments
4. **Rollback Capability**: Undo schema changes if something breaks
5. **CI/CD Integration**: Automated schema updates during deployment

**Example scenario**: You deploy v1.0 with sessions table. Later, you want to add a `lastAccessedAt` column for cleanup. Without migrations, you'd need to manually alter every database. With migrations, it's automatic and safe.

**Migration Workflow:**
```bash
# Generate a new migration after changing schema.ts
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Check migration status
npm run db:status

# Rollback last migration (use with caution)
npm run db:rollback
```

**Migration Files Location:**
```
lib/db/migrations/
├── 0000_initial.sql          # Initial schema
├── 0001_add_cleanup_fields.sql
├── 0002_add_workflow_tables.sql
└── meta/
    └── _journal.json         # Migration history
```

**For New Users:**
- First time setup: `npm run db:migrate` creates the database
- Updates: `npm run db:migrate` applies new migrations automatically

---

## Development Roadmap

### Phase 0: Code Quality & Developer Experience
- [x] Prettier configuration with consistent formatting
- [x] ESLint improvements and strict TypeScript rules
- [x] Pre-commit hooks (Husky + lint-staged)
- [x] Barrel exports for cleaner imports
- [x] Path aliases validation

### Phase 1: Error Handling & Logging (Console Only)
- [x] Global error boundary for React components
- [x] Structured console logging (Pino) - no log files
- [x] API error handling middleware
- [x] User-friendly error messages with retry actions

### Phase 2: UI/UX Polish
- [ ] Loading skeletons and spinners for all async operations
- [ ] Empty states with helpful CTAs
- [ ] Toast notifications for user actions
- [ ] Keyboard shortcuts (⌘+K, ⌘+Enter)
- [ ] Mobile responsiveness improvements

### Phase 3: Workflow API Routes
- [ ] `POST /api/workflow` - Create workflow from natural language
- [ ] `GET /api/workflow` - List all workflows for a session
- [ ] `GET /api/workflow/[id]` - Get workflow details
- [ ] `POST /api/workflow/[id]/execute` - Execute workflow
- [ ] Workflow execution history endpoint

### Phase 4: Session Management UI
- [ ] Session detail page with metadata display
- [ ] Edit session name and description
- [ ] Auth token management UI (view, update, delete)
- [ ] Swagger doc explorer/viewer
- [ ] Session statistics (request count, last used)

### Phase 5: Settings Page (Minimal)
- [ ] LLM provider configuration (API keys, model selection)
- [ ] Database cleanup utilities
- [ ] Application info and version

### Phase 6: Testing Infrastructure
- [ ] Unit tests with Vitest for services and utilities
- [ ] API integration tests for route handlers
- [ ] E2E tests with Playwright for critical user flows
- [ ] Test coverage reporting and thresholds

### Phase 7: Multi-LLM Support (Nice to Have)
- [ ] OpenAI provider implementation
- [ ] Anthropic provider implementation
- [ ] Ollama provider for local models
- [ ] Provider selector in settings

### Phase 8: Workflow Visualizer (Nice to Have)
- [ ] Visual workflow builder
- [ ] Step-by-step execution view
- [ ] Workflow templates

### Phase 9: MCP Server (Future)
- [ ] MCP server implementation for Claude Desktop, Cursor integration

---

## Code Style Guidelines

- **Framework**: Next.js 14+ App Router
- **Components**: React Server Components by default, 'use client' only when needed
- **Styling**: TailwindCSS with shadcn/ui components
- **State**: Zustand for client state, React Query for server state
- **Database**: Drizzle ORM with type-safe queries
- **API**: Route handlers with Zod validation
- **LLM**: Vercel AI SDK for unified LLM interface
- **MCP**: Official MCP SDK with proper resource/tool separation

---

## Security Considerations

- **Local-first**: Designed for single-user, local deployment
- **Auth tokens**: Stored in database, never logged
- **API keys**: Environment variables only, never exposed to client
- **CORS**: Configurable for local development
- **Rate limiting**: Basic protection via middleware (optional)
- **Input validation**: Zod schemas for all inputs
- **SQL injection**: Drizzle ORM prevents injection attacks

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## License

MIT License - see [LICENSE](./LICENSE) file for details.

---

Built with ❤️ for developers who love exploring APIs.
