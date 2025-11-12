import path from 'node:path'

export async function runLocalTool(distEntry: string, basePath: string, tool: string, args: unknown): Promise<unknown> {
  const dir = path.dirname(distEntry)
  const serverMod = await import(path.join(dir, 'server.js'))
  const memoryGraphMod = await import(path.join(dir, 'memoryGraph.js'))
  const storageMod = await import(path.join(dir, 'storageGateway.js'))

  const { GraphMemoryMcpServer } = serverMod
  const { MemoryGraph } = memoryGraphMod
  const { FileStorageAdapter } = storageMod

  const storage = new FileStorageAdapter(basePath)
  const graph = await MemoryGraph.initialize({ basePath }, storage)
  const mcp = new GraphMemoryMcpServer(graph)

  // Register tools and invoke handler directly
  const tools: Record<string, any> = {}
  const registrar = { registerTool: (def: any) => { tools[def.name] = def } }
  mcp.registerTools(registrar)
  const def = tools[tool]
  if (!def) throw new Error(`Unknown tool ${tool}`)
  return await def.handler(args)
}

