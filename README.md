# MCP Tool Gateway

A generic bridge that connects to MCP servers (via the official JS client over stdio) and exposes a simple HTTP API for calling tools, listing tools with JSON Schemas, and reading logs. Includes Python and TypeScript clients.

- Node service endpoints:
  - POST `/call_tool` → `{ server, tool, arguments }`
  - GET `/tools?server=...` → tool discovery + JSON Schemas
  - GET `/logs?server=...&since=...&limit=...` → recent MCP log entries
  - GET `/health` → service health status

- Clients:
  - Python: `mcp_tool_gateway`
  - TypeScript: `@mcp-tool-gateway/client`

## Status
Scaffolded. Endpoints return 501 until wired to the MCP JS client.

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

```
curl 'http://localhost:8787/health'
curl 'http://localhost:8787/tools?server=gtd-graph-memory'
curl -X POST 'http://localhost:8787/call_tool' \
  -H 'Content-Type: application/json' \
  -d '{"server":"gtd-graph-memory","tool":"query_nodes","arguments":{}}'
```

Notes:
- The service uses the official MCP JS client over stdio to connect/spawn.
- `/logs` tails the file specified by `GTD_GRAPH_LOG_PATH`.
- Multiple servers will be supported by adding more specs; initial scaffold wires one.

## Project Plan

See docs/PLAN.md for the full roadmap, priorities, and API contract.

Agent details and areas for specialization are in AGENTS.md.
