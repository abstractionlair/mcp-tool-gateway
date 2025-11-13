import './env.js'
import express from 'express'
import { McpClientManager, defaultBootstrap } from './mcpManager.js'
import { GeminiAdapter, OpenAIAdapter, XAIAdapter, MCPTool, ProviderAdapter } from './adapters/index.js'

const app = express()
app.use(express.json({ limit: '1mb' }))

const manager = new McpClientManager(defaultBootstrap)
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

app.get('/health', (_req, res) => {
  res.json({ ok: true, servers: [] })
})

app.get('/tools', async (req, res) => {
  try {
    const server = (req.query.server as string | undefined) ?? 'default'
    const tools = await manager.listTools(server)
    res.json(tools)
  } catch (error: any) {
    res.status(500).json({ error: String(error?.message ?? error) })
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
    res.status(500).json({ error: String(error?.message ?? error) })
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
    res.status(500).json({ error: String(error?.message ?? error) })
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
    res.status(500).json({ error: String(error?.message ?? error) })
  }
})

app.get('/logs', (req, res) => {
  try {
    const server = (req.query.server as string | undefined) ?? 'default'
    const since = req.query.since as string | undefined
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200
    const entries = manager.readLogs(server, since, limit)
    res.json(entries)
  } catch (error: any) {
    res.status(500).json({ error: String(error?.message ?? error) })
  }
})

app.post('/call_tool', async (req, res) => {
  try {
    const { server, tool, arguments: args } = req.body ?? {}
    const parsed = parseTool(server, tool)
    const result = await manager.callTool(parsed.server, parsed.tool, args ?? {})
    res.json({ result })
  } catch (error: any) {
    res.status(500).json({ error: String(error?.message ?? error) })
  }
})

app.post('/execute', async (req, res) => {
  try {
    const { provider, call, server } = req.body ?? {}

    // Validate request
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "provider" field' })
    }

    if (!call || typeof call !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid "call" field' })
    }

    // Get adapter for provider
    const adapter = adapters.get(provider)
    if (!adapter) {
      return res.status(400).json({
        error: `Unknown provider: ${provider}`,
        availableProviders: Array.from(adapters.keys())
      })
    }

    // Translate provider call to MCP format
    const mcpCall = adapter.translateInvocation(call)

    // Execute via MCP
    const serverName = server ?? 'default'
    const mcpResult = await manager.callTool(serverName, mcpCall.name, mcpCall.arguments)

    // Format result for provider
    const providerResult = adapter.formatResult(mcpResult)

    res.json({ result: providerResult })
  } catch (error: any) {
    res.status(500).json({ error: String(error?.message ?? error) })
  }
})

export { app }

if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT || 8787
  app.listen(port, () => {
    console.log(`mcp-tool-gateway listening on :${port}`)
  })
}
