# MCP Tool Gateway — Project Plan

Status: Active
Last Updated: 2025-11-13

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

- **Provider adapters** that translate MCP schemas to Gemini, OpenAI, xAI formats
- **Execution layer** that handles provider tool calls → MCP tool execution
- **Context generators** for inserting tool descriptions into prompts
- **Multi-server support** with clean configuration
- **Gemini as priority** (Anthropic already has native MCP)

## Roadmap (Phases)

### Phase 0 — Foundation (COMPLETE)
- [x] HTTP API skeleton: /call_tool, /tools, /logs, /health
- [x] Stdio MCP client: connect and list tools
- [x] Tool invocation: call tools (fallback to local dist handler on timeout)
- [x] Baseline tests (Vitest + Supertest): health/tools/call_tool
- [x] README + env variable configuration

**Status**: Basic MCP connection and generic tool execution working. Ready for provider adapter layer.

### Phase 1 — Provider Adapter Architecture (COMPLETE)
- [x] Design provider adapter interface (`ProviderAdapter`)
- [x] Implement Gemini adapter: MCP schema → Gemini function_declarations
- [x] Implement Gemini execution: function_call → MCP tool call → result
- [x] Add `/tools/gemini?server=...` endpoint (returns Gemini-formatted tools)
- [x] Add `/execute` endpoint (provider-agnostic tool execution)
- [x] Test end-to-end: MCP server → Gateway → Gemini API → execution → response

**Status**: Complete Gemini integration with 22 unit tests + 5 integration tests. Provider adapter pattern established and ready for additional providers. See PR #2.

**Goal**: Working Gemini integration that mimics Anthropic's native MCP pattern.

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

### Phase 2 — Multi-Provider Support (IN PROGRESS)
- [x] Implement OpenAI adapter (MCP → OpenAI function format)
- [ ] Implement xAI adapter (MCP → xAI tool format)
- [ ] Provider auto-detection from request format
- [x] Unified `/tools/{provider}` endpoint pattern
- [x] Provider-specific error handling and response formatting

**Status**: OpenAI adapter complete with 30 unit tests, 4 integration tests, and 2 E2E tests. Full JSON Schema support including constraints (`minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `additionalProperties`). See PR #[TBD].

**Goal**: Support major providers with consistent adapter pattern.

**Deliverables**:
- ✅ OpenAIAdapter class in `src/adapters/openai.ts`
- ✅ `/tools/openai` endpoint returning OpenAI-formatted tools
- ✅ OpenAI format support in `/execute` endpoint
- ✅ 30 unit tests in `test/openai-adapter.test.ts`
- ✅ 4 integration tests in `test/gateway.test.ts`
- ✅ 2 E2E tests in `test/openai-e2e.test.ts` (requires `OPENAI_API_KEY`)
- ✅ Uses `gpt-4o-mini` model for cost efficiency
- ✅ Documentation updated in README.md
- ✅ Provider registry pattern established for future adapters

**Technical Notes**:
- OpenAI uses `type: "function"` wrapper around function definitions
- Function arguments come as JSON string that requires parsing
- Supports full JSON Schema including fields not supported by Gemini (`default`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `minItems`, `maxItems`, `additionalProperties`)
- E2E tests validate multi-step workflows with state management

### Phase 3 — Context Generation & Tooling
- [ ] Context generators: format tool descriptions for prompt injection
- [ ] `/tools/{provider}/context` endpoint (human-readable tool descriptions)
- [ ] Schema optimization: concise vs. detailed modes
- [ ] Tool filtering and grouping (by category, importance, etc.)
- [ ] Multi-server config: JSON/env to register multiple MCP servers

**Goal**: Rich tool metadata and flexible context generation for different use cases.

### Phase 4 — Client Libraries & DX
- [ ] Python client with provider-aware methods
- [ ] TypeScript client with type safety for each provider
- [ ] Examples for each provider (Gemini, OpenAI, xAI)
- [ ] Documentation: setup guides, provider-specific patterns
- [ ] Testing utilities for MCP server development

**Goal**: Easy-to-use clients that abstract away provider differences.

### Phase 5 — Observability & Production
- [ ] Correlation IDs: trace request → provider call → MCP execution
- [ ] Structured logging with provider context
- [ ] `/logs` enhancements: filtering, SSE streaming
- [ ] Health checks with per-server status
- [ ] Metrics: request counters, latencies, error rates
- [ ] Docker deployment + examples

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

**GET `/tools/{provider}/context?server=name`** (Phase 3)
- Returns human-readable tool descriptions for prompt injection
- Optimized for context window efficiency

### Generic Endpoints (Foundation - Phase 0)

**POST `/call_tool`** (Legacy, kept for compatibility)
- Request: `{ server: string, tool: string, arguments: object }`
- Response: `{ result: any }`

**GET `/tools?server=name`** (Raw MCP format)
- Response: MCP tool schemas (not provider-specific)

**GET `/logs?server=name&since=iso8601&limit=100`**
- Response: `[{ timestamp, tool, input, result?, error? }]`

**GET `/health`**
- Response: `{ ok: true, servers: [{ name, status }] }`

## Configuration

- Env (current, single server):
  - MCP_SERVER_DIST: absolute path to MCP server dist entry (index.js)
  - MCP_BASE_PATH: data path for server
  - MCP_LOG_PATH: path for MCP_CALL_LOG
- Next: multi‑server JSON config (path), override via env

## Testing

- Vitest + Supertest for unit + integration tests
- Requires MCP dist and base/log paths envs for integration tests
- **Current test coverage**:
  - Foundation: health, tools list, query_nodes call, ontology→create_node→query_nodes
  - GeminiAdapter: 21 unit tests (schema translation, sanitization, execution, edge cases)
  - OpenAIAdapter: 30 unit tests (schema translation, sanitization, execution, edge cases, JSON string parsing)
  - API endpoints: 13 integration tests (/tools/gemini, /tools/openai, /execute with validation)
  - E2E tests: Gemini (2 tests), OpenAI (2 tests), Ollama (1 test), HTTP transport (2 tests)
- **Total**: 64 unit/integration tests passing, 7 E2E tests (with API keys)
- **Next**: add `/logs` assertions to unit/integration tests (E2E already verifies logs); xAI adapter tests

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

### Completed (Phase 1 & Phase 2 - OpenAI)
1. ✅ **Design ProviderAdapter interface** - Core abstraction for all providers
2. ✅ **Implement GeminiAdapter** - First concrete adapter (MCP → Gemini function_declarations)
3. ✅ **Implement OpenAIAdapter** - Second adapter with full JSON Schema support
4. ✅ **Add `/tools/gemini` endpoint** - Return Gemini-formatted tools
5. ✅ **Add `/tools/openai` endpoint** - Return OpenAI-formatted tools
6. ✅ **Add `/execute` endpoint** - Provider-agnostic execution with translation
7. ✅ **End-to-end tests** - Integration tests for full workflow (Gemini + OpenAI)
8. ✅ **Provider registry** - Extensible pattern for adding new providers

### Up Next (Phase 2 - xAI)
1. **Implement xAI adapter** - Support for xAI tools (similar to OpenAI format)
2. **Provider auto-detection** - Detect provider from request format
3. **Multi-server config** - Support multiple MCP servers in parallel
4. **Enhanced error handling** - Provider-specific error formatting
