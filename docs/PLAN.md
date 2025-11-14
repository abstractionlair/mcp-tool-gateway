# MCP Tool Gateway — Project Plan

Status: Active
Last Updated: 2025-11-14

## 🚀 What's Ready Now

**All major features are production-ready:**
- ✅ **Google Gemini** - Fully implemented and tested (Phase 1 complete)
- ✅ **OpenAI** - Fully implemented and tested (Phase 2 complete)
- ✅ **xAI** - Fully implemented and tested (Phase 2 complete)
- ✅ **Python Client Library** - Type-safe client with provider support
- ✅ **TypeScript Client Library** - Full type safety with comprehensive tests
- ✅ **HTTP/SSE Transport** - Support for remote MCP servers
- ✅ **E2E Testing** - All providers validated with real APIs
- ✅ **Multi-Server Configuration** - JSON config with multiple servers
- ✅ **Observability** - Correlation IDs, structured logging, metrics, SSE streaming
- ✅ **Docker Deployment** - Production-ready containerization

**Current focus:** All core features complete. Ready for production use.

## Purpose

**MCP-to-Provider Adapter**: Enable MCP servers to work with AI providers that don't have native MCP support (Gemini, OpenAI, xAI, etc.) by translating MCP tool schemas and execution calls to provider-specific formats.

### The Problem

- **Anthropic/Claude**: Native MCP support via API parameters (the ideal model)
- **Google Gemini**: Uses function calling, requires manual tool schema definitions
- **OpenAI/xAI**: Moving toward MCP support, but currently need tool definitions
- **Other providers**: No MCP support, use various tool/function calling formats

### The Solution

A translation layer that:
1. **Connects to MCP servers** via stdio (using official JS client)
2. **Translates MCP tool schemas** → provider-specific formats (Gemini functions, OpenAI tools, etc.)
3. **Generates tool descriptions** for injection into model context
4. **Executes tool calls** by translating provider-specific invocations → MCP format

## High‑Level Goals

- ✅ **Provider adapters** that translate MCP schemas to Gemini, OpenAI, xAI formats - **COMPLETE**
- ✅ **Execution layer** that handles provider tool calls → MCP tool execution - **COMPLETE**
- ✅ **Gemini support** - **PRODUCTION READY** (full implementation with E2E tests)
- ✅ **OpenAI support** - **PRODUCTION READY** (full JSON Schema support)
- ✅ **xAI support** - **PRODUCTION READY** (complete implementation)
- ✅ **Multi-server support** with clean configuration - **COMPLETE** (Phase 3)
- 🚧 **Context generators** for inserting tool descriptions into prompts - **PLANNED** (Phase 3)

## Roadmap (Phases)

### Phase 0 — Foundation (COMPLETE)
- [x] HTTP API skeleton: /call_tool, /tools, /logs, /health
- [x] Stdio MCP client: connect and list tools
- [x] Tool invocation: call tools (fallback to local dist handler on timeout)
- [x] Baseline tests (Vitest + Supertest): health/tools/call_tool
- [x] README + env variable configuration

**Status**: Basic MCP connection and generic tool execution working. Ready for provider adapter layer.

### Phase 1 — Provider Adapter Architecture (✅ COMPLETE - PRODUCTION READY)
- [x] Design provider adapter interface (`ProviderAdapter`)
- [x] Implement Gemini adapter: MCP schema → Gemini function_declarations
- [x] Implement Gemini execution: function_call → MCP tool call → result
- [x] Add `/tools/gemini?server=...` endpoint (returns Gemini-formatted tools)
- [x] Add `/execute` endpoint (provider-agnostic tool execution)
- [x] Test end-to-end: MCP server → Gateway → Gemini API → execution → response

**Status**: ✅ **PRODUCTION READY** - Complete Gemini integration with 22 unit tests + 5 integration tests. Fully validated with real Gemini API (gemini-2.5-flash). Provider adapter pattern established and ready for additional providers. See PR #2.

**Goal**: Working Gemini integration that mimics Anthropic's native MCP pattern. ✅ **ACHIEVED**

### Phase 1.5 — End-to-End Integration Test (COMPLETE)
- [x] Create simple test MCP server with basic tools (add, multiply, get_weather, store/get_value)
- [x] Build and compile test server to dist
- [x] Create E2E test that calls real Gemini API (gemini-2.5-flash for cost efficiency)
- [x] Test full workflow: get tools → Gemini generates function calls → execute via gateway → return results
- [x] Verify execution via logs
- [x] Add logging functionality to test MCP server
- [x] Fix result parsing to handle MCP content format
- [x] Add instructions for running E2E tests (requires GEMINI_API_KEY)

**Status**: E2E tests complete with comprehensive coverage and all tests passing (2/2). Tests validate full workflow from tool discovery through Gemini API function calling to execution and response. See `node/service/test/gemini-e2e.test.ts` and [docs/E2E_TESTING.md](./E2E_TESTING.md).

**Goal**: Validate the complete workflow with a real AI provider, ensuring the gateway works end-to-end with both stdio MCP servers and HTTP requests to Gemini API.

**Deliverables**:
- ✅ Simple test MCP server in `node/service/test/fixtures/simple-test-server.ts`
- ✅ E2E test file `node/service/test/gemini-e2e.test.ts` using real Gemini API calls
- ✅ Uses `gemini-2.5-flash` model (latest, inexpensive, <$0.01 per test run)
- ✅ Tests verify:
  - Tool discovery via `/tools/gemini`
  - Gemini function calling with retrieved tools
  - Tool execution via `/execute` endpoint
  - MCP content format result parsing
  - Results returned to Gemini
  - Final response generation
  - Log verification showing tool calls were made (8 log entries verified)
  - Multi-step workflows with state management
  - String parameter handling (weather tool)
- ✅ MCP server logging functionality via `MCP_CALL_LOG` environment variable
- ✅ Comprehensive documentation in [docs/E2E_TESTING.md](./E2E_TESTING.md)
- ✅ Secure API key handling with environment variables
- ✅ Tests auto-skip when `GEMINI_API_KEY` not set

**Recent Fixes** (2025-01-12):
- Updated to `gemini-2.5-flash` model (replacing deprecated `gemini-1.5-flash`)
- Fixed duplicate variable declaration (`toolNames` → `loggedToolNames`)
- Enhanced result parsing to extract JSON from MCP content format (`result.content[].text`)
- Implemented logging in test MCP server (reads `MCP_CALL_LOG` env var, writes JSON log entries)
- All tests now passing: 2/2 tests pass, ~3.6 minute runtime

### Phase 1.6 — HTTP Transport Support (COMPLETE)
- [x] Add HTTP/SSE transport support to McpClientManager (in addition to stdio)
- [x] Create HTTP-based test MCP server using MCP SDK's SSEServerTransport
- [x] Update server configuration to support both stdio and HTTP transports
- [x] Create E2E test that connects to MCP server via HTTP instead of stdio
- [x] Test full workflow with HTTP transport: tool discovery → execution → logging
- [x] Document HTTP transport configuration and usage patterns

**Status**: Implementation complete and tested. Both stdio and HTTP/SSE transports are supported; HTTP E2E tests pass with tool discovery, execution, and log verification.

**Goal**: Support multiple MCP transport protocols (stdio and HTTP/SSE) to enable more flexible deployment patterns and better integration with cloud-based MCP servers.

**Deliverables**:
- [x] HTTP transport adapter in McpClientManager (`src/mcpManager.ts:49-76`)
- [x] HTTP-based version of simple-test-server (`test/fixtures/simple-test-server-http.ts`)
- [x] Configuration schema supporting transport type selection (`ServerSpec` interface with `transport` field)
- [x] E2E test validating HTTP transport end-to-end (`test/gemini-http-e2e.test.ts`)
- [x] Documentation for HTTP transport setup and configuration (`docs/HTTP_TRANSPORT.md`)
- [ ] Performance comparison: stdio vs HTTP transport

**Technical Notes**:
- MCP SDK provides `SSEClientTransport` and `SSEServerTransport` (used instead of StreamableHttp*)
- HTTP transport enables remote MCP servers (not just local processes)
- SSE support allows for streaming responses and server-initiated events
- Configuration distinguishes between local (stdio) and remote (HTTP) servers via `transport` field
- ServerSpec interface extended to support both transport types with appropriate required fields

### Phase 2 — Multi-Provider Support (✅ COMPLETE - PRODUCTION READY)
- [x] Implement OpenAI adapter (MCP → OpenAI function format)
- [x] Implement xAI adapter (MCP → xAI tool format)
- [ ] Provider auto-detection from request format *(optional enhancement)*
- [x] Unified `/tools/{provider}` endpoint pattern
- [x] Provider-specific error handling and response formatting

**Status**: ✅ **PRODUCTION READY** - OpenAI and xAI adapters complete with unit, integration, and E2E tests. Full JSON Schema support including constraints. All major providers (Gemini, OpenAI, xAI) are fully implemented and validated.

**Goal**: Support major providers with consistent adapter pattern. ✅ **ACHIEVED**

**Deliverables**:
- ✅ OpenAIAdapter class in `src/adapters/openai.ts`
- ✅ XAIAdapter class in `src/adapters/xai.ts`
- ✅ `/tools/openai` endpoint returning OpenAI-formatted tools
- ✅ `/tools/xai` endpoint returning xAI-formatted tools
- ✅ OpenAI and xAI format support in `/execute` endpoint
- ✅ 30 unit tests in `test/openai-adapter.test.ts`
- ✅ 30 unit tests in `test/xai-adapter.test.ts`
- ✅ 4 integration tests in `test/gateway.test.ts`
- ✅ 2 E2E tests in `test/openai-e2e.test.ts` (requires `OPENAI_API_KEY`)
- ✅ 2 E2E tests in `test/xai-e2e.test.ts` (requires `XAI_API_KEY`)
- ✅ Uses `gpt-4o-mini` and `grok-4-fast` models for cost efficiency
- ✅ Documentation updated in README.md
- ✅ Provider registry pattern established for future adapters

**Technical Notes**:
- OpenAI and xAI use `type: "function"` wrapper around function definitions
- Function arguments come as JSON string that requires parsing
- Supports full JSON Schema including fields not supported by Gemini (`default`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `minItems`, `maxItems`, `additionalProperties`)
- E2E tests validate multi-step workflows with state management

### Phase 3 — Context Generation & Tooling (🚧 IN PROGRESS)
- [x] Context generators: format tool descriptions for prompt injection ✅ **COMPLETE**
- [x] `/tools/{provider}/context` endpoint (human-readable tool descriptions) ✅ **COMPLETE**
- [ ] Schema optimization: concise vs. detailed modes
- [ ] Tool filtering and grouping (by category, importance, etc.)
- [x] Multi-server config: JSON/env to register multiple MCP servers ✅ **COMPLETE**

**Status**: Multi-server configuration is production-ready. Context generation endpoint implemented for all providers (Gemini, OpenAI, xAI) with markdown-formatted output optimized for prompt injection. See [docs/CONFIG.md](./CONFIG.md) for multi-server details.

**Goal**: Rich tool metadata and flexible context generation for different use cases. *(Multi-server and basic context generation achieved)*

### Phase 4 — Client Libraries & DX (✅ COMPLETE)
- [x] Python client with provider-aware methods ✅ **PRODUCTION READY**
- [x] Examples for each provider (Gemini, OpenAI, xAI) - documented in README
- [x] Documentation: setup guides, provider-specific patterns - in README
- [x] TypeScript client with type safety for each provider ✅ **PRODUCTION READY**
- [ ] Testing utilities for MCP server development

**Status**: Both Python and TypeScript client libraries are complete and production-ready. Python client in `python/` directory includes type hints, automatic retries, and full provider support. TypeScript client in `ts/client/` directory provides full type safety, comprehensive tests (22 passing), and identical feature set.

**Goal**: Easy-to-use clients that abstract away provider differences. ✅ **ACHIEVED**

### Phase 5 — Observability & Production (✅ COMPLETE - PRODUCTION READY)
- [x] Correlation IDs: trace request → provider call → MCP execution ✅ **COMPLETE**
- [x] Structured logging with provider context ✅ **COMPLETE**
- [x] `/logs` enhancements: filtering, SSE streaming ✅ **COMPLETE**
- [x] Health checks with per-server status ✅ **COMPLETE**
- [x] Metrics: request counters, latencies, error rates ✅ **COMPLETE**
- [x] Docker deployment + examples ✅ **COMPLETE**

**Status**: ✅ **PRODUCTION READY** - Complete observability infrastructure with correlation IDs, structured logging, metrics collection, SSE log streaming, and Docker deployment. All features tested with 18 new unit tests. See [docs/OBSERVABILITY.md](./OBSERVABILITY.md) for complete documentation.

**Goal**: Production-grade observability and deployment tooling. ✅ **ACHIEVED**

## API Contract

### Provider-Specific Endpoints (NEW - Phase 1)

**GET `/tools/{provider}?server=name`**
- Returns tools in provider-specific format
- Example: `/tools/gemini` returns Gemini function_declarations
- Response format varies by provider:
  - Gemini: `{ function_declarations: [...] }`
  - OpenAI: `{ tools: [{ type: "function", function: {...} }] }`
  - xAI: Similar to OpenAI

**POST `/execute`**
- Execute MCP tool from provider-specific invocation
- Request: `{ provider: string, call: object, server?: string }`
- Translates provider format → MCP → executes → returns in provider format
- Example Gemini request:
  ```json
  {
    "provider": "gemini",
    "call": {
      "name": "query_nodes",
      "args": { "query": "tasks" }
    },
    "server": "default"
  }
  ```

**GET `/tools/{provider}/context?server=name`** ✅ **IMPLEMENTED**
- Returns human-readable tool descriptions for prompt injection
- Optimized for context window efficiency
- Returns plain text (markdown format) with tool names, descriptions, and parameters
- Example response:
  ```
  # Available Tools

  1. **query_nodes**
     Query nodes from the graph
    - query*: string - Search query
    - limit: number - Maximum results

  2. **create_node**
     Create a new node
    - content*: string - Node content

  *Parameters marked with * are required.
  ```

### Generic Endpoints (Foundation - Phase 0)

**POST `/call_tool`** (Legacy, kept for compatibility)
- Request: `{ server: string, tool: string, arguments: object }`
- Response: `{ result: any }`

**GET `/tools?server=name`** (Raw MCP format)
- Response: MCP tool schemas (not provider-specific)

**GET `/logs?server=name&since=iso8601&limit=100&stream=true`**
- Response: `[{ timestamp, tool, input, result?, error? }]`
- With `stream=true`: Server-Sent Events (SSE) for real-time log streaming

**GET `/metrics?since=timestamp`**
- Response: Metrics snapshot with request counts, error rates, and latency percentiles
- Grouped by provider and endpoint
- See [docs/OBSERVABILITY.md](./OBSERVABILITY.md) for details

**GET `/health`**
- Response: `{ ok: true, servers: [{ name, transport, connected }], serverCount, configSource }`

## Configuration

**Primary method (multi-server):**
- JSON config file: `mcp-gateway-config.json` (or path via `MCP_CONFIG_PATH` env var)
- Schema: `{ "servers": { "name": { transport, command, args, env, url, logPath } } }`
- Supports multiple servers with mixed stdio/HTTP transports
- See [docs/CONFIG.md](./CONFIG.md) for complete documentation

**Legacy method (single server, backward compatible):**
- Environment variables:
  - `MCP_SERVER_DIST`: absolute path to MCP server dist entry (index.js)
  - `MCP_BASE_PATH`: data path for server
  - `MCP_LOG_PATH`: path for MCP_CALL_LOG
- Creates a single server named "default"
- Used only when no config file exists

## Testing

- Vitest + Supertest for unit + integration tests
- Requires MCP dist and base/log paths envs for integration tests
- **Current test coverage**:
  - Foundation: health, tools list, query_nodes call, ontology→create_node→query_nodes
  - GeminiAdapter: 26 unit tests (schema translation, sanitization, execution, edge cases, context generation)
  - OpenAIAdapter: 33 unit tests (schema translation, sanitization, execution, edge cases, JSON string parsing, context generation)
  - XAIAdapter: 33 unit tests (schema translation, sanitization, execution, edge cases, JSON string parsing, context generation)
  - ConfigLoader: 18 unit tests (JSON parsing, validation, env vars, transport types, error handling)
  - API endpoints: 18 integration tests (/tools/gemini, /tools/openai, /execute with validation, /context endpoints)
  - Multi-server: 11 integration tests (multiple servers, mixed transports, health endpoint, server routing)
  - E2E tests: Gemini (2 tests), OpenAI (2 tests), xAI (2 tests), Ollama (1 test), HTTP transport (2 tests)
- **Observability**: 18 unit tests (correlation IDs, metrics, logging, SSE streaming)
- **Total**: 157 unit/integration tests passing, 9 E2E tests (with API keys)
- **Coverage**: All core features, providers, transports, and observability

## Architecture

### Core Components

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
│  │  • OpenAIAdapter: MCP ↔ OpenAI functions        │   │
│  │  • xAIAdapter: MCP ↔ xAI tools                  │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │         MCP Client Manager                       │   │
│  │  • Connect to MCP servers via stdio             │   │
│  │  • List tools, call tools, read logs            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↕
              stdio transport (Node spawns process)
                          ↕
┌─────────────────────────────────────────────────────────┐
│                    MCP Servers                           │
│         (filesystem, simple-test, etc.)                 │
└─────────────────────────────────────────────────────────┘
```

### Provider Adapter Interface

```typescript
interface ProviderAdapter {
  name: string  // "gemini", "openai", "xai"

  // Translate MCP tool schema → provider format
  translateSchema(mcpTool: MCPTool): ProviderToolSchema

  // Translate all tools for this provider
  translateAllTools(mcpTools: MCPTool[]): ProviderToolsResponse

  // Translate provider invocation → MCP format
  translateInvocation(providerCall: any): MCPToolCall

  // Format result in provider-expected format
  formatResult(mcpResult: any): ProviderResult

  // Generate human-readable context (Phase 3)
  formatForContext(tools: MCPTool[]): string
}
```

### Design Principles

- **Anthropic's MCP as the model**: Replicate the native MCP experience for providers without it
- **Provider-agnostic core**: MCP client layer knows nothing about providers
- **Adapter pattern**: Each provider gets a dedicated translator
- **Preserve MCP semantics**: Tool schemas, execution, errors stay true to MCP
- **No provider SDKs**: Gateway doesn't call provider APIs, only translates formats

## Usage Example (Gemini)

```python
from mcp_tool_gateway import GatewayClient
import google.generativeai as genai

# 1. Initialize gateway client
gateway = GatewayClient("http://localhost:8787")

# 2. Get tools in Gemini format
tools = gateway.get_tools("gemini", server="default")

# 3. Create Gemini model with tools
model = genai.GenerativeModel('gemini-1.5-pro', tools=tools)

# 4. Generate content
response = model.generate_content("What tasks do I have?")

# 5. If model calls a function, execute via gateway
if response.candidates[0].content.parts[0].function_call:
    fc = response.candidates[0].content.parts[0].function_call
    result = gateway.execute("gemini", fc, server="default")

    # 6. Send result back to Gemini
    response = model.generate_content([
        response.candidates[0].content,
        {"role": "function", "parts": [{
            "function_response": {"name": fc.name, "response": result}
        }]}
    ])

print(response.text)
```

## Backlog

### Completed
1. ✅ **Design ProviderAdapter interface** - Core abstraction for all providers
2. ✅ **Implement GeminiAdapter** - First concrete adapter (MCP → Gemini function_declarations)
3. ✅ **Implement OpenAIAdapter** - Second adapter with full JSON Schema support
4. ✅ **Implement XAIAdapter** - Third adapter with full JSON Schema support
5. ✅ **Add `/tools/gemini` endpoint** - Return Gemini-formatted tools
6. ✅ **Add `/tools/openai` endpoint** - Return OpenAI-formatted tools
7. ✅ **Add `/tools/xai` endpoint** - Return xAI-formatted tools
8. ✅ **Add `/execute` endpoint** - Provider-agnostic execution with translation
9. ✅ **End-to-end tests** - Integration tests for full workflow (Gemini, OpenAI, xAI)
10. ✅ **Provider registry** - Extensible pattern for adding new providers

### Up Next
1. **Provider auto-detection** - Detect provider from request format
2. **Multi-server config** - Support multiple MCP servers in parallel
3. **Enhanced error handling** - Provider-specific error formatting
