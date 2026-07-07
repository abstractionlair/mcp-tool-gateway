import './env.js'
import { existsSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { resolve } from 'node:path'

// Note: These imports require @modelcontextprotocol/sdk at runtime
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'
// Removed graph-memory-specific local runner to keep gateway provider-agnostic

export type TransportType = 'stdio' | 'http'

export interface ServerSpec {
  name: string
  transport?: TransportType // Default: 'stdio'
  // Stdio transport fields
  command?: string
  args?: string[]
  env?: Record<string, string>
  // HTTP transport fields
  url?: string
  // Common fields
  logPath?: string
}

interface ServerHandle {
  spec: ServerSpec
  client: any
  transport: any
}

export class McpClientManager {
  private servers = new Map<string, ServerHandle>()
  private serverSpecs: ServerSpec[] = []
  private specsLoaded = false

  constructor(private readonly bootstrap: () => ServerSpec[]) {
    // Defer loading until first access to support dynamic configuration in tests
  }

  private ensureSpecsLoaded(): void {
    if (!this.specsLoaded) {
      this.serverSpecs = this.bootstrap()
      this.specsLoaded = true
    }
  }

  async ensure(serverName: string): Promise<ServerHandle> {
    this.ensureSpecsLoaded()
    let handle = this.servers.get(serverName)
    if (handle) return handle

    const spec = this.serverSpecs.find(s => s.name === serverName)
    if (!spec) {
      const availableServers = this.serverSpecs.map(s => s.name).join(', ')
      throw new Error(`Unknown server: ${serverName}. Available servers: ${availableServers || 'none'}`)
    }

    const transportType = spec.transport ?? 'stdio'
    let transport: any

    if (transportType === 'http') {
      // HTTP/SSE transport
      if (!spec.url) {
        throw new Error(`HTTP transport requires url field for server: ${serverName}`)
      }
      transport = new SSEClientTransport(new URL(spec.url))
    } else {
      // Stdio transport
      if (!spec.command) {
        throw new Error(`Stdio transport requires command field for server: ${serverName}`)
      }
      transport = new StdioClientTransport({
        command: spec.command,
        args: spec.args ?? [],
        env: spec.env ?? {},
        // stderr: 'pipe', // optionally capture
      })
    }

    const client = new McpClient({ name: 'mcp-tool-gateway', version: '0.1.0' })
    await client.connect(transport)
    handle = { spec, client, transport }
    this.servers.set(serverName, handle)
    return handle
  }

  async callTool(serverName: string, tool: string, args: unknown): Promise<unknown> {
    const h = await this.ensure(serverName)
    // Feature-detect the SDK call surface once and use exactly one call path.
    // Never retry a tool error across call styles: tools/call round-trips to
    // the server, so a retry can re-execute a non-idempotent tool, and
    // concatenated shape errors would mask the real cause.
    if (typeof h.client.callTool === 'function') {
      // Modern SDK builds accept an object param
      return await h.client.callTool({ name: tool, arguments: args })
    }
    if (typeof h.client.request === 'function') {
      // Older SDK builds only expose the low-level request API
      return await h.client.request(
        { method: 'tools/call', params: { name: tool, arguments: args } },
        CallToolResultSchema,
      )
    }
    throw new Error('MCP client exposes neither callTool nor request; incompatible SDK build')
  }

  async listTools(serverName: string): Promise<unknown> {
    const h = await this.ensure(serverName)
    // Same single-path feature detection as callTool: surface the real error
    // from the one applicable call style instead of a concatenation.
    if (typeof h.client.listTools === 'function') {
      return await h.client.listTools()
    }
    if (typeof h.client.request === 'function') {
      return await h.client.request(
        { method: 'tools/list', params: {} },
        ListToolsResultSchema,
      )
    }
    throw new Error('MCP client exposes neither listTools nor request; incompatible SDK build')
  }

  /**
   * Resolve the log file path for a connected server, if it has one.
   */
  getLogPath(serverName: string): string | undefined {
    const logPath = this.servers.get(serverName)?.spec.logPath
    if (!logPath || !existsSync(logPath)) return undefined
    return resolve(logPath)
  }

  /**
   * Read the last `maxLines` lines of a file without loading the whole file:
   * scan backwards in fixed-size chunks until enough newlines are seen.
   */
  private async readLastLines(filePath: string, maxLines: number): Promise<string[]> {
    const CHUNK_SIZE = 64 * 1024
    const handle = await open(filePath, 'r')
    try {
      const { size } = await handle.stat()
      let position = size
      const chunks: Buffer[] = []
      let newlines = 0
      while (position > 0 && newlines <= maxLines) {
        const length = Math.min(CHUNK_SIZE, position)
        position -= length
        const buffer = Buffer.alloc(length)
        await handle.read(buffer, 0, length, position)
        chunks.unshift(buffer)
        // Counting newline bytes is safe for UTF-8 (0x0A never occurs inside
        // a multi-byte sequence); decode only once at the end.
        for (const byte of buffer) if (byte === 0x0a) newlines++
      }
      const text = Buffer.concat(chunks).toString('utf-8')
      const lines = text.split(/\r?\n/).filter(Boolean)
      return lines.slice(-maxLines)
    } finally {
      await handle.close()
    }
  }

  async readLogs(serverName: string, since?: string, limit = 200): Promise<unknown[]> {
    const logPath = this.getLogPath(serverName)
    if (!logPath) return []
    const selected = await this.readLastLines(logPath, limit)
    const parsed: unknown[] = []
    for (const line of selected) {
      try { parsed.push(JSON.parse(line)) } catch { parsed.push({ parse_error: line }) }
    }
    if (since) {
      const sinceTs = Date.parse(since)
      return parsed.filter((e: any) => Date.parse(e?.timestamp ?? '') >= sinceTs)
    }
    return parsed
  }

  /**
   * Get names of all configured servers.
   */
  getAvailableServers(): string[] {
    this.ensureSpecsLoaded()
    return this.serverSpecs.map(s => s.name)
  }

  /**
   * Get health status for all configured servers.
   */
  getServerHealth(): Array<{ name: string; transport: string; connected: boolean }> {
    this.ensureSpecsLoaded()
    return this.serverSpecs.map(spec => ({
      name: spec.name,
      transport: spec.transport ?? 'stdio',
      connected: this.servers.has(spec.name),
    }))
  }

  /**
   * Get count of configured servers.
   */
  getServerCount(): number {
    this.ensureSpecsLoaded()
    return this.serverSpecs.length
  }
}

export function defaultBootstrap(): ServerSpec[] {
  // Single-server bootstrap via generic environment variables
  // Set MCP_SERVER_DIST to the MCP server entry point and MCP_BASE_PATH for its data dir
  const dist = process.env.MCP_SERVER_DIST
  const base = process.env.MCP_BASE_PATH
  const log = process.env.MCP_LOG_PATH
  if (!dist || !base) return []
  return [{
    name: 'default',
    command: process.execPath,
    args: [dist],
    env: { BASE_PATH: base, MCP_CALL_LOG: log ?? '' },
    logPath: log,
  }]
}
