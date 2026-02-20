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
# Generate SESSION_SECRET and add LLM API keys
docker-compose up -d
```

Open [http://localhost:3003](http://localhost:3003)

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
- 🔐 **Session Management** — Encrypted auth tokens, per-session isolation
- 🌐 **Multi-Provider LLM** — Moonshot, OpenAI, Anthropic, Ollama
- 📊 **Array Filtering** — `[name=John].id` syntax for data extraction
- 🛡️ **Security** — CSP headers, rate limiting, encrypted storage

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
# 1. Clone and configure
git clone https://github.com/techbloom-ai/swaggbot.git
cd swaggbot
cp .env.example .env

# 2. Set SESSION_SECRET (required for auth)
# Linux/macOS:
export SESSION_SECRET=$(openssl rand -base64 32)
# Or add to .env: SESSION_SECRET=your_random_secret_here

# 3. Add your LLM API key to .env
# MOONSHOT_API_KEY=your_key_here

# 4. Start
docker-compose up -d
```

**Database migrations run automatically** on first startup.

### Local Development

```bash
git clone https://github.com/techbloom-ai/swaggbot.git
cd swaggbot
pnpm install
cp .env.example .env.local
# Edit .env.local with SESSION_SECRET and LLM API keys
pnpm db:migrate
pnpm dev
```

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_SECRET` | **Yes** | — | Random secret for session encryption (min 32 chars) |
| `MOONSHOT_API_KEY` | Yes* | — | Moonshot AI API key |
| `OPENAI_API_KEY` | Yes* | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | Yes* | — | Anthropic API key |
| `OLLAMA_BASE_URL` | Yes* | — | Ollama server URL |
| `LLM_PROVIDER` | No | `moonshot` | `moonshot` \| `openai` \| `anthropic` \| `ollama` |
| `DATABASE_URL` | No | `file:./data/swaggbot.db` | SQLite database path |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3003` | App base URL |

\*At least one LLM provider required

### Generate SESSION_SECRET

```bash
# Linux/macOS
openssl rand -base64 32

# Or any random string (min 32 characters)
```

---

## API Reference

### REST API

All endpoints require authentication via session cookie.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Authenticate and create session |
| `/api/session` | POST | Create API session from Swagger URL |
| `/api/session` | GET | List all sessions (paginated) |
| `/api/chat` | POST | Send message to API |
| `/api/workflow` | POST | Create multi-step workflow |
| `/api/workflow/:id/execute` | POST | Execute workflow |

### MCP Server

```json
{
  "mcpServers": {
    "swaggbot": {
      "command": "docker",
      "args": ["compose", "run", "--rm", "swaggbot-mcp"],
      "env": {
        "SESSION_SECRET": "your_secret",
        "MOONSHOT_API_KEY": "your_key"
      }
    }
  }
}
```

---

## Usage Examples

### Web UI

1. Navigate to login page
2. Create a session with your Swagger URL
3. Start chatting:
   ```
   "Create a user named John"
   "List all pets with status available"
   "Execute the login workflow"
   ```

### API

```bash
# Authenticate
curl -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your_password"}' \
  -c cookies.txt

# Chat with API
curl -X POST http://localhost:3003/api/chat \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"sessionId": "...", "message": "List all users"}'
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
| Container | Docker + Docker Compose |

---

## Project Structure

```
swaggbot/
├── app/                 # Next.js App Router
│   ├── api/            # API routes
│   ├── sessions/       # Session UI
│   └── settings/       # Settings page
├── components/         # shadcn/ui components
├── lib/
│   ├── db/            # Database schema & migrations
│   ├── llm/           # LLM provider implementations
│   ├── services/      # Business logic
│   ├── auth/          # Session & encryption
│   └── prompts/       # LLM prompt management
├── scripts/           # MCP server & entrypoint
└── data/              # SQLite storage (Docker volume)
```

---

## Security

- **Local-first**: All data stored locally in SQLite
- **Encrypted tokens**: Auth tokens encrypted with AES-256-GCM
- **Session-based auth**: Password-protected access
- **CSP headers**: Content Security Policy protection
- **Rate limiting**: Per-endpoint limits configurable
- **No telemetry**: Zero analytics or tracking

---

## License

MIT © [TechBloom](LICENSE)
