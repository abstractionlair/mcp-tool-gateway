# MCP Tool Gateway

**MCP-to-Provider Adapter**: Enable MCP servers to work with AI providers that don't have native MCP support (Gemini, OpenAI, xAI, etc.) by translating MCP tool schemas and execution calls to provider-specific formats.

[NOTE: I think xAI now does have direct MCP support.]

Connects to MCP servers via the official JS client over stdio or HTTP and exposes HTTP endpoints for tool discovery, execution, and logging.

## 🚀 Production Ready

**All major providers are fully supported and production-ready:**

- ✅ **Google Gemini** - Complete with comprehensive tests and E2E validation
- ✅ **OpenAI** (GPT-4, GPT-3.5, etc.) - Full JSON Schema support
- ✅ **xAI** (Grok models) - Complete implementation
- ✅ **Python Client Library** - Type-safe client with automatic retries
- ✅ **TypeScript Client Library** - Full type safety with comprehensive tests

Use any MCP server with these providers today! See usage examples below.

## Features

- **Provider Adapters**: Translate MCP tool schemas to provider-specific formats
  - ✅ Gemini (function_declarations)
  - ✅ OpenAI (function format)
  - ✅ xAI (tool format)

- **HTTP API Endpoints**:
  - GET `/tools/gemini?server=...` → Tools in Gemini function_declarations format
  - GET `/tools/openai?server=...` → Tools in OpenAI tools format
  - GET `/tools/xai?server=...` → Tools in xAI tools format
  - POST `/execute` → Execute tools via provider-specific format
  - GET `/tools?server=...` → Raw MCP tool schemas
  - POST `/call_tool` → Execute MCP tools (generic format)
  - GET `/logs?server=...&since=...&limit=...` → Recent MCP execution logs
  - GET `/health` → Service health status

- **Clients**:
  - ✅ Python: `mcp_tool_gateway` (installed from `python/` directory)
  - ✅ TypeScript: `@mcp-tool-gateway/client` (available in `ts/client/`)

- **Transport Support**:
  - ✅ stdio (local MCP servers)
  - ✅ HTTP/SSE (remote MCP servers)

- **Multi-Server Configuration**:
  - ✅ JSON configuration file support
  - ✅ Connect to multiple MCP servers simultaneously
  - ✅ Mix stdio and HTTP transports
  - ✅ Per-server environment variables and logging
  - ✅ Health monitoring for all configured servers

## Status

All core functionality is complete and tested:
- ✅ **Foundation** - MCP connection, tool execution, logging
- ✅ **Provider Adapters** - Gemini, OpenAI, and xAI fully implemented
- ✅ **Multi-Server Support** - JSON configuration with multiple servers
- ✅ **E2E Testing** - Validated with real provider APIs
- ✅ **Python Client** - Production-ready client library
- ✅ **TypeScript Client** - Production-ready with full type safety

## Test Quickstart

Quick steps to run tests from `node/service`.

Setup (first time):

```
cd node/service
npm ci
```

Common:

```
# All tests (E2E auto-skip if no keys)
npm test

# Unit + integration only (no E2E)
npm run test:unit
```

E2E options:

```
# Gemini E2E (uses gemini-2.5-flash)
export GEMINI_API_KEY=your_key
npm test -- gemini-e2e.test.ts

# OpenAI E2E (uses gpt-4o-mini)
export OPENAI_API_KEY=your_key
npm test -- openai-e2e.test.ts

# xAI E2E (uses grok-4-fast)
export XAI_API_KEY=your_key
npm test -- xai-e2e.test.ts

# HTTP transport E2E (Gemini + HTTP/SSE MCP server)
export GEMINI_API_KEY=your_key
npm test -- gemini-http-e2e.test.ts

# Local E2E with Ollama (no API keys)
# Ensure Ollama is installed; test may auto-start `ollama serve` locally
npm test -- ollama-local-e2e.test.ts
```

Tips:
- Tests auto-read API keys from a `.env` at the repo root if present.
- `npm test` builds the test MCP server fixture automatically.

## Using with Gemini

The gateway translates MCP tool schemas to Gemini's `function_declarations` format, allowing you to use any MCP server with Gemini models.

### Quick Example

```python
import google.generativeai as genai
import requests

gateway_url = "http://localhost:8787"

# 1. Get tools in Gemini format from the gateway
response = requests.get(f"{gateway_url}/tools/gemini?server=default")
tools = response.json()

# 2. Create Gemini model with MCP tools
model = genai.GenerativeModel('gemini-1.5-pro', tools=tools['function_declarations'])
chat = model.start_chat()

# 3. Send a message that requires tool use
response = chat.send_message("What tasks do I have?")

# 4. Check if Gemini wants to call a function
if response.candidates[0].content.parts[0].function_call:
    function_call = response.candidates[0].content.parts[0].function_call

    # 5. Execute via gateway
    result = requests.post(f"{gateway_url}/execute", json={
        "provider": "gemini",
        "call": {
            "name": function_call.name,
            "args": dict(function_call.args)
        },
        "server": "default"
    }).json()["result"]

    # 6. Send result back to Gemini
    response = chat.send_message({
        "role": "function",
        "parts": [{
            "function_response": {
                "name": function_call.name,
                "response": result
            }
        }]
    })

print(response.text)
```

### How It Works

1. **Tool Discovery**: `GET /tools/gemini` returns tools in Gemini's expected format
2. **Conversation**: Send messages to Gemini, which may trigger function calls
3. **Tool Execution**: When Gemini calls a function, use `POST /execute` with provider-specific format
4. **Response Loop**: Send execution results back to Gemini to complete the request

Example of the response format:

```bash
$ curl 'http://localhost:8787/tools/gemini?server=default'
{
  "function_declarations": [
    {
      "name": "query_nodes",
      "description": "Query nodes from the graph memory",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Search query"
          }
        },
        "required": ["query"]
      }
    }
  ]
}
```

See [docs/PLAN.md](docs/PLAN.md) for the full usage pattern with function calling, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a system overview.

## Using with OpenAI

The gateway translates MCP tool schemas to OpenAI's `tools` format, allowing you to use any MCP server with OpenAI models (GPT-4, GPT-3.5, etc.).

### Quick Example

```python
import openai
import requests

gateway_url = "http://localhost:8787"

# 1. Get tools in OpenAI format from the gateway
response = requests.get(f"{gateway_url}/tools/openai?server=default")
tools = response.json()["tools"]

# 2. Create OpenAI client
client = openai.OpenAI(api_key="your_api_key")

# 3. Send a message with available tools
messages = [{"role": "user", "content": "What is 15 plus 27?"}]

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=messages,
    tools=tools,
    tool_choice="auto"
)

# 4. Check if OpenAI wants to call a function
message = response.choices[0].message
if message.tool_calls:
    for tool_call in message.tool_calls:
        # 5. Execute via gateway
        result = requests.post(f"{gateway_url}/execute", json={
            "provider": "openai",
            "call": {
                "name": tool_call.function.name,
                "arguments": tool_call.function.arguments  # JSON string
            },
            "server": "default"
        }).json()["result"]

        # 6. Add tool response to conversation
        messages.append(message)
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": str(result)
        })

    # 7. Get final response
    final_response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages
    )

    print(final_response.choices[0].message.content)
```

### How It Works

1. **Tool Discovery**: `GET /tools/openai` returns tools in OpenAI's expected format
2. **Conversation**: Send messages to OpenAI, which may trigger tool calls
3. **Tool Execution**: When OpenAI calls a tool, use `POST /execute` with provider-specific format
4. **Response Loop**: Send execution results back to OpenAI to complete the request

Example of the response format:

```bash
$ curl 'http://localhost:8787/tools/openai?server=default'
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "add",
        "description": "Add two numbers",
        "parameters": {
          "type": "object",
          "properties": {
            "a": {
              "type": "number",
              "description": "First number"
            },
            "b": {
              "type": "number",
              "description": "Second number"
            }
          },
          "required": ["a", "b"]
        }
      }
    }
  ]
}
```

## Using the Python Client

The Python client library provides a clean, typed interface to the gateway with automatic retries and error handling.

### Installation

```bash
# From the repository root
cd python
pip install -e .
```

### Quick Example (Gemini)

```python
from mcp_tool_gateway import GatewayClient
import google.generativeai as genai

# Initialize client
gateway = GatewayClient("http://localhost:8787")

# Get tools in Gemini format
tools = gateway.get_tools("gemini", server="default")

# Create Gemini model with tools
model = genai.GenerativeModel('gemini-1.5-pro', tools=tools['function_declarations'])
chat = model.start_chat()

# Send message
response = chat.send_message("What tasks do I have?")

# Handle function calls
if response.candidates[0].content.parts[0].function_call:
    fc = response.candidates[0].content.parts[0].function_call

    # Execute via gateway (much cleaner than raw HTTP!)
    result = gateway.execute("gemini", {
        "name": fc.name,
        "args": dict(fc.args)
    }, server="default")

    # Send result back to Gemini
    response = chat.send_message({
        "role": "function",
        "parts": [{
            "function_response": {
                "name": fc.name,
                "response": result
            }
        }]
    })

print(response.text)
```

### Quick Example (OpenAI)

```python
from mcp_tool_gateway import GatewayClient
import openai

# Initialize client with custom retry settings
gateway = GatewayClient(
    "http://localhost:8787",
    timeout=30.0,
    max_retries=5
)

# Get tools in OpenAI format
tools = gateway.get_tools("openai", server="default")

# Create OpenAI client and send message
client = openai.OpenAI()
messages = [{"role": "user", "content": "What is 15 plus 27?"}]

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=messages,
    tools=tools["tools"]
)

# Handle tool calls
message = response.choices[0].message
if message.tool_calls:
    for tool_call in message.tool_calls:
        # Execute via gateway
        result = gateway.execute("openai", {
            "name": tool_call.function.name,
            "arguments": tool_call.function.arguments
        })

        # Add to conversation
        messages.append(message)
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": str(result)
        })

    # Get final response
    final = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages
    )
    print(final.choices[0].message.content)
```

### Client Features

- **Provider-specific methods**: `get_tools(provider, server)` and `execute(provider, call, server)`
- **Automatic retries**: Configurable retry logic with exponential backoff for transient failures
- **Type hints**: Full type annotations for better IDE support
- **Error handling**: Clear error messages from gateway responses
- **Legacy support**: `call_tool()`, `tools()`, `logs()`, and `health()` methods still available

### API Reference

```python
# Initialize client
client = GatewayClient(
    base_url="http://localhost:8787",
    timeout=60.0,          # Request timeout in seconds
    max_retries=3,         # Maximum retry attempts
    retry_delay=1.0,       # Initial retry delay
    retry_backoff=2.0      # Exponential backoff multiplier
)

# Get tools in provider-specific format
tools = client.get_tools(
    provider="gemini",     # "gemini", "openai", or "xai"
    server="default"       # Optional server name
)

# Execute tool call
result = client.execute(
    provider="gemini",     # "gemini", "openai", or "xai"
    call={                 # Provider-specific format
        "name": "add",
        "args": {"a": 1, "b": 2}  # Gemini uses "args" (object)
        # "arguments": '{"a": 1, "b": 2}'  # OpenAI/xAI use "arguments" (JSON string)
    },
    server="default"       # Optional server name
)

# Check health
status = client.health()

# Get logs
logs = client.logs(
    server="default",
    since="2025-01-14T00:00:00Z",  # Optional ISO 8601 timestamp
    limit=100
)
```

## Using the TypeScript Client

The TypeScript client library provides a type-safe interface to the gateway with automatic retries, comprehensive error handling, and full TypeScript support.

### Installation

```bash
# From the repository
cd ts/client
npm install
npm run build

# Or install in your project (after publishing)
npm install @mcp-tool-gateway/client
```

### Quick Example (Gemini)

```typescript
import { GatewayClient } from '@mcp-tool-gateway/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize client
const gateway = new GatewayClient({ baseUrl: 'http://localhost:8787' });

// Get tools in Gemini format
const tools = await gateway.getTools('gemini', 'default');

// Create Gemini model with tools
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash-exp',
  tools: tools.function_declarations
});

// Start chat
const chat = model.startChat();
let response = await chat.sendMessage('What tasks do I have?');

// Handle function calls
while (response.functionCalls()?.length > 0) {
  const functionCalls = response.functionCalls()!;

  // Execute each function call via the gateway
  const functionResponses = await Promise.all(
    functionCalls.map(async (fc) => {
      const result = await gateway.execute('gemini', {
        name: fc.name,
        args: fc.args
      }, 'default');

      return { name: fc.name, response: result };
    })
  );

  // Send results back to the model
  response = await chat.sendMessage(
    functionResponses.map(fr => ({ functionResponse: fr }))
  );
}

console.log(response.text());
```

### Quick Example (OpenAI)

```typescript
import { GatewayClient } from '@mcp-tool-gateway/client';
import OpenAI from 'openai';

// Initialize client with custom retry settings
const gateway = new GatewayClient({
  baseUrl: 'http://localhost:8787',
  timeoutMs: 30000,
  maxRetries: 5
});

// Get tools in OpenAI format
const tools = await gateway.getTools('openai', 'default');

// Create OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Send message with tools
let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: 'user', content: 'What is 15 plus 27?' }
];

let response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  tools: tools.tools
});

// Handle tool calls
while (response.choices[0].finish_reason === 'tool_calls') {
  const message = response.choices[0].message;
  messages.push(message);

  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      const result = await gateway.execute('openai', {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments
      }, 'default');

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }

    response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: tools.tools
    });
  }
}

console.log(response.choices[0].message.content);
```

### Client Features

- **Type safety**: Full TypeScript support with detailed type definitions
- **Provider support**: `'gemini' | 'openai' | 'xai'` with type-safe provider selection
- **Automatic retries**: Configurable retry logic with exponential backoff
- **Error handling**: Comprehensive error handling with timeout support
- **Well documented**: JSDoc comments and usage examples
- **Tested**: 22 unit tests with full coverage

### API Reference

```typescript
// Initialize client
const client = new GatewayClient({
  baseUrl: 'http://localhost:8787',
  timeoutMs: 60000,       // Request timeout in milliseconds
  maxRetries: 3,          // Maximum retry attempts
  retryDelayMs: 1000,     // Initial retry delay
  retryBackoff: 2.0       // Exponential backoff multiplier
});

// Get tools in provider-specific format
const tools = await client.getTools(
  'gemini',               // 'gemini' | 'openai' | 'xai'
  'default'               // Optional server name
);

// Execute tool call
const result = await client.execute(
  'gemini',               // 'gemini' | 'openai' | 'xai'
  {                       // Provider-specific format
    name: 'add',
    args: { a: 1, b: 2 }  // Gemini uses "args" (object)
    // arguments: '{"a": 1, "b": 2}'  // OpenAI/xAI use "arguments" (JSON string)
  },
  'default'               // Optional server name
);

// Check health
const status = await client.health();

// Get logs
const logs = await client.logs(
  'default',
  '2025-01-14T00:00:00Z', // Optional ISO 8601 timestamp
  100
);
```

**📖 For complete TypeScript client documentation, see [ts/client/README.md](ts/client/README.md)**

## Configuration

The gateway supports multiple MCP servers through a JSON configuration file or environment variables (legacy single-server mode).

### Quick Configuration Examples

**JSON Config (Multiple Servers):**

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

**Environment Variables (Single Server - Legacy):**

```bash
export MCP_SERVER_DIST=/path/to/mcp/server/dist/index.js
export MCP_BASE_PATH=/data
export MCP_LOG_PATH=/data/mcp-calls.log
```

This creates a single server named "default".

**📖 For complete configuration documentation, see [docs/CONFIG.md](docs/CONFIG.md)**

Topics covered:
- JSON configuration schema and validation
- stdio transport (local servers)
- HTTP/SSE transport (remote servers)
- Environment variables and logging
- Migration guide from env vars
- Multiple server examples
- Troubleshooting

## Local Development

1) Configure a target MCP server (stdio)

**Option A: JSON config file (recommended for multiple servers)**

See [Configuration](#configuration) section above.

**Option B: Environment variables (single server)**

```
export MCP_SERVER_DIST=/absolute/path/to/your/mcp/server/dist/index.js
export MCP_BASE_PATH=/absolute/path/to/data/dir
export MCP_LOG_PATH=/absolute/path/to/data/dir/mcp-calls.log
```

2) Install and run the service

```
cd node/service
npm install
npm run dev  # or npm run start after build
```

3) Call the endpoints

```bash
# Health check
curl 'http://localhost:8787/health'

# Get tools in raw MCP format
curl 'http://localhost:8787/tools?server=default'

# Get tools in Gemini format
curl 'http://localhost:8787/tools/gemini?server=default'

# Get tools in OpenAI format
curl 'http://localhost:8787/tools/openai?server=default'

# Execute a tool (generic MCP format)
curl -X POST 'http://localhost:8787/call_tool' \
  -H 'Content-Type: application/json' \
  -d '{"server":"default","tool":"add","arguments":{"a":1,"b":2}}'

# Execute a tool (provider-specific format - Gemini)
curl -X POST 'http://localhost:8787/execute' \
  -H 'Content-Type: application/json' \
  -d '{"provider":"gemini","call":{"name":"add","args":{"a":1,"b":2}},"server":"default"}'

# Execute a tool (provider-specific format - OpenAI)
curl -X POST 'http://localhost:8787/execute' \
  -H 'Content-Type: application/json' \
  -d '{"provider":"openai","call":{"name":"add","arguments":"{\"a\":1,\"b\":2}"},"server":"default"}'
```

Notes:
- The service uses the official MCP JS client over stdio to connect/spawn.
- `/logs` tails the file specified by `MCP_LOG_PATH`.
- Multiple servers will be supported by adding more specs; initial scaffold wires one.

## Testing

The project includes a comprehensive test suite with unit, integration, and end-to-end (E2E) tests.

### Unit and Integration Tests

These tests validate the gateway's internal logic without making any external API calls. The test suite includes:

**Unit Tests**:
- Gemini adapter (21 tests in `gemini-adapter.test.ts`):
  - Schema translation: MCP tool schemas → Gemini `function_declarations` format
  - Parameter handling: nested objects, arrays, enums, required fields
  - Sanitization: removal of unsupported fields (`default`, `oneOf`, `maximum`)
  - Invocation translation: Gemini function calls → MCP format with validation
  - Edge cases: missing fields, invalid inputs, empty schemas

- OpenAI adapter (30 tests in `openai-adapter.test.ts`):
  - Schema translation: MCP tool schemas → OpenAI `tools` format
  - Parameter handling: nested objects, arrays, enums, required fields, constraints
  - Support for additional JSON Schema fields (`default`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `additionalProperties`)
  - Invocation translation: OpenAI function calls (JSON string arguments) → MCP format
  - Edge cases: invalid JSON arguments, missing fields, empty schemas

**Integration Tests (13 tests in `gateway.test.ts`)**:
- HTTP endpoint functionality: `/health`, `/tools`, `/tools/gemini`, `/tools/openai`, `/execute`
- Provider adapter integration with live MCP connections (Gemini and OpenAI)
- Request validation and error handling
- Multi-step workflows: ontology creation → node creation → queries
- OpenAI-specific: JSON string and object argument handling

Integration prerequisites:

- Integration tests run against a local MCP server via the MCP JS client. Set these environment variables (same as in Local Development) so the test suite can spawn/connect to the server:

```
export MCP_SERVER_DIST=/absolute/path/to/your/mcp/server/dist/index.js
export MCP_BASE_PATH=/absolute/path/to/data/dir
export MCP_LOG_PATH=/absolute/path/to/data/dir/mcp-calls.log  # optional but recommended
```

Run all tests:
```bash
cd node/service
npm test
```

Or run only unit/integration tests (excludes E2E):
```bash
npm run test:unit
```

Run only integration tests:
```bash
cd node/service
vitest run gateway.test.ts
```

### End-to-End Tests

E2E tests validate the complete workflow from tool discovery to execution with a live LLM. See [docs/E2E_TESTING.md](docs/E2E_TESTING.md) for detailed instructions.

#### With Ollama (Local LLM)

This is the recommended E2E test for most development. It uses a local Ollama instance to simulate the full AI workflow without needing API keys or an internet connection.

**Quick start:**
```bash
# Make sure Ollama is running
cd node/service
npm test -- ollama-local-e2e.test.ts
```

#### With Google Gemini (API-based)

This test validates the workflow with real API calls to the Google Gemini API.

**Quick start:**

```bash
cd node/service

# Set your Gemini API key (get one at https://makersuite.google.com/app/apikey)
export GEMINI_API_KEY="your_api_key_here"

# Run E2E tests
npm run test:e2e
```

**Security note:** Never commit API keys. The `.env` file is gitignored for local development.

If `GEMINI_API_KEY` is not set, the Gemini E2E tests are automatically skipped.

#### With OpenAI (API-based)

This test validates the workflow with real API calls to the OpenAI API.

**Quick start:**

```bash
cd node/service

# Set your OpenAI API key (get one at https://platform.openai.com/api-keys)
export OPENAI_API_KEY="your_api_key_here"

# Run OpenAI E2E tests
npm test -- openai-e2e.test.ts
```

**Security note:** Never commit API keys. The `.env` file is gitignored for local development.

If `OPENAI_API_KEY` is not set, the OpenAI E2E tests are automatically skipped.

#### With HTTP Transport

This test validates the gateway's HTTP/SSE transport support for remote MCP server connections.

**Quick start:**
```bash
cd node/service

# Set your Gemini API key
export GEMINI_API_KEY="your_api_key_here"

# Run HTTP transport E2E test
npm test -- gemini-http-e2e.test.ts
```

See [docs/HTTP_TRANSPORT.md](docs/HTTP_TRANSPORT.md) for configuration details and use cases.

## Project Plan

See docs/PLAN.md for the full roadmap, priorities, and API contract.

Agent details and areas for specialization are in AGENTS.md.
