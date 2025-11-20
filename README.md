# MCP Tool Gateway

**Problem:** MCP servers can't talk to AI providers without native MCP support (Gemini, OpenAI, xAI).

**Solution:** HTTP gateway that translates MCP tool schemas and execution calls to provider-specific formats. Connects to MCP servers via stdio or HTTP/SSE, exposes HTTP endpoints for tool discovery and execution.

Status: All major providers work. Gemini, OpenAI, xAI fully tested with E2E validation. Python and TypeScript client libraries available.

## Architecture

```
AI Provider (Gemini/OpenAI/xAI)
    ↓
Your Code
    ↓ HTTP (tool discovery + execution)
Gateway Service (this repo)
    ↓ MCP protocol (stdio/HTTP)
MCP Server(s)
```

**Key components:**
- Provider adapters: Translate MCP schemas ↔ provider formats
- HTTP API: Tool discovery (`/tools/{provider}`) and execution (`/execute`)
- MCP client: Official JS client for stdio/HTTP transport
- Multi-server config: Connect to multiple MCP servers, mix transports

**Design constraint:** Provider-agnostic execution. The gateway doesn't know about provider-specific calling conventions - it accepts provider formats and translates to MCP.

## Quick Start

### 1. Configure MCP Server

Create `mcp-gateway-config.json`:

```json
{
  "servers": {
    "default": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "BASE_PATH": "/data"
      }
    }
  }
}
```

Or use environment variables (legacy single-server mode):
```bash
export MCP_SERVER_DIST=/path/to/mcp-server/dist/index.js
export MCP_BASE_PATH=/data
```

### 2. Run Gateway

```bash
cd node/service
npm install
npm run dev
```

Gateway runs on `http://localhost:8787`.

### 3. Test

```bash
# Health check
curl http://localhost:8787/health

# Get tools in Gemini format
curl 'http://localhost:8787/tools/gemini?server=default'

# Execute a tool
curl -X POST http://localhost:8787/execute \
  -H 'Content-Type: application/json' \
  -d '{"provider":"gemini","call":{"name":"add","args":{"a":1,"b":2}},"server":"default"}'
```

## HTTP API

All endpoints accept `?server=<name>` to target specific MCP servers from your config.

**Tool Discovery:**
- `GET /tools/gemini?server=...` → Gemini `function_declarations` format
- `GET /tools/openai?server=...` → OpenAI `tools` format
- `GET /tools/xai?server=...` → xAI `tools` format
- `GET /tools?server=...` → Raw MCP tool schemas

**Execution:**
- `POST /execute` → Execute via provider-specific format
- `POST /call_tool` → Execute via generic MCP format

**Monitoring:**
- `GET /health` → Service health + server status
- `GET /logs?server=...&since=...&limit=...` → Recent executions

## Provider Examples

### Gemini

Gemini uses `function_declarations` for tools and returns `function_call` objects.

```python
import google.generativeai as genai
import requests

gateway = "http://localhost:8787"

# Get tools
tools = requests.get(f"{gateway}/tools/gemini?server=default").json()

# Create model with tools
model = genai.GenerativeModel('gemini-1.5-pro', tools=tools['function_declarations'])
chat = model.start_chat()

# Send message
response = chat.send_message("What tasks do I have?")

# Check for function call
if response.candidates[0].content.parts[0].function_call:
    fc = response.candidates[0].content.parts[0].function_call
    
    # Execute via gateway (Gemini format: "args" is object)
    result = requests.post(f"{gateway}/execute", json={
        "provider": "gemini",
        "call": {"name": fc.name, "args": dict(fc.args)},
        "server": "default"
    }).json()["result"]
    
    # Send result back
    response = chat.send_message({
        "role": "function",
        "parts": [{"function_response": {"name": fc.name, "response": result}}]
    })

print(response.text)
```

### OpenAI

OpenAI uses `tools` array for schemas and returns `tool_calls` with JSON string arguments.

```python
import openai
import requests

gateway = "http://localhost:8787"

# Get tools
tools = requests.get(f"{gateway}/tools/openai?server=default").json()["tools"]

# Create client
client = openai.OpenAI(api_key="your_key")

# Send message with tools
messages = [{"role": "user", "content": "What is 15 plus 27?"}]
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=messages,
    tools=tools,
    tool_choice="auto"
)

# Check for tool calls
message = response.choices[0].message
if message.tool_calls:
    for tc in message.tool_calls:
        # Execute via gateway (OpenAI format: "arguments" is JSON string)
        result = requests.post(f"{gateway}/execute", json={
            "provider": "openai",
            "call": {"name": tc.function.name, "arguments": tc.function.arguments},
            "server": "default"
        }).json()["result"]
        
        # Add to conversation
        messages.append(message)
        messages.append({
            "role": "tool",
            "tool_call_id": tc.id,
            "content": str(result)
        })
    
    # Get final response
    final = client.chat.completions.create(model="gpt-4o-mini", messages=messages)
    print(final.choices[0].message.content)
```

### xAI (Grok)

xAI follows OpenAI's format (JSON string arguments).

```python
import requests

gateway = "http://localhost:8787"

# Get tools
tools = requests.get(f"{gateway}/tools/xai?server=default").json()["tools"]

# Call xAI API (similar to OpenAI)
response = requests.post("https://api.x.ai/v1/chat/completions", 
    headers={"Authorization": f"Bearer {xai_key}"},
    json={
        "model": "grok-beta",
        "messages": [{"role": "user", "content": "Add 5 and 7"}],
        "tools": tools
    }
)

# Execute tool calls via gateway
if response.json()["choices"][0]["message"].get("tool_calls"):
    for tc in response.json()["choices"][0]["message"]["tool_calls"]:
        result = requests.post(f"{gateway}/execute", json={
            "provider": "xai",
            "call": {"name": tc["function"]["name"], "arguments": tc["function"]["arguments"]},
            "server": "default"
        }).json()["result"]
```

**Key difference:** Gemini uses `args` (object), OpenAI/xAI use `arguments` (JSON string).

## Client Libraries

### Python

Install from `python/` directory:

```bash
pip install ./python
```

Usage:

```python
from mcp_tool_gateway import MCPToolGatewayClient

client = MCPToolGatewayClient("http://localhost:8787")

# Get tools for a provider
tools = client.get_tools("gemini", server="default")

# Execute a tool
result = client.execute(
    "gemini",
    {"name": "add", "args": {"a": 1, "b": 2}},
    server="default"
)

# Health check
status = client.health()

# Get logs
logs = client.get_logs(server="default", since="2025-01-14T00:00:00Z", limit=100)
```

Features: Automatic retries, type hints, provider format validation.

See [python/README.md](python/README.md) for full API.

### TypeScript

Install from `ts/client/`:

```bash
npm install @mcp-tool-gateway/client
```

Usage:

```typescript
import { MCPToolGatewayClient } from '@mcp-tool-gateway/client';

const client = new MCPToolGatewayClient('http://localhost:8787');

// Get tools for a provider
const tools = await client.getTools('gemini', 'default');

// Execute a tool
const result = await client.execute(
  'gemini',
  { name: 'add', args: { a: 1, b: 2 } },
  'default'
);

// Health check
const status = await client.health();

// Get logs
const logs = await client.logs('default', '2025-01-14T00:00:00Z', 100);
```

Features: Full type safety, automatic retries, provider format validation.

See [ts/client/README.md](ts/client/README.md) for full API.

## Configuration

### JSON Config (Multiple Servers)

Create `mcp-gateway-config.json`:

```json
{
  "servers": {
    "filesystem": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server-filesystem/dist/index.js"],
      "env": {
        "BASE_PATH": "/home/user/data"
      }
    },
    "weather": {
      "transport": "http",
      "url": "http://localhost:3001/sse"
    }
  }
}
```

**stdio transport:**
- `transport`: "stdio"
- `command`: Executable path
- `args`: Command arguments
- `env`: Environment variables (optional)

**HTTP/SSE transport:**
- `transport`: "http"
- `url`: SSE endpoint URL

### Environment Variables (Legacy)

For single-server mode:

```bash
export MCP_SERVER_DIST=/path/to/server/dist/index.js
export MCP_BASE_PATH=/data
export MCP_LOG_PATH=/data/mcp-calls.log
```

Creates a server named "default".

**Migration:** Use JSON config for multiple servers or new deployments. Env vars maintained for backward compatibility.

See [docs/CONFIG.md](docs/CONFIG.md) for schema validation, troubleshooting, and migration guide.

## Testing

### Run All Tests

```bash
cd node/service
npm ci
npm test  # E2E tests auto-skip without API keys
```

### Unit + Integration Only

```bash
npm run test:unit  # No E2E, no API keys needed
```

### E2E Tests

**Gemini:**
```bash
export GEMINI_API_KEY=your_key
npm test -- gemini-e2e.test.ts
```

**OpenAI:**
```bash
export OPENAI_API_KEY=your_key
npm test -- openai-e2e.test.ts
```

**xAI:**
```bash
export XAI_API_KEY=your_key
npm test -- xai-e2e.test.ts
```

**HTTP Transport:**
```bash
export GEMINI_API_KEY=your_key
npm test -- gemini-http-e2e.test.ts
```

**Ollama (Local, No Keys):**
```bash
npm test -- ollama-local-e2e.test.ts
```

**Notes:**
- Tests auto-read `.env` file at repo root
- Test fixture MCP server built automatically
- E2E tests skipped if API keys missing

### Test Coverage

**Unit tests:**
- Gemini adapter: 21 tests (schema translation, parameter handling, sanitization)
- OpenAI adapter: 30 tests (schema translation, JSON Schema fields, argument parsing)
- xAI adapter: Full coverage

**Integration tests (13 tests in `gateway.test.ts`):**
- HTTP endpoints: `/health`, `/tools`, `/tools/{provider}`, `/execute`
- Multi-step workflows: ontology → node creation → queries
- Request validation and error handling

**E2E tests:**
- Gemini: Tool discovery → function call → execution → response
- OpenAI: Tool discovery → tool call → execution → response
- xAI: Tool discovery → tool call → execution → response
- HTTP transport: Remote MCP server over HTTP/SSE
- Ollama: Local LLM workflow without external APIs

See [docs/E2E_TESTING.md](docs/E2E_TESTING.md) for detailed E2E setup.

## Development

### Local Setup

```bash
cd node/service
npm install
npm run dev  # Development mode with hot reload
# or
npm run build && npm start  # Production build
```

### Project Structure

```
node/service/
  src/
    adapters/           # Provider-specific translators
      gemini.ts
      openai.ts
      xai.ts
    gateway.ts          # Core HTTP server + MCP client
    index.ts            # Entry point
  tests/
    unit/               # Adapter unit tests
    integration/        # Gateway integration tests
    e2e/                # End-to-end tests
  fixtures/
    test-server/        # Test MCP server
python/                 # Python client library
ts/client/              # TypeScript client library
docs/                   # Documentation
```

### Key Files

- `gateway.ts`: HTTP server, MCP client connection, endpoint handlers
- `adapters/*.ts`: Schema translation logic for each provider
- `mcp-gateway-config.json`: Server configuration (not in repo)
- `.env`: API keys for E2E tests (gitignored)

## Documentation

- [docs/PLAN.md](docs/PLAN.md) - Roadmap, priorities, API contracts
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design, component interactions
- [docs/CONFIG.md](docs/CONFIG.md) - Configuration schema, examples, troubleshooting
- [docs/HTTP_TRANSPORT.md](docs/HTTP_TRANSPORT.md) - Remote MCP server setup
- [docs/E2E_TESTING.md](docs/E2E_TESTING.md) - E2E test details
- [python/README.md](python/README.md) - Python client API reference
- [ts/client/README.md](ts/client/README.md) - TypeScript client API reference
- [AGENTS.md](AGENTS.md) - Agent specialization areas

## Limitations

- stdio transport: Local MCP servers only (spawned as child processes)
- HTTP transport: Requires SSE-compatible MCP server
- Provider formats: Gemini uses object args, OpenAI/xAI use JSON string args
- Schema translation: Some JSON Schema fields unsupported by Gemini (stripped automatically)
- No built-in rate limiting (implement at client level if needed)

## Notes

xAI now has direct MCP support in some contexts. This gateway remains useful for:
- Providers without native MCP (Gemini, older OpenAI)
- Multi-provider applications using same MCP servers
- HTTP gateway pattern for remote MCP servers
- Client libraries with automatic retries and provider abstraction
