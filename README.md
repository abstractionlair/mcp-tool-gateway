# MCP Tool Gateway

**MCP-to-Provider Adapter**: Enable MCP servers to work with AI providers that don't have native MCP support (Gemini, OpenAI, xAI, etc.) by translating MCP tool schemas and execution calls to provider-specific formats.

Connects to MCP servers via the official JS client over stdio and exposes HTTP endpoints for tool discovery, execution, and logging.

## Features

- **Provider Adapters**: Translate MCP tool schemas to provider-specific formats
  - ✅ Gemini (function_declarations)
  - 🔜 OpenAI (function format)
  - 🔜 xAI (tool format)

- **HTTP API Endpoints**:
  - GET `/tools/gemini?server=...` → Tools in Gemini function_declarations format
  - POST `/execute` → Execute tools via provider-specific format
  - GET `/tools?server=...` → Raw MCP tool schemas
  - POST `/call_tool` → Execute MCP tools (generic format)
  - GET `/logs?server=...&since=...&limit=...` → Recent MCP execution logs
  - GET `/health` → Service health status

- **Clients** (coming soon):
  - Python: `mcp_tool_gateway`
  - TypeScript: `@mcp-tool-gateway/client`

## Status

**Phase 0 (Foundation)**: ✅ Complete - Basic MCP connection and tool execution working
**Phase 1 (Provider Adapters)**: 🚧 In Progress - Gemini adapter complete

## Using with Gemini

The gateway translates MCP tool schemas to Gemini's `function_declarations` format, allowing you to use any MCP server with Gemini models.

### Quick Example

```python
import google.generativeai as genai
import requests

gateway_url = "http://localhost:8787"

# 1. Get tools in Gemini format from the gateway
response = requests.get(f"{gateway_url}/tools/gemini?server=gtd-graph-memory")
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
        "server": "gtd-graph-memory"
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
$ curl 'http://localhost:8787/tools/gemini?server=gtd-graph-memory'
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

See [docs/PLAN.md](docs/PLAN.md) for the full usage pattern with function calling.

## Local Development

1) Configure a target MCP server (example: graph-memory stdio server)

Set environment variables so the gateway can spawn/connect:

```
export GTD_GRAPH_DIST=/absolute/path/to/your/project/src/graph-memory-core/mcp/dist/index.js
export GTD_GRAPH_BASE_PATH=/absolute/path/to/data/dir
export GTD_GRAPH_LOG_PATH=/absolute/path/to/data/dir/mcp-calls.log
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
curl 'http://localhost:8787/tools?server=gtd-graph-memory'

# Get tools in Gemini format
curl 'http://localhost:8787/tools/gemini?server=gtd-graph-memory'

# Execute a tool (generic MCP format)
curl -X POST 'http://localhost:8787/call_tool' \
  -H 'Content-Type: application/json' \
  -d '{"server":"gtd-graph-memory","tool":"query_nodes","arguments":{}}'

# Execute a tool (provider-specific format - Gemini)
curl -X POST 'http://localhost:8787/execute' \
  -H 'Content-Type: application/json' \
  -d '{"provider":"gemini","call":{"name":"query_nodes","args":{}},"server":"gtd-graph-memory"}'
```

Notes:
- The service uses the official MCP JS client over stdio to connect/spawn.
- `/logs` tails the file specified by `GTD_GRAPH_LOG_PATH`.
- Multiple servers will be supported by adding more specs; initial scaffold wires one.

## Testing

### Unit and Integration Tests

```bash
cd node/service
npm test
```

Or run only unit tests (excludes E2E):

```bash
npm run test:unit
```

### End-to-End Tests with Real Gemini API

E2E tests validate the complete workflow with real API calls. See [docs/E2E_TESTING.md](docs/E2E_TESTING.md) for detailed instructions.

**Quick start:**

```bash
cd node/service

# Set your Gemini API key (get one at https://makersuite.google.com/app/apikey)
export GEMINI_API_KEY="your_api_key_here"

# Run E2E tests
npm run test:e2e
```

**Security note:** Never commit API keys. The `.env` file is gitignored for local development.

If `GEMINI_API_KEY` is not set, E2E tests are automatically skipped.

## Project Plan

See docs/PLAN.md for the full roadmap, priorities, and API contract.

Agent details and areas for specialization are in AGENTS.md.
