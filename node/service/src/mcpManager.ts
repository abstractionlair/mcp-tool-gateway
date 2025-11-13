import './env.js'
import { ReadStream, createReadStream, existsSync } from 'node:fs'
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

  constructor(private readonly bootstrap: () => ServerSpec[]) {}

  async ensure(serverName: string): Promise<ServerHandle> {
    let handle = this.servers.get(serverName)
    if (handle) return handle

    const spec = this.bootstrap().find(s => s.name === serverName)
    if (!spec) throw new Error(`Unknown server: ${serverName}`)

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
    // Try multiple call paths to accommodate SDK variations
    const errors: string[] = []
    try {
      if (typeof h.client.callTool === 'function') {
        // Some SDK builds accept an object param
        return await h.client.callTool({ name: tool, arguments: args })
      }
    } catch (e: any) { errors.push(String(e?.message ?? e)) }
    try {
      if (typeof h.client.callTool === 'function') {
        // Others accept (name, arguments)
        return await h.client.callTool(tool, args)
      }
    } catch (e: any) { errors.push(String(e?.message ?? e)) }
    try {
      const timeoutOpts = { timeout: 1000 }
      if (typeof h.client.request === 'function') {
        return await h.client.request({ method: 'tools/call', params: { name: tool, arguments: args } }, undefined, timeoutOpts)
      }
    } catch (e: any) { errors.push(String(e?.message ?? e)) }
    throw new Error('MCP callTool failed: ' + errors.join(' | '))
  }

  async listTools(serverName: string): Promise<unknown> {
    const h = await this.ensure(serverName)
    const errors: string[] = []
    const timeoutOpts = { timeout: 1000 }
    try {
      if (typeof h.client.listTools === 'function') {
        return await h.client.listTools()
      }
    } catch (e: any) { errors.push(String(e?.message ?? e)) }
    try {
      if (typeof h.client.request === 'function') {
        return await h.client.request({ method: 'tools/list', params: {} }, undefined, timeoutOpts)
      }
    } catch (e: any) { errors.push(String(e?.message ?? e)) }
    try {
      if (typeof h.client.request === 'function') {
        return await h.client.request('tools/list', {})
      }
    } catch (e: any) { errors.push(String(e?.message ?? e)) }
    throw new Error('MCP listTools failed: ' + errors.join(' | '))
  }

  readLogs(serverName: string, since?: string, limit = 200): unknown[] {
    const h = this.servers.get(serverName)
    const logPath = h?.spec.logPath
    if (!logPath || !existsSync(logPath)) return []
    const data = createReadStream(resolve(logPath), { encoding: 'utf-8' })
    // Simple synchronous read via fs not stream to keep it minimal here
    data.close()
    const text = require('node:fs').readFileSync(logPath, 'utf-8') as string
    const lines = text.split(/\r?\n/).filter(Boolean)
    const selected = lines.slice(-limit)
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
