# MCP Tool Gateway Configuration Guide

This guide explains how to configure the MCP Tool Gateway to connect to multiple MCP servers.

## Configuration Methods

The gateway supports two configuration methods:

1. **JSON Configuration File** (recommended for multiple servers)
2. **Environment Variables** (legacy, single-server only)

The gateway will use the JSON configuration file if it exists, otherwise it falls back to environment variables for backward compatibility.

## JSON Configuration File

### File Location

By default, the gateway looks for `mcp-gateway-config.json` in the current working directory.

You can override this with the `MCP_CONFIG_PATH` environment variable:

```bash
export MCP_CONFIG_PATH=/path/to/custom-config.json
```

### Configuration Schema

```json
{
  "servers": {
    "server-name": {
      "transport": "stdio" | "http",
      "command": "string",      // Required for stdio
      "args": ["string"],       // Optional for stdio
      "env": { "KEY": "value" }, // Optional for stdio
      "url": "string",          // Required for http
      "logPath": "string"       // Optional
    }
  }
}
```

### Stdio Transport (Local Servers)

Use stdio transport to connect to MCP servers running as local processes.

**Required fields:**
- `command`: The executable to run (e.g., "node", "python", full path to binary)

**Optional fields:**
- `args`: Array of command-line arguments
- `env`: Environment variables to pass to the server process
- `logPath`: Path to read MCP call logs from

**Example:**

```json
{
  "servers": {
    "filesystem": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server-filesystem/dist/index.js"],
      "env": {
        "BASE_PATH": "/home/user/data"
      },
      "logPath": "/home/user/data/mcp-calls.log"
    },
    "memory": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/graph-memory-mcp/dist/index.js"],
      "env": {
        "BASE_PATH": "/home/user/memory",
        "MCP_CALL_LOG": "/home/user/memory/calls.log"
      },
      "logPath": "/home/user/memory/calls.log"
    }
  }
}
```

**Notes:**
- `transport` defaults to "stdio" if not specified
- The gateway spawns the server process and manages its lifecycle
- Server process stdin/stdout are used for MCP communication

### HTTP Transport (Remote Servers)

Use HTTP transport to connect to MCP servers exposed via HTTP/SSE endpoints.

**Required fields:**
- `url`: The HTTP endpoint URL (must support SSE)

**Optional fields:**
- `logPath`: Path to read MCP call logs from (if available locally)

**Example:**

```json
{
  "servers": {
    "remote-api": {
      "transport": "http",
      "url": "http://api.example.com:3001/sse"
    },
    "cloud-service": {
      "transport": "http",
      "url": "https://mcp.service.com/v1/sse",
      "logPath": "/var/log/cloud-service-calls.log"
    }
  }
}
```

**Notes:**
- The MCP server must implement the SSE transport protocol
- See [HTTP_TRANSPORT.md](./HTTP_TRANSPORT.md) for more details

### Mixed Transport Example

You can mix stdio and HTTP transports in the same configuration:

```json
{
  "servers": {
    "local-filesystem": {
      "transport": "stdio",
      "command": "node",
      "args": ["/opt/mcp-servers/filesystem/dist/index.js"],
      "env": {
        "BASE_PATH": "/data"
      }
    },
    "remote-weather": {
      "transport": "http",
      "url": "http://weather-service:3001/sse"
    },
    "local-database": {
      "command": "python",
      "args": ["/opt/mcp-servers/database/server.py"],
      "env": {
        "DB_HOST": "localhost",
        "DB_NAME": "mydb"
      }
    }
  }
}
```

## Environment Variables (Legacy)

For backward compatibility, the gateway supports single-server configuration via environment variables.

**Required:**
- `MCP_SERVER_DIST`: Absolute path to the MCP server entry point (e.g., `/path/to/server/dist/index.js`)
- `MCP_BASE_PATH`: Data directory path for the MCP server

**Optional:**
- `MCP_LOG_PATH`: Path to the MCP call log file

**Example:**

```bash
export MCP_SERVER_DIST=/path/to/mcp-server/dist/index.js
export MCP_BASE_PATH=/home/user/data
export MCP_LOG_PATH=/home/user/data/mcp-calls.log

npm start
```

This creates a single server named "default" with stdio transport.

**Note:** If a configuration file exists, environment variables are ignored.

## Using Multiple Servers

Once configured, you can access different servers via the `server` query parameter or request field.

### Get Tools from Specific Server

```bash
# Get tools from 'filesystem' server in Gemini format
curl 'http://localhost:8787/tools/gemini?server=filesystem'

# Get tools from 'memory' server in OpenAI format
curl 'http://localhost:8787/tools/openai?server=memory'

# Get raw MCP tools from 'remote-api' server
curl 'http://localhost:8787/tools?server=remote-api'
```

### Execute Tools on Specific Server

```bash
# Call tool on 'filesystem' server (generic format)
curl -X POST http://localhost:8787/call_tool \
  -H 'Content-Type: application/json' \
  -d '{
    "server": "filesystem",
    "tool": "read_file",
    "arguments": {"path": "/data/file.txt"}
  }'

# Execute tool on 'memory' server (Gemini format)
curl -X POST http://localhost:8787/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "gemini",
    "server": "memory",
    "call": {
      "name": "query_nodes",
      "args": {"query": "tasks"}
    }
  }'
```

### Check Server Health

The `/health` endpoint shows all configured servers and their connection status:

```bash
curl http://localhost:8787/health
```

Response:

```json
{
  "ok": true,
  "serverCount": 3,
  "configSource": "file",
  "servers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "connected": true
    },
    {
      "name": "memory",
      "transport": "stdio",
      "connected": false
    },
    {
      "name": "remote-api",
      "transport": "http",
      "connected": true
    }
  ]
}
```

**Fields:**
- `ok`: Overall health status
- `serverCount`: Number of configured servers
- `configSource`: "file" or "env" (indicates config method)
- `servers`: Array of server status objects
  - `name`: Server name
  - `transport`: "stdio" or "http"
  - `connected`: Whether the gateway has an active connection

## Migration from Environment Variables

If you're currently using environment variables, here's how to migrate to a configuration file:

**Before (environment variables):**

```bash
export MCP_SERVER_DIST=/path/to/server/dist/index.js
export MCP_BASE_PATH=/data
export MCP_LOG_PATH=/data/mcp-calls.log
```

**After (mcp-gateway-config.json):**

```json
{
  "servers": {
    "default": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/server/dist/index.js"],
      "env": {
        "BASE_PATH": "/data",
        "MCP_CALL_LOG": "/data/mcp-calls.log"
      },
      "logPath": "/data/mcp-calls.log"
    }
  }
}
```

**Note:** Keep the server name as "default" to maintain compatibility with existing code.

## Validation and Error Handling

The gateway validates configuration on startup:

- **Missing required fields:** Error with details about which field is missing
- **Invalid transport type:** Must be "stdio" or "http"
- **stdio without command:** Error requiring `command` field
- **http without url:** Error requiring `url` field
- **Invalid JSON:** Parse error with file path
- **Unknown server requested:** Error listing available servers

Example error when requesting unknown server:

```json
{
  "error": "Unknown server: nonexistent. Available servers: filesystem, memory, remote-api"
}
```

## Best Practices

1. **Server Naming:**
   - Use descriptive names (e.g., "filesystem", "memory", "weather")
   - Avoid special characters; use alphanumeric and hyphens
   - Keep names short but meaningful

2. **Log Management:**
   - Set `logPath` for servers you want to monitor
   - Use separate log files for each server
   - Rotate logs regularly to prevent disk space issues

3. **Environment Variables:**
   - Pass server-specific config via the `env` field
   - Don't hardcode sensitive data; use environment variable expansion in your deployment scripts

4. **HTTP Transport:**
   - Ensure HTTP servers are accessible from the gateway
   - Use HTTPS in production
   - Configure appropriate timeouts for remote servers

5. **Testing:**
   - Test configuration with `/health` endpoint
   - Verify each server with `/tools?server=name`
   - Check logs for connection issues

## Example Configurations

### Development Setup (Local Servers Only)

```json
{
  "servers": {
    "filesystem": {
      "command": "node",
      "args": ["./servers/filesystem/dist/index.js"],
      "env": {
        "BASE_PATH": "./dev-data/fs"
      },
      "logPath": "./dev-data/fs/calls.log"
    },
    "memory": {
      "command": "node",
      "args": ["./servers/memory/dist/index.js"],
      "env": {
        "BASE_PATH": "./dev-data/memory",
        "MCP_CALL_LOG": "./dev-data/memory/calls.log"
      },
      "logPath": "./dev-data/memory/calls.log"
    }
  }
}
```

### Production Setup (Mixed Transports)

```json
{
  "servers": {
    "filesystem": {
      "transport": "stdio",
      "command": "/usr/bin/node",
      "args": ["/opt/mcp-servers/filesystem/dist/index.js"],
      "env": {
        "BASE_PATH": "/var/lib/mcp/filesystem",
        "MCP_CALL_LOG": "/var/log/mcp/filesystem.log"
      },
      "logPath": "/var/log/mcp/filesystem.log"
    },
    "cloud-service": {
      "transport": "http",
      "url": "https://api.internal.company.com/mcp/sse"
    },
    "database": {
      "transport": "stdio",
      "command": "/usr/bin/python3",
      "args": ["/opt/mcp-servers/database/server.py"],
      "env": {
        "DB_HOST": "db.internal.company.com",
        "DB_USER": "mcp_user"
      },
      "logPath": "/var/log/mcp/database.log"
    }
  }
}
```

## Troubleshooting

### "No config file found and MCP_SERVER_DIST/MCP_BASE_PATH not set"

**Cause:** No configuration file exists and environment variables are not set.

**Solution:** Create `mcp-gateway-config.json` or set `MCP_SERVER_DIST` and `MCP_BASE_PATH`.

### "Unknown server: X. Available servers: Y, Z"

**Cause:** Requesting a server name that's not in the configuration.

**Solution:** Check server name spelling or add the server to your configuration.

### "stdio transport requires 'command' field"

**Cause:** Server configured with `transport: "stdio"` but missing `command` field.

**Solution:** Add the `command` field with the executable path.

### "http transport requires 'url' field"

**Cause:** Server configured with `transport: "http"` but missing `url` field.

**Solution:** Add the `url` field with the HTTP/SSE endpoint.

### Server shows connected: false in /health

**Cause:** Server hasn't been used yet, or connection failed.

**Solution:**
- Try calling `/tools?server=name` to trigger connection
- Check server logs for errors
- Verify command/url is correct
- For HTTP, ensure the remote server is running

## See Also

- [HTTP_TRANSPORT.md](./HTTP_TRANSPORT.md) - HTTP/SSE transport details
- [E2E_TESTING.md](./E2E_TESTING.md) - End-to-end testing guide
- [PLAN.md](./PLAN.md) - Project roadmap
- [README.md](../README.md) - Main documentation
