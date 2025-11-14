# Observability & Production Features

This document describes the observability and production-hardening features available in MCP Tool Gateway.

## Table of Contents

- [Correlation IDs](#correlation-ids)
- [Structured Logging](#structured-logging)
- [Metrics](#metrics)
- [Enhanced Logs Endpoint](#enhanced-logs-endpoint)
- [Health Checks](#health-checks)
- [Docker Deployment](#docker-deployment)

## Correlation IDs

Every request to the gateway is assigned a unique correlation ID that can be used to trace the request through the system.

### Features

- **Automatic generation**: If a request doesn't include a correlation ID, one is automatically generated (UUID v4)
- **Header propagation**: Correlation IDs are returned in the `x-correlation-id` response header
- **Request tracing**: The same ID is used throughout the request lifecycle, including in logs and metrics

### Usage

**Send a correlation ID with your request:**
```bash
curl -H "x-correlation-id: my-request-123" http://localhost:8787/health
```

**The gateway will return it in the response:**
```http
HTTP/1.1 200 OK
x-correlation-id: my-request-123
...
```

**Or let the gateway generate one:**
```bash
curl http://localhost:8787/health
```
```http
HTTP/1.1 200 OK
x-correlation-id: 550e8400-e29b-41d4-a716-446655440000
...
```

### Implementation

Correlation IDs are implemented as Express middleware (`correlationMiddleware`) and are stored in:
1. The Express Request object for synchronous access
2. An async context for use in callbacks and async operations

## Structured Logging

All logs are output in structured JSON format for easy parsing and analysis.

### Log Format

```json
{
  "timestamp": "2025-11-14T19:30:58.642Z",
  "level": "info",
  "message": "GET /health 200",
  "context": {
    "correlationId": "550e8400-e29b-41d4-a716-446655440000",
    "method": "GET",
    "path": "/health",
    "statusCode": 200,
    "duration": 1,
    "provider": "gemini",
    "server": "default"
  }
}
```

### Log Levels

- **debug**: Detailed diagnostic information
- **info**: General informational messages (default)
- **warn**: Warning messages for potentially problematic situations
- **error**: Error messages for failures

### Configuration

Set the log level using the `LOG_LEVEL` environment variable:

```bash
export LOG_LEVEL=debug  # debug, info, warn, error
npm start
```

### What's Logged

1. **HTTP Requests**: Method, path, status code, duration, provider, server
2. **Tool Executions**: Tool name, server, duration, success/failure
3. **Errors**: Error messages with context (provider, server, tool, etc.)
4. **Validation Failures**: Invalid requests with details

### Example Logs

**Successful request:**
```json
{
  "timestamp": "2025-11-14T19:30:58.642Z",
  "level": "info",
  "message": "GET /health 200",
  "context": {
    "correlationId": "abc-123",
    "method": "GET",
    "path": "/health",
    "statusCode": 200,
    "duration": 1
  }
}
```

**Tool execution:**
```json
{
  "timestamp": "2025-11-14T19:30:58.650Z",
  "level": "info",
  "message": "Tool execution: add on math-server (5ms)",
  "context": {
    "correlationId": "abc-123",
    "provider": "gemini",
    "tool": "add",
    "server": "math-server",
    "duration": 5,
    "success": true
  }
}
```

**Error:**
```json
{
  "timestamp": "2025-11-14T19:30:58.660Z",
  "level": "error",
  "message": "Execute failed",
  "context": {
    "correlationId": "abc-123",
    "provider": "gemini",
    "server": "default",
    "tool": "invalid_tool",
    "duration": 10,
    "error": "Tool not found: invalid_tool"
  }
}
```

## Metrics

The gateway collects real-time metrics on requests, errors, and latencies.

### Endpoint

`GET /metrics`

### Query Parameters

- `since` (optional): Unix timestamp in milliseconds. Only include metrics since this time.

### Response Format

```json
{
  "requests": {
    "total": 1250,
    "byProvider": {
      "gemini": 450,
      "openai": 500,
      "xai": 300
    },
    "byEndpoint": {
      "/execute": 800,
      "/tools/gemini": 200,
      "/tools/openai": 150,
      "/health": 100
    }
  },
  "errors": {
    "total": 25,
    "byProvider": {
      "gemini": 10,
      "openai": 8,
      "xai": 7
    },
    "byEndpoint": {
      "/execute": 20,
      "/tools/gemini": 3,
      "/tools/openai": 2
    }
  },
  "latencies": {
    "p50": 12,
    "p95": 45,
    "p99": 120,
    "avg": 18.5,
    "byProvider": {
      "gemini": {
        "p50": 10,
        "p95": 40,
        "p99": 100,
        "avg": 15.2
      },
      "openai": {
        "p50": 15,
        "p95": 50,
        "p99": 150,
        "avg": 22.1
      }
    },
    "byEndpoint": {
      "/execute": {
        "p50": 20,
        "p95": 60,
        "p99": 180,
        "avg": 28.3
      },
      "/health": {
        "p50": 1,
        "p95": 2,
        "p99": 3,
        "avg": 1.2
      }
    }
  }
}
```

### Metrics Collected

1. **Request Counts**
   - Total requests
   - Requests by provider (gemini, openai, xai)
   - Requests by endpoint

2. **Error Rates**
   - Total errors (4xx and 5xx responses)
   - Errors by provider
   - Errors by endpoint

3. **Latency Statistics**
   - P50, P95, P99 percentiles
   - Average latency
   - Broken down by provider and endpoint

### Usage Examples

**Get all metrics:**
```bash
curl http://localhost:8787/metrics
```

**Get metrics since a specific time:**
```bash
# Get metrics from the last hour
SINCE=$(date -d '1 hour ago' +%s)000
curl "http://localhost:8787/metrics?since=$SINCE"
```

### Memory Management

The gateway stores the last 10,000 requests in memory. Older requests are automatically dropped to prevent memory bloat. For production deployments with high traffic, consider:

1. Exporting metrics to an external system (Prometheus, CloudWatch, etc.)
2. Polling the `/metrics` endpoint regularly and storing results
3. Using the `since` parameter to get incremental updates

## Enhanced Logs Endpoint

The `/logs` endpoint provides access to MCP server call logs with filtering and streaming support.

### Endpoint

`GET /logs`

### Query Parameters

- `server` (optional): Server name (default: "default")
- `since` (optional): ISO 8601 timestamp. Only return logs after this time.
- `limit` (optional): Maximum number of log entries to return (default: 200)
- `stream` (optional): Set to "true" to enable SSE streaming

### Regular Mode (JSON Response)

**Request:**
```bash
curl "http://localhost:8787/logs?server=default&limit=10"
```

**Response:**
```json
[
  {
    "timestamp": "2025-11-14T19:30:58.642Z",
    "tool": "add",
    "input": { "a": 1, "b": 2 },
    "result": { "sum": 3 }
  },
  {
    "timestamp": "2025-11-14T19:30:59.123Z",
    "tool": "multiply",
    "input": { "a": 3, "b": 4 },
    "result": { "product": 12 }
  }
]
```

### Streaming Mode (SSE)

Server-Sent Events (SSE) streaming allows real-time log monitoring.

**Request:**
```bash
curl "http://localhost:8787/logs?stream=true&server=default"
```

**Response:**
```
data: {"timestamp":"2025-11-14T19:30:58.642Z","tool":"add","input":{"a":1,"b":2},"result":{"sum":3}}

data: {"timestamp":"2025-11-14T19:30:59.123Z","tool":"multiply","input":{"a":3,"b":4},"result":{"product":12}}

:heartbeat

:heartbeat
```

### SSE Features

- **Initial logs**: Sends existing logs matching the query parameters
- **Heartbeats**: Sends heartbeat comments every 30 seconds to keep the connection alive
- **Auto-cleanup**: Automatically cleans up resources when the client disconnects

### Usage Examples

**Get recent logs:**
```bash
curl "http://localhost:8787/logs?limit=50"
```

**Get logs since a specific time:**
```bash
SINCE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
curl "http://localhost:8787/logs?since=$SINCE"
```

**Stream logs in real-time:**
```bash
curl "http://localhost:8787/logs?stream=true"
```

**Monitor specific server:**
```bash
curl "http://localhost:8787/logs?server=math-server&stream=true"
```

## Health Checks

The `/health` endpoint provides server status information.

### Endpoint

`GET /health`

### Response Format

```json
{
  "ok": true,
  "serverCount": 3,
  "servers": [
    {
      "name": "math-server",
      "transport": "stdio",
      "connected": true
    },
    {
      "name": "storage-server",
      "transport": "stdio",
      "connected": false
    },
    {
      "name": "remote-server",
      "transport": "http",
      "connected": true
    }
  ],
  "configSource": "file"
}
```

### Fields

- `ok`: Always `true` if the gateway is responding
- `serverCount`: Total number of configured servers
- `servers`: Array of server status objects
  - `name`: Server name
  - `transport`: Transport type ("stdio" or "http")
  - `connected`: Whether a connection has been established
- `configSource`: Configuration source ("file" or "env")

### Usage

**Check health:**
```bash
curl http://localhost:8787/health
```

**Use in Docker health check:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8787/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"
```

**Use in Kubernetes:**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8787
  initialDelaySeconds: 5
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health
    port: 8787
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Docker Deployment

The gateway includes production-ready Docker configuration.

### Quick Start

**Build the image:**
```bash
docker build -t mcp-tool-gateway .
```

**Run with Docker Compose:**
```bash
docker-compose up -d
```

### Configuration

The Docker setup supports two configuration methods:

#### 1. JSON Configuration File (Recommended)

Create `mcp-gateway-config.json`:
```json
{
  "servers": {
    "remote-server": {
      "transport": "http",
      "url": "http://mcp-server:8080/sse",
      "logPath": "/app/logs/remote-server.log"
    }
  }
}
```

Mount it in `docker-compose.yml`:
```yaml
volumes:
  - ./mcp-gateway-config.json:/app/config/mcp-gateway-config.json:ro
```

#### 2. Environment Variables

For a single server, use environment variables:
```yaml
environment:
  - MCP_SERVER_DIST=/app/mcp-servers/server/dist/index.js
  - MCP_BASE_PATH=/app/data
  - MCP_LOG_PATH=/app/logs/mcp-calls.log
```

### Environment Variables

- `NODE_ENV`: Environment (default: "production")
- `PORT`: HTTP port (default: 8787)
- `LOG_LEVEL`: Logging level (default: "info")
- `MCP_CONFIG_PATH`: Path to JSON config file
- `MCP_SERVER_DIST`: Server entry point (single-server mode)
- `MCP_BASE_PATH`: Server data directory (single-server mode)
- `MCP_LOG_PATH`: Server log path (single-server mode)

### Resource Limits

The default `docker-compose.yml` includes resource limits:

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

Adjust these based on your traffic and server count.

### Logging

Docker logs are configured with rotation:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

**View logs:**
```bash
docker-compose logs -f gateway
```

### Health Checks

The Dockerfile includes a built-in health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8787/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"
```

**Check container health:**
```bash
docker ps
# Look for "healthy" in the STATUS column
```

### Volumes

**Recommended volumes:**
```yaml
volumes:
  # Configuration
  - ./mcp-gateway-config.json:/app/config/mcp-gateway-config.json:ro

  # Logs (for persistence)
  - ./logs:/app/logs

  # MCP servers (if using stdio transport)
  - ./mcp-servers:/app/mcp-servers:ro
```

### Production Deployment

For production use, consider:

1. **Use HTTP transport** for MCP servers when possible (easier to scale)
2. **Export metrics** to Prometheus or CloudWatch
3. **Set up log aggregation** (ELK, CloudWatch Logs, etc.)
4. **Configure health checks** in your orchestrator (Kubernetes, ECS, etc.)
5. **Set resource limits** based on your traffic
6. **Enable correlation IDs** in your clients for request tracing
7. **Monitor the `/health` endpoint** for server connectivity
8. **Set appropriate `LOG_LEVEL`** (info or warn in production, debug for troubleshooting)

### Example: Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-gateway
  template:
    metadata:
      labels:
        app: mcp-gateway
    spec:
      containers:
      - name: gateway
        image: mcp-tool-gateway:latest
        ports:
        - containerPort: 8787
        env:
        - name: LOG_LEVEL
          value: "info"
        - name: MCP_CONFIG_PATH
          value: "/config/mcp-gateway-config.json"
        resources:
          limits:
            cpu: "1"
            memory: "512Mi"
          requests:
            cpu: "500m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 8787
          initialDelaySeconds: 5
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 8787
          initialDelaySeconds: 5
          periodSeconds: 10
        volumeMounts:
        - name: config
          mountPath: /config
          readOnly: true
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: config
        configMap:
          name: mcp-gateway-config
      - name: logs
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-gateway
spec:
  selector:
    app: mcp-gateway
  ports:
  - port: 8787
    targetPort: 8787
  type: LoadBalancer
```

## Integration with Monitoring Tools

### Prometheus

While the gateway doesn't expose Prometheus metrics format natively, you can use a sidecar to convert `/metrics` JSON to Prometheus format, or poll the endpoint and push to Pushgateway.

**Example Prometheus configuration:**
```yaml
# See examples/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'mcp-gateway'
    static_configs:
      - targets: ['gateway:8787']
    metrics_path: '/metrics'
    scrape_interval: 10s
```

### CloudWatch

Use the structured logs with CloudWatch Logs and create metric filters:

**Metric filter for errors:**
```
{ $.level = "error" }
```

**Metric filter for slow requests:**
```
{ $.context.duration > 1000 }
```

### Datadog

Forward structured logs to Datadog and use their log parsing to extract metrics:

```json
{
  "source": "mcp-gateway",
  "service": "mcp-tool-gateway",
  "message": "...",
  "correlationId": "...",
  "duration": 123,
  "provider": "gemini"
}
```

## Troubleshooting

### High latency

1. Check `/metrics` to identify slow endpoints or providers
2. Review structured logs for errors or retries
3. Check MCP server health and response times

### Missing correlation IDs

Ensure the `correlationMiddleware` is applied before other middleware in `server.ts`.

### Metrics not updating

1. Verify requests are reaching the gateway
2. Check that metrics middleware is enabled
3. Use `/metrics` endpoint to verify data is being collected

### SSE streaming not working

1. Ensure client supports SSE (EventSource API)
2. Check firewall/proxy settings (some block SSE)
3. Verify the server parameter is valid
4. Check that the MCP server log path exists and is readable

### Docker health check failing

1. Verify the gateway is listening on port 8787
2. Check container logs: `docker logs <container-id>`
3. Test health endpoint manually: `docker exec <container-id> wget -O- http://localhost:8787/health`
