# HTTP Transport Support

## Overview

The MCP Tool Gateway now supports both **stdio** and **HTTP/SSE** transports for connecting to MCP servers. This enables more flexible deployment patterns, including:

- Remote MCP servers (not just local processes)
- Cloud-based MCP server deployments
- Better scalability for production environments
- Easier testing and development workflows

## Transport Types

### Stdio Transport (Default)

The stdio transport spawns a local MCP server process and communicates via standard input/output streams.

**Use when:**
- Running MCP servers locally
- You have the MCP server code on the same machine
- You want simple, process-based isolation

**Configuration:**
```typescript
{
  name: 'my-server',
  transport: 'stdio', // or omit (stdio is default)
  command: 'node',
  args: ['/path/to/server.js'],
  env: {
    BASE_PATH: '/data',
    MCP_CALL_LOG: '/logs/mcp.log'
  },
  logPath: '/logs/mcp.log'
}
```

### HTTP/SSE Transport

The HTTP transport connects to a remote MCP server via HTTP with Server-Sent Events (SSE) for bidirectional communication.

**Use when:**
- MCP server is running remotely or in a container
- You want to deploy MCP servers independently
- You need better network-based access control
- Testing with containerized or cloud-based servers

**Configuration:**
```typescript
{
  name: 'my-remote-server',
  transport: 'http',
  url: 'http://localhost:3001/sse',
  logPath: '/logs/mcp.log' // optional, for local log reading
}
```

## Server Configuration

### ServerSpec Interface

```typescript
export type TransportType = 'stdio' | 'http'

export interface ServerSpec {
  name: string                    // Unique server identifier
  transport?: TransportType       // Default: 'stdio'

  // Stdio transport fields
  command?: string                // Command to run (required for stdio)
  args?: string[]                 // Command arguments
  env?: Record<string, string>    // Environment variables

  // HTTP transport fields
  url?: string                    // SSE endpoint URL (required for http)

  // Common fields
  logPath?: string                // Path to MCP call log file
}
```

### Configuration Examples

#### Single Stdio Server (Environment Variables)

Current default configuration using environment variables:

```bash
GTD_GRAPH_DIST=/path/to/server/dist/index.js
GTD_GRAPH_BASE_PATH=/data/base
GTD_GRAPH_LOG_PATH=/data/logs/mcp.log
```

This is automatically converted to:
```typescript
{
  name: 'gtd-graph-memory',
  transport: 'stdio',
  command: 'node',
  args: ['/path/to/server/dist/index.js'],
  env: {
    BASE_PATH: '/data/base',
    MCP_CALL_LOG: '/data/logs/mcp.log'
  },
  logPath: '/data/logs/mcp.log'
}
```

#### Multiple Servers with Mixed Transports

```typescript
const manager = new McpClientManager(() => {
  return [
    // Local stdio server
    {
      name: 'local-tools',
      transport: 'stdio',
      command: 'node',
      args: ['/path/to/local-server.js'],
      env: { BASE_PATH: '/data/local' },
      logPath: '/logs/local.log'
    },
    // Remote HTTP server
    {
      name: 'remote-tools',
      transport: 'http',
      url: 'http://api.example.com:8080/mcp/sse',
      logPath: '/logs/remote.log' // optional
    },
    // Another HTTP server (containerized)
    {
      name: 'docker-tools',
      transport: 'http',
      url: 'http://localhost:3001/sse'
    }
  ]
})
```

## Creating an HTTP MCP Server

### Using MCP SDK

The MCP SDK provides `SSEServerTransport` for creating HTTP-based MCP servers:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import express from 'express'

// Create MCP server
const server = new Server({
  name: 'my-http-server',
  version: '1.0.0',
}, {
  capabilities: { tools: {} }
})

// Define your tools...
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [...] }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Handle tool calls
})

// Create Express app and SSE transport
const app = express()
const transport = new SSEServerTransport('/sse', app)

// Connect server to transport
await server.connect(transport)

// Start HTTP server
app.listen(3001, () => {
  console.log('MCP server running on http://localhost:3001')
  console.log('SSE endpoint: http://localhost:3001/sse')
})
```

### Example: Converting Stdio to HTTP

See the test fixtures for complete examples:
- Stdio version: `node/service/test/fixtures/simple-test-server.ts`
- HTTP version: `node/service/test/fixtures/simple-test-server-http.ts`

The main differences:
1. Import `SSEServerTransport` instead of `StdioServerTransport`
2. Create an Express app
3. Pass the SSE path and app to the transport
4. Start the Express server

## Testing

### Building Test Servers

```bash
cd node/service
npm run build:test-server
```

This compiles both stdio and HTTP test servers to `test/fixtures/dist/`.

### Running E2E Tests

**Stdio transport tests:**
```bash
GEMINI_API_KEY=your_key npm test -- gemini-e2e.test.ts
```

**HTTP transport tests:**
```bash
GEMINI_API_KEY=your_key npm test -- gemini-http-e2e.test.ts
```

**Run all tests (unit + E2E):**
```bash
GEMINI_API_KEY=your_key npm test
```

## Performance Considerations

### Stdio Transport
- **Pros:**
  - Lower latency (direct process communication)
  - Simpler deployment (no network setup)
  - Better for local development
- **Cons:**
  - Requires server code on same machine
  - Process management overhead
  - Limited scalability

### HTTP Transport
- **Pros:**
  - Remote server capability
  - Better for distributed systems
  - Easier to scale horizontally
  - Network-level access control
- **Cons:**
  - Network latency overhead
  - Requires HTTP server setup
  - More complex error handling

### Benchmark Results

*TODO: Add performance comparison after testing*

## Security Considerations

### Stdio Transport
- Server runs in subprocess with inherited/custom environment
- Limited by OS process isolation
- No network exposure

### HTTP Transport
- Network-exposed endpoints require proper authentication
- Use HTTPS in production
- Implement rate limiting and access controls
- Consider using API gateways or reverse proxies

## Troubleshooting

### HTTP Connection Issues

**Problem:** Cannot connect to HTTP MCP server

**Solutions:**
1. Verify the server is running: `curl http://localhost:3001/sse`
2. Check the URL in ServerSpec matches the server's SSE endpoint
3. Ensure no firewall blocking the port
4. Check server logs for startup errors

### Stdio Process Issues

**Problem:** Stdio server fails to start

**Solutions:**
1. Verify the command path is correct
2. Check environment variables are set
3. Ensure executable permissions
4. Review server logs (typically on stderr)

### Log Path Issues

**Problem:** Logs not appearing

**Solutions:**
1. Verify logPath directory exists and is writable
2. Check MCP_CALL_LOG environment variable is set (stdio)
3. Ensure server implements logging correctly
4. For HTTP servers, verify log path is accessible by gateway

## Migration Guide

### Converting Existing Stdio Servers to HTTP

1. **Update your server code:**
   ```typescript
   // Before (stdio)
   import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
   const transport = new StdioServerTransport()

   // After (HTTP)
   import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
   import express from 'express'
   const app = express()
   const transport = new SSEServerTransport('/sse', app)
   app.listen(3001)
   ```

2. **Update gateway configuration:**
   ```typescript
   // Before
   {
     name: 'my-server',
     command: 'node',
     args: ['server.js'],
     env: { BASE_PATH: '/data' }
   }

   // After
   {
     name: 'my-server',
     transport: 'http',
     url: 'http://localhost:3001/sse'
   }
   ```

3. **Test the migration:**
   - Start your HTTP server
   - Query `/tools/gemini?server=my-server`
   - Test tool execution via `/execute`
   - Verify logs with `/logs?server=my-server`

## Future Enhancements

- [ ] WebSocket transport support
- [ ] Authentication/authorization for HTTP transport
- [ ] Connection pooling and retry strategies
- [ ] Health checks for HTTP servers
- [ ] Metrics and monitoring for both transports
- [ ] TLS/SSL support for secure HTTP connections

## See Also

- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [E2E Testing Guide](./E2E_TESTING.md)
- [Project Plan](./PLAN.md)
