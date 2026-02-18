# Swaggbot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/techbloom-ai/swaggbot?style=social)](https://github.com/techbloom-ai/swaggbot)

> Transform Swagger/OpenAPI docs into conversational interfaces. Self-hosted, local-first, AI-powered API exploration.

---

## Quick Start

```bash
# Docker (recommended)
git clone https://github.com/techbloom-ai/swaggbot.git
cd swaggbot && cp .env.example .env  
# Edit .env with your API keys
docker-compose up -d
```

Open [http://localhost:3000](http://localhost:3000) → Paste Swagger URL → Start chatting.

---

## What is Swaggbot?

Swaggbot converts any Swagger/OpenAPI documented API into a conversational interface. Built for developers who want to:

- **Explore APIs naturally** — Chat instead of reading raw JSON
- **Automate workflows** — Multi-step operations with data extraction
- **Stay in control** — Self-hosted, data stays local
- **Integrate anywhere** — Web UI, MCP server, or direct API

---

## Features

- 🤖 **Natural Language API Interaction** — "List all users" → `GET /users`
- 🔄 **Workflow Automation** — Chain multiple API calls with dependency resolution
- 🔌 **MCP Server** — Use with Claude Desktop, Cursor, Windsurf
- 🏠 **Self-Hosted** — Your data, your infrastructure
- 🔐 **Auth Token Extraction** — Automatic session management
- 🌐 **Multi-Provider LLM** — Moonshot, OpenAI, Anthropic, Ollama
- 📊 **Array Filtering** — `[name=John].id` syntax for data extraction

---

## Architecture

```
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Web UI  │  │  MCP    │  │  API    │
│ Next.js │  │ Server  │  │ Clients │
└────┬────┘  └────┬────┘  └────┬────┘
     └─────────────┼─────────────┘
                   ▼
          ┌─────────────────┐
          │  Chat Service   │  Intent Classification
          │  + LLM Provider │  → Curl Generation → Execution
          └─────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌────────┐   ┌─────────┐   ┌──────────┐
│SQLite  │   │Workflow │   │ Target   │
│(Local) │   │ Engine  │   │   API    │
└────────┘   └─────────┘   └──────────┘
```

---

## Installation

### Prerequisites

- Node.js 18+ **or** Docker
- LLM API key (Moonshot, OpenAI, Anthropic, or Ollama)

### Docker (Recommended)

```bash
docker run -d \
  -p 3000:3000 \
  -e MOONSHOT_API_KEY=your_key \
  -v swaggbot-data:/app/data \
  swaggbot/swaggbot:latest
```

### Local Development

```bash
git clone https://github.com/techbloom-ai/swaggbot.git
cd swaggbot
pnpm install
cp .env.example .env.local
# Edit .env.local with your API keys
pnpm db:migrate
pnpm dev
```

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MOONSHOT_API_KEY` | Yes* | — | Moonshot AI API key |
| `OPENAI_API_KEY` | Yes* | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | Yes* | — | Anthropic API key |
| `OLLAMA_BASE_URL` | Yes* | — | Ollama server URL |
| `LLM_PROVIDER` | No | `moonshot` | `moonshot` \| `openai` \| `anthropic` \| `ollama` |
| `DATABASE_URL` | No | `file:./data/swaggbot.db` | SQLite database path |
| `CLEANUP_ENABLED` | No | `true` | Auto-cleanup old sessions |

\*At least one LLM provider required

---

## API Reference

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/session` | POST | Create session from Swagger URL |
| `/api/chat` | POST | Send message to API |
| `/api/workflow` | POST | Create multi-step workflow |

[Full API Documentation →](https://www.swaggbot.com/wiki/guides/api)

### MCP Server

```json
{
  "mcpServers": {
    "swaggbot": {
      "command": "npx",
      "args": ["-y", "swaggbot-mcp"],
      "env": { "SWAGGBOT_API_URL": "http://localhost:3000" }
    }
  }
}
```

[MCP Integration Guide →](https://www.swaggbot.com/wiki/guides/mcp)

---

## Usage Examples

### Web UI
```text
User: Create a user named John with email john@example.com
Swaggbot: [POST /users] Created user ID 123
```

### API
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "...", "message": "List all pets"}'
```

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | SQLite (libSQL/Turso) |
| ORM | Drizzle ORM |
| UI | shadcn/ui + TailwindCSS 4 |
| State | Zustand |
| LLM SDK | Vercel AI SDK patterns |
| MCP | Model Context Protocol SDK |
| Testing | Vitest |
| Container | Docker |

---

## Project Structure

```
swaggbot/
├── app/              # Next.js App Router
├── components/       # shadcn/ui components
├── lib/
│   ├── db/          # Database schema & client
│   ├── llm/         # LLM provider implementations
│   ├── services/    # Business logic
│   └── prompts/     # LLM prompt management
├── scripts/         # MCP server
└── data/            # SQLite storage
```

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md).

### Development Setup

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

### Running Tests

```bash
pnpm test
pnpm test:coverage
```

---

## Security

- **Local-first**: All data stored locally in SQLite
- **No data retention**: Swaggbot doesn't persist API responses
- **Secure token storage**: Auth tokens encrypted at rest
- **No telemetry**: Zero analytics or tracking

---

## License

MIT © [TechBloom](LICENSE)
