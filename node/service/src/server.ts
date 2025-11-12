import express from 'express'
import { McpClientManager, defaultBootstrap } from './mcpManager.js'

const app = express()
app.use(express.json({ limit: '1mb' }))

const manager = new McpClientManager(defaultBootstrap)

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
    const server = (req.query.server as string | undefined) ?? 'gtd-graph-memory'
    const tools = await manager.listTools(server)
    res.json(tools)
  } catch (error: any) {
    res.status(500).json({ error: String(error?.message ?? error) })
  }
})

app.get('/logs', (req, res) => {
  try {
    const server = (req.query.server as string | undefined) ?? 'gtd-graph-memory'
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

export { app }

if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT || 8787
  app.listen(port, () => {
    console.log(`mcp-tool-gateway listening on :${port}`)
  })
}
