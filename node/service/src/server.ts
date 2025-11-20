import './env.js'
import express, { Request, Response, NextFunction } from 'express'
import { McpClientManager } from './mcpManager.js'
import { ConfigLoader } from './config.js'
import { GeminiAdapter, OpenAIAdapter, XAIAdapter, MCPTool, ProviderAdapter } from './adapters/index.js'
import { correlationMiddleware, getCorrelationId, logger, metrics } from './observability/index.js'

const app = express()
app.use(express.json({ limit: '1mb' }))

// Add correlation ID tracking
app.use(correlationMiddleware)

// Request timing and metrics middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now()

  // Extract provider from request if present
  let provider: string | undefined
  if (req.path.includes('/gemini')) provider = 'gemini'
  else if (req.path.includes('/openai')) provider = 'openai'
  else if (req.path.includes('/xai')) provider = 'xai'
  else if (req.body?.provider) provider = req.body.provider

  res.on('finish', () => {
    const duration = Date.now() - startTime
    const success = res.statusCode < 400

    // Record metrics
    metrics.recordRequest(req.path, duration, success, provider)

    // Log request
    logger.logRequest(req.method, req.path, res.statusCode, duration, {
      provider,
      server: req.query.server as string | undefined,
    })
  })

  next()
})

// Load configuration from file or environment variables
// Using a function ensures config is loaded lazily on first server connection
let configLoadedOnce = false
const manager = new McpClientManager(() => {
  if (!configLoadedOnce) {
    configLoadedOnce = true
  }
  return ConfigLoader.load()
})
const geminiAdapter = new GeminiAdapter()
const openaiAdapter = new OpenAIAdapter()
const xaiAdapter = new XAIAdapter()

// Registry of provider adapters
const adapters = new Map<string, ProviderAdapter>([
  ['gemini', geminiAdapter],
  ['openai', openaiAdapter],
  ['xai', xaiAdapter],
])

function parseTool(server: string | undefined, tool: string): { server: string, tool: string } {
  if (tool.startsWith('mcp__')) {
    const parts = tool.split('__')
    if (parts.length === 3) return { server: parts[1], tool: parts[2] }
  }
  if (!server) throw new Error('server is required when tool is not canonical')
  return { server, tool }
}

/**
 * Determine if an error is a client error (4xx) or server error (5xx).
 * Returns the appropriate HTTP status code.
 */
function getErrorStatusCode(error: any): number {
  const message = String(error?.message ?? error)

  // Client errors (400 Bad Request)
  if (message.includes('Unknown server:')) return 400
  if (message.includes('Unknown provider:')) return 400
  if (message.includes('server is required')) return 400
  if (message.includes('Missing or invalid')) return 400
  if (message.includes('requires url field')) return 400
  if (message.includes('requires command field')) return 400

  // Server errors (500 Internal Server Error)
  return 500
}

app.get('/health', (_req, res) => {
  const servers = manager.getServerHealth()
  res.json({
    ok: true,
    serverCount: manager.getServerCount(),
    servers: servers,
    configSource: ConfigLoader.hasConfigFile() ? 'file' : 'env'
  })
})

app.get('/tools', async (req, res) => {
  try {
    const server = (req.query.server as string | undefined) ?? 'default'
    const tools = await manager.listTools(server)
    res.json(tools)
  } catch (error: any) {
    const statusCode = getErrorStatusCode(error)
    res.status(statusCode).json({ error: String(error?.message ?? error) })
  }
})

app.get('/tools/gemini', async (req, res) => {
  try {
    const server = (req.query.server as string | undefined) ?? 'default'
    const toolsResponse = await manager.listTools(server)

    // Handle different SDK response formats: { tools: [...] } or [...]
    const toolsArray = Array.isArray((toolsResponse as any)?.tools)
      ? (toolsResponse as any).tools
      : (Array.isArray(toolsResponse) ? toolsResponse : [])

    // Translate to Gemini format
    const geminiTools = geminiAdapter.translateAllTools(toolsArray as MCPTool[])
    res.json(geminiTools)
  } catch (error: any) {
    const statusCode = getErrorStatusCode(error)
    res.status(statusCode).json({ error: String(error?.message ?? error) })
  }
})

app.get('/tools/openai', async (req, res) => {
  try {
    const server = (req.query.server as string | undefined) ?? 'default'
    const toolsResponse = await manager.listTools(server)

    // Handle different SDK response formats: { tools: [...] } or [...]
    const toolsArray = Array.isArray((toolsResponse as any)?.tools)
      ? (toolsResponse as any).tools
      : (Array.isArray(toolsResponse) ? toolsResponse : [])

    // Translate to OpenAI format
    const openaiTools = openaiAdapter.translateAllTools(toolsArray as MCPTool[])
    res.json(openaiTools)
  } catch (error: any) {
    const statusCode = getErrorStatusCode(error)
    res.status(statusCode).json({ error: String(error?.message ?? error) })
  }
})

app.get('/tools/xai', async (req, res) => {
  try {
    const server = (req.query.server as string | undefined) ?? 'default'
    const toolsResponse = await manager.listTools(server)

    // Handle different SDK response formats: { tools: [...] } or [...]
    const toolsArray = Array.isArray((toolsResponse as any)?.tools)
      ? (toolsResponse as any).tools
      : (Array.isArray(toolsResponse) ? toolsResponse : [])

    // Translate to xAI format
    const xaiTools = xaiAdapter.translateAllTools(toolsArray as MCPTool[])
    res.json(xaiTools)
  } catch (error: any) {
    const statusCode = getErrorStatusCode(error)
    res.status(statusCode).json({ error: String(error?.message ?? error) })
  }
})

// Context generation endpoints - human-readable tool descriptions
app.get('/tools/:provider/context', async (req, res) => {
  try {
    const provider = req.params.provider
    const server = (req.query.server as string | undefined) ?? 'default'

    // Get adapter for provider
    const adapter = adapters.get(provider)
    if (!adapter) {
      return res.status(400).json({
        error: `Unknown provider: ${provider}`,
        availableProviders: Array.from(adapters.keys())
      })
    }

    // Get tools from MCP server
    const toolsResponse = await manager.listTools(server)

    // Handle different SDK response formats: { tools: [...] } or [...]
    const toolsArray = Array.isArray((toolsResponse as any)?.tools)
      ? (toolsResponse as any).tools
      : (Array.isArray(toolsResponse) ? toolsResponse : [])

    // Format for context
    const context = adapter.formatForContext(toolsArray as MCPTool[])

    // Return as plain text for easy copy-paste into prompts
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send(context)
  } catch (error: any) {
    const statusCode = getErrorStatusCode(error)
    res.status(statusCode).json({ error: String(error?.message ?? error) })
  }
})

app.get('/logs', (req, res) => {
  try {
    const server = (req.query.server as string | undefined) ?? 'default'
    const since = req.query.since as string | undefined
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200
    const stream = req.query.stream === 'true'

    if (stream) {
      // SSE streaming mode
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      // Send initial logs
      const entries = manager.readLogs(server, since, limit)
      for (const entry of entries) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`)
      }

      // Keep connection alive and send heartbeats
      const heartbeat = setInterval(() => {
        res.write(`:heartbeat\n\n`)
      }, 30000) // 30 second heartbeat

      // Clean up on close
      req.on('close', () => {
        clearInterval(heartbeat)
        logger.debug('SSE connection closed', { server })
      })
    } else {
      // Regular JSON response
      const entries = manager.readLogs(server, since, limit)
      res.json(entries)
    }
  } catch (error: any) {
    logger.error('Failed to read logs', { error: String(error?.message ?? error) })
    const statusCode = getErrorStatusCode(error)
    res.status(statusCode).json({ error: String(error?.message ?? error) })
  }
})

// Metrics endpoint
app.get('/metrics', (req, res) => {
  try {
    const since = req.query.since ? parseInt(req.query.since as string, 10) : undefined
    const snapshot = metrics.getSnapshot(since)
    res.json(snapshot)
  } catch (error: any) {
    logger.error('Failed to get metrics', { error: String(error?.message ?? error) })
    const statusCode = getErrorStatusCode(error)
    res.status(statusCode).json({ error: String(error?.message ?? error) })
  }
})

app.post('/call_tool', async (req, res) => {
  const startTime = Date.now()
  try {
    const { server, tool, arguments: args } = req.body ?? {}
    const parsed = parseTool(server, tool)

    logger.info('Calling tool', {
      server: parsed.server,
      tool: parsed.tool,
    })

    const result = await manager.callTool(parsed.server, parsed.tool, args ?? {})
    const duration = Date.now() - startTime

    logger.logToolExecution(parsed.tool, parsed.server, duration, true)
    res.json({ result })
  } catch (error: any) {
    const duration = Date.now() - startTime
    const { server, tool } = req.body ?? {}

    logger.error('Tool execution failed', {
      server,
      tool,
      duration,
      error: String(error?.message ?? error),
    })

    const statusCode = getErrorStatusCode(error)
    res.status(statusCode).json({ error: String(error?.message ?? error) })
  }
})

app.post('/execute', async (req, res) => {
  const startTime = Date.now()
  try {
    const { provider, call, server } = req.body ?? {}

    // Validate request
    if (!provider || typeof provider !== 'string') {
      logger.warn('Invalid execute request: missing provider')
      return res.status(400).json({ error: 'Missing or invalid "provider" field' })
    }

    if (!call || typeof call !== 'object') {
      logger.warn('Invalid execute request: missing call', { provider })
      return res.status(400).json({ error: 'Missing or invalid "call" field' })
    }

    // Get adapter for provider
    const adapter = adapters.get(provider)
    if (!adapter) {
      logger.warn('Unknown provider', { provider })
      return res.status(400).json({
        error: `Unknown provider: ${provider}`,
        availableProviders: Array.from(adapters.keys())
      })
    }

    // Translate provider call to MCP format
    const mcpCall = adapter.translateInvocation(call)
    const serverName = server ?? 'default'

    logger.info('Executing tool via provider', {
      provider,
      server: serverName,
      tool: mcpCall.name,
    })

    // Execute via MCP
    const mcpResult = await manager.callTool(serverName, mcpCall.name, mcpCall.arguments)
    const duration = Date.now() - startTime

    // Format result for provider
    const providerResult = adapter.formatResult(mcpResult)

    logger.logToolExecution(mcpCall.name, serverName, duration, true, { provider })
    res.json({ result: providerResult })
  } catch (error: any) {
    const duration = Date.now() - startTime
    const { provider, server, call } = req.body ?? {}

    logger.error('Execute failed', {
      provider,
      server,
      tool: call?.name,
      duration,
      error: String(error?.message ?? error),
    })

    const statusCode = getErrorStatusCode(error)
    res.status(statusCode).json({ error: String(error?.message ?? error) })
  }
})

export { app }

if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT || 8787
  app.listen(port, () => {
    console.log(`mcp-tool-gateway listening on :${port}`)
  })
}
