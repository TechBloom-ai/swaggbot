# SwagBot

Transform Swagger/OpenAPI documentation into conversational interfaces. SwagBot is an open-source, self-hosted tool that lets you explore and interact with APIs through natural language chat.

**Philosophy**: Local-first, single-user, simple to deploy. If you have access to a Swagger doc, you can explore and interact with that API naturally through chat.

## Features

- **Conversational API Exploration** - Chat with any Swagger/OpenAPI documented API using natural language
- **Web UI** - Beautiful, intuitive interface built with Next.js and shadcn/ui
- **MCP Server** - Integrate with Claude Desktop, Cursor, and other MCP-compatible AI assistants
- **Workflow Automation** - Plan and execute multi-step API workflows
- **Multi-LLM Support** - Works with OpenAI, Anthropic, Moonshot, and local models via Ollama
- **Self-Hosted** - Your data stays local, complete control over your environment

## Quick Start

### Prerequisites

- Node.js 18+ or Docker
- API key for your chosen LLM provider (OpenAI, Anthropic, or Moonshot)

### Option 1: Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/swagbot.git
cd swagbot

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Setup database
npm run db:migrate

# Start development server
npm run dev
```

### Option 2: Docker (Recommended)

```bash
git clone https://github.com/yourusername/swagbot.git
cd swagbot

cp .env.example .env
# Edit .env with your API keys

docker-compose up -d
```

Access the web UI at http://localhost:3000

## Usage

### Web UI

1. Open http://localhost:3000
2. Click "New Session" and enter your Swagger/OpenAPI URL
   - **Important**: Use the JSON spec URL, not the Swagger UI page
   - ✅ Good: `https://api.example.com/swagger.json` or `https://api.example.com/openapi.json`
   - ❌ Bad: `https://api.example.com/swagger-ui.html` (the HTML interface)
3. Start chatting with the API naturally

Example:
```
You: "List all users"
SwagBot: "I'll fetch all users for you. [Executes GET /users] Here are the results..."
```

### MCP with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "swagbot": {
      "command": "npx",
      "args": ["-y", "swagbot-mcp"],
      "env": {
        "SWAGBOT_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

Then in Claude:
```
You: Help me explore the Petstore API
Claude: I'll create a SwagBot session for the Petstore API and help you explore it...
```

### API Usage

```bash
# Create a session
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Petstore API",
    "swaggerUrl": "https://petstore.swagger.io/v2/swagger.json"
  }'

# Chat with the API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "message": "Get all available pets"
  }'
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | SQLite database path | No (default: `file:./data/swagbot.db`) |
| `LLM_PROVIDER` | Provider: `openai`, `anthropic`, `moonshot`, `ollama` | No (default: `moonshot`) |
| `OPENAI_API_KEY` | OpenAI API key | If using OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic API key | If using Claude |
| `MOONSHOT_API_KEY` | Moonshot API key | If using Moonshot |
| `OLLAMA_BASE_URL` | Ollama server URL | If using local models |

See `.env.example` for all available options.

## Architecture

SwagBot is built with a modern, modular architecture:

- **Next.js 14+** - Full-stack framework with App Router
- **libSQL (Turso)** - SQLite-compatible database, edge-ready
- **Drizzle ORM** - Type-safe database operations
- **Vercel AI SDK** - Universal LLM interface
- **MCP SDK** - Model Context Protocol implementation
- **TailwindCSS + shadcn/ui** - Modern, accessible UI

```
┌─────────────────────────────────────────┐
│           Next.js Application           │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐  │
│  │  Web UI  │ │  API     │ │  MCP    │  │
│  │          │ │  Routes  │ │  Server │  │
│  └────┬─────┘ └────┬─────┘ └────┬────┘  │
│       └─────────────┴────────────┘       │
│              Core Services               │
│         (LLM, Parser, Workflow)          │
│                   │                      │
│              SQLite (libSQL)             │
└─────────────────────────────────────────┘
```

## Project Structure

```
swagbot/
├── app/                 # Next.js App Router
│   ├── (dashboard)/     # Dashboard UI routes
│   └── api/             # API routes
├── components/          # React components
├── lib/                 # Core library
│   ├── db/             # Database schema & migrations
│   ├── llm/            # LLM providers
│   ├── mcp/            # MCP server
│   └── services/       # Business logic
├── hooks/              # React hooks
└── stores/             # Zustand stores
```

## Development

```bash
# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start development server
npm run dev

# Run tests
npm run test

# Build for production
npm run build
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## Security

- **Local-first**: Designed for single-user, local deployment
- **No data retention**: Chat history is not persisted
- **Secure storage**: Auth tokens and API keys stored safely
- **Input validation**: All inputs validated with Zod schemas

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

Built with ❤️ for developers who love exploring APIs.
