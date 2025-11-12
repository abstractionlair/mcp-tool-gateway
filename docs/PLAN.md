# MCP Tool Gateway — Project Plan

Status: Active
Last Updated: 2025-11-12

## Purpose

A generic, provider‑agnostic gateway that connects to MCP servers (via the official JS client over stdio) and exposes a small HTTP API for:
- Calling tools: POST /call_tool
- Listing tools + JSON Schemas: GET /tools
- Reading logs: GET /logs
- Health checks: GET /health

Clients (Python + TypeScript) provide a simple call_tool/tools/logs interface.

## High‑Level Goals

- Self‑contained, well‑tested Node service with clear configuration
- High‑quality tool metadata (JSON Schemas) from MCP servers
- Robust transport (stdio client), with optional local fallback or HTTP/SSE proxy
- First‑class Python and TS clients
- Easy local development and examples

## Roadmap (Phases)

### Phase 1 — Solid Baseline (Current)
- [x] HTTP API skeleton: /call_tool, /tools, /logs, /health
- [x] Stdio MCP client: connect and list tools
- [x] Tool invocation: call tools (fallback to local dist handler on timeout)
- [x] Baseline tests (Vitest + Supertest): health/tools/call_tool
- [x] README + env variable configuration

### Phase 2 — Transport + Tool Metadata
- [ ] Make stdio MCP path primary for tools/call (tune timeouts, no fallback in happy path)
- [ ] Normalize /tools output: { tools: [{ name, description, inputSchema, outputSchema? }] }
- [ ] Zod→JSON Schema capture: cache tool schemas from listTools; expose them consistently
- [ ] Multi‑server config: JSON/env to register several servers (names, command, args, env, logs)
- [ ] Correlation IDs: inject IDs for tracing request → tool calls → logs

### Phase 3 — Observability + DX
- [ ] /logs enhancements: since/limit filters (present), add SSE stream option
- [ ] Metrics: basic request counters/timers (optional)
- [ ] Dockerfile + example docker‑compose for local MCP server
- [ ] Examples: curl + Python + TS scripts calling the gateway

### Phase 4 — Clients & Packaging
- [ ] Python client: publish to PyPI (mcp-tool-gateway)
- [ ] TS client: publish to npm (@mcp-tool-gateway/client)
- [ ] Versioning + CHANGELOG
- [ ] CI: lint, test, build, publish packages

### Phase 5 — Optional Transports / Provider Fast Paths
- [ ] SSE proxy to support provider “remote MCP tools” (xAI/Anthropic) as an optional mode
- [ ] Auth hooks (token passthrough or basic API key) for hosted setups

## API Contract (initial)

- POST /call_tool
  - Request: { server: string, tool: string | canonical (mcp__server__tool), arguments: object }
  - Response: { result: any, correlation_id?: string }
  - Errors: { error: { code, message, details? } }

- GET /tools?server=name
  - Response: { tools: [{ name, description, inputSchema, outputSchema? }] }

- GET /logs?server=name&since=iso8601&limit=100
  - Response: [ { timestamp, tool, input, result?, error? } ]

- GET /health
  - Response: { ok: true, servers: [{ name, status }] }

## Configuration

- Env (current, single server):
  - GTD_GRAPH_DIST: absolute path to MCP server dist entry (index.js)
  - GTD_GRAPH_BASE_PATH: data path for server
  - GTD_GRAPH_LOG_PATH: path for MCP_CALL_LOG
- Next: multi‑server JSON config (path), override via env

## Testing

- Vitest + Supertest for unit + integration
- Requires MCP dist and base/log paths envs for integration tests
- Current tests: health, tools list, query_nodes call; ontology→create_node→query_nodes
- Add: log retrieval assertions; schema presence for key tools

## Architecture Notes

- Stdio client is the primary transport; gateway may fallback to direct handler for local dev speed
- Keep endpoints stable and small
- No provider SDKs in this repo; gateway is provider‑agnostic
- Preserve ground‑truth logging from MCP server

## Backlog (Prioritized)

1. Make stdio callTool primary; local fallback only on SDK error/timeout (configurable)
2. Normalize /tools shape and include schemas consistently
3. Multi‑server config and /health servers list
4. SSE logs endpoint and structured correlation IDs
5. Clients: retries/timeouts/error objects; publish packages
6. Dockerfile + compose; examples directory
7. CI (GitHub Actions): lint/test/build, optional release jobs

## Agent Workstreams

- Transport & Observability: stdio tuning, logs, correlation IDs, metrics
- Tool Metadata: listTools normalization, schema quality, discovery cache
- Clients: Python & TS packages with robust error handling and docs
- DX & Ops: Docker, examples, CI, release workflows

