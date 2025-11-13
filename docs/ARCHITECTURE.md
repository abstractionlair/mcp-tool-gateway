# MCP Tool Gateway — Architecture

Status: Active

## Overview

The gateway bridges MCP servers to AI providers that lack native MCP support by:
- Connecting to MCP servers (stdio by default; HTTP/SSE optional)
- Translating MCP tool schemas to provider formats (e.g., Gemini function_declarations)
- Executing provider function calls via MCP tools
- Preserving ground‑truth execution logs

```
┌─────────────────────────────────────────────────────────┐
│                    AI Provider API                       │
│              (Gemini, OpenAI, xAI, etc.)                │
└─────────────────────────────────────────────────────────┘
                          ↕
              1. Get tools in provider format
              2. Receive tool call from model
              3. Send execution result back
                          ↕
┌─────────────────────────────────────────────────────────┐
│              MCP Tool Gateway (This Project)             │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Provider Adapters Layer                  │   │
│  │  • GeminiAdapter: MCP ↔ function_declarations   │   │
│  │  • OpenAI/xAI adapters (planned)                │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │           MCP Client Manager                     │   │
│  │  • Connect: stdio or HTTP/SSE                   │   │
│  │  • List/Call tools, read logs                   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↕
                stdio or HTTP/SSE transport
                          ↕
┌─────────────────────────────────────────────────────────┐
│                       MCP Servers                        │
│         (filesystem, simple-test, etc.)                 │
└─────────────────────────────────────────────────────────┘
```

## Components

- HTTP Service (`node/service/src/server.ts`)
  - Endpoints: `/tools`, `/tools/gemini`, `/call_tool`, `/execute`, `/logs`, `/health`
  - Provider adapter registry (Gemini implemented)
- MCP Client Manager (`node/service/src/mcpManager.ts`)
  - Manages connections to MCP servers via stdio or HTTP/SSE
  - Lists tools, calls tools, reads append‑only logs
- Provider Adapters (`node/service/src/adapters/*`)
  - Translate MCP tool schemas ↔ provider formats
  - Translate provider invocation → MCP call
  - Format results for provider response shape

## Data Flow

1) Tool discovery
- Client calls `GET /tools/{provider}?server=...`
- Gateway lists MCP tools and adapter translates to provider format

2) Function/tool call execution
- Model issues provider‑specific call (e.g., Gemini `{ name, args }`)
- Client posts to `POST /execute` with `{ provider, call, server }`
- Gateway translates to MCP call and executes via MCP client
- Result is formatted for the provider and returned

3) Generic compatibility
- `POST /call_tool` and `GET /tools` provide raw MCP semantics for generic usage

## Endpoints

- `GET /tools/{provider}?server=...` → provider‑specific tool schemas
- `POST /execute` → execute provider call via MCP
- `GET /tools?server=...` → raw MCP tool schemas
- `POST /call_tool` → generic MCP execution
- `GET /logs?server=...&since=...&limit=...` → ground‑truth call logs
- `GET /health` → service health

## Transports and ServerSpec

- Transports: `stdio` (default) and `http` (HTTP/SSE)
- `ServerSpec` (see `mcpManager.ts`):
  - Common: `name`, `transport?`, `logPath?`
  - Stdio: `command`, `args[]`, `env{}` (e.g., `BASE_PATH`, `MCP_CALL_LOG`)
  - HTTP: `url` (SSE endpoint)

Environment variables (current single‑server bootstrap):
- `MCP_SERVER_DIST` → MCP dist entry (index.js)
- `MCP_BASE_PATH` → data directory for server
- `MCP_LOG_PATH` → append‑only JSON log path (optional but recommended)

## Logging & Observability

- Preserve ground‑truth logging from MCP servers via `MCP_CALL_LOG`
- `/logs` reads and returns recent entries; intended for debugging/verification
- Roadmap includes correlation IDs, structured logs, metrics, and SSE log streaming

## Design Principles

- Provider‑agnostic core; adapters encapsulate provider specifics
- Preserve MCP semantics (schemas, execution, errors)
- Minimal, stable endpoints for easy adoption
- No provider SDK calls from the gateway itself; only format translation

## Related Docs

- Project Plan: `docs/PLAN.md`
- HTTP Transport: `docs/HTTP_TRANSPORT.md`
- E2E Testing: `docs/E2E_TESTING.md`
