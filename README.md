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
