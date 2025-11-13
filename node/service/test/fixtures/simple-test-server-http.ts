#!/usr/bin/env node
/**
 * Simple test MCP server with HTTP/SSE transport
 * Used for end-to-end testing HTTP transport support
 */

import { Protocol } from '@modelcontextprotocol/sdk/shared/protocol.js'
import {
  CallToolRequestSchema,
  JSONRPCMessageSchema,
  InitializeRequestSchema,
  ListToolsRequestSchema,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js'
import { appendFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { IncomingMessage, ServerResponse } from 'node:http'
import { URL } from 'node:url'
import type { z } from 'zod'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

console.error('[HTTP SERVER] File is being loaded')

/**
 * Minimal SSE transport used only for test fixtures to avoid slow imports from the SDK's
 * Streamable HTTP transport. Supports a single GET stream and POST endpoint per process.
 */
class BasicHttpTransport implements Transport {
  private sseClients = new Set<ServerResponse>()
  private pendingChunks: string[] = []

  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage, extra?: any) => void

  async start() {
    // No-op for this in-process transport
  }

  async send(message: JSONRPCMessage) {
    const chunk = `data: ${JSON.stringify(message)}\n\n`
    if (this.sseClients.size === 0) {
      this.pendingChunks.push(chunk)
      return
    }

    for (const client of this.sseClients) {
      client.write(chunk)
    }
  }

  async close() {
    for (const client of this.sseClients) {
      client.end()
    }
    this.sseClients.clear()
    this.onclose?.()
  }

  attachSseClient(res: ServerResponse, endpointPath: string) {
    this.sseClients.add(res)
    res.on('close', () => {
      this.sseClients.delete(res)
    })

    res.write(`event: endpoint\ndata: ${endpointPath}\n\n`)

    if (this.pendingChunks.length > 0) {
      for (const chunk of this.pendingChunks) {
        res.write(chunk)
      }
      this.pendingChunks = []
    }
  }

  async handleIncoming(body: unknown, req: IncomingMessage) {
    const messages = Array.isArray(body) ? body : [body]

    for (const raw of messages) {
      try {
        const parsed = JSONRPCMessageSchema.parse(raw)
        await this.onmessage?.(parsed, { requestInfo: { headers: req.headers } })
      } catch (error) {
        this.onerror?.(error as Error)
      }
    }
  }
}

// Simple in-memory store for testing
const store: Record<string, any> = {}

// Logging functionality
const logPath = process.env.MCP_CALL_LOG
type InitializeRequest = z.infer<typeof InitializeRequestSchema>
type CallToolRequest = z.infer<typeof CallToolRequestSchema>

function logToolCall(tool: string, args: any, result: any) {
  if (!logPath) return
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      tool,
      arguments: args,
      result,
    }
    appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8')
  } catch (error) {
    console.error('Failed to write log:', error)
  }
}

class BasicServer extends Protocol<any, any, any> {
  // Allow all request/notification handlers for this minimal test server
  assertNotificationCapability(_method: string) {
    // Intentionally left blank
  }

  assertRequestHandlerCapability(_method: string) {
    // Intentionally left blank
  }

  assertCapabilityForMethod(_method: string) {
    // Intentionally left blank
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []

  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve())
    req.on('error', (error) => reject(error))
  })

  const raw = Buffer.concat(chunks).toString('utf-8') || 'null'
  return JSON.parse(raw)
}

const serverInfo = {
  name: 'simple-test-server-http',
  version: '1.0.0',
}

const serverCapabilities = {
  tools: {},
}

// Create MCP server
const server = new BasicServer()

// Handle initialization manually since we're bypassing the higher-level Server helper.
server.setRequestHandler(InitializeRequestSchema, (request: InitializeRequest) => {
  const requestedVersion = request.params.protocolVersion
  const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
    ? requestedVersion
    : LATEST_PROTOCOL_VERSION

  return {
    protocolVersion,
    capabilities: serverCapabilities,
    serverInfo,
  }
})

// Define tools (same as stdio version)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'add',
        description: 'Add two numbers together',
        inputSchema: {
          type: 'object',
          properties: {
            a: {
              type: 'number',
              description: 'First number',
            },
            b: {
              type: 'number',
              description: 'Second number',
            },
          },
          required: ['a', 'b'],
        },
      },
      {
        name: 'multiply',
        description: 'Multiply two numbers',
        inputSchema: {
          type: 'object',
          properties: {
            a: {
              type: 'number',
              description: 'First number',
            },
            b: {
              type: 'number',
              description: 'Second number',
            },
          },
          required: ['a', 'b'],
        },
      },
      {
        name: 'get_weather',
        description: 'Get current weather for a location (mock data)',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City name',
            },
          },
          required: ['location'],
        },
      },
      {
        name: 'store_value',
        description: 'Store a value in memory',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Storage key',
            },
            value: {
              type: 'string',
              description: 'Value to store',
            },
          },
          required: ['key', 'value'],
        },
      },
      {
        name: 'get_value',
        description: 'Get a stored value from memory',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Storage key',
            },
          },
          required: ['key'],
        },
      },
    ],
  }
})

// Handle tool calls (same as stdio version)
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params

  switch (name) {
    case 'add': {
      const { a, b } = args as { a: number; b: number }
      const result = a + b
      const response = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ result, operation: 'add', a, b }),
          },
        ],
      }
      logToolCall(name, args, response)
      return response
    }

    case 'multiply': {
      const { a, b } = args as { a: number; b: number }
      const result = a * b
      const response = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ result, operation: 'multiply', a, b }),
          },
        ],
      }
      logToolCall(name, args, response)
      return response
    }

    case 'get_weather': {
      const { location } = args as { location: string }
      // Mock weather data
      const weather = {
        location,
        temperature: 72,
        conditions: 'sunny',
        humidity: 45,
      }
      const response = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(weather),
          },
        ],
      }
      logToolCall(name, args, response)
      return response
    }

    case 'store_value': {
      const { key, value } = args as { key: string; value: string }
      store[key] = value
      const response = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, key, value }),
          },
        ],
      }
      logToolCall(name, args, response)
      return response
    }

    case 'get_value': {
      const { key } = args as { key: string }
      const value = store[key]
      const response = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ key, value: value ?? null }),
          },
        ],
      }
      logToolCall(name, args, response)
      return response
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

// Start HTTP server with Streamable HTTP transport
async function main() {
  console.error('main() started')
  const port = parseInt(process.env.PORT || '3001', 10)

  console.error(`Creating basic HTTP transport for port ${port}`)
  const transport = new BasicHttpTransport()
  console.error('Basic HTTP transport created')

  // Connect server to transport
  console.error('Connecting server to transport...')
  await server.connect(transport)
  console.error('Server connected to transport')

  // Handle all MCP requests on /sse endpoint (both GET for SSE and POST for messages)
  const httpServer = createServer((req, res) => {
    void (async () => {
      try {
        if (!req.url) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing URL' }))
          return
        }

        const requestUrl = new URL(req.url, `http://localhost:${port}`)
        if (requestUrl.pathname !== '/sse') {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Not Found' }))
          return
        }

        console.error(`Received ${req.method} request to /sse`)

        if (req.method === 'GET') {
          const acceptHeader = req.headers.accept ?? ''
          if (!acceptHeader.includes('text/event-stream')) {
            res.writeHead(406, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Client must accept text/event-stream' }))
            return
          }

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          })
          res.flushHeaders?.()
          transport.attachSseClient(res, '/sse')
          return
        }

        if (req.method === 'POST') {
          const contentType = req.headers['content-type'] ?? ''
          if (!contentType.includes('application/json')) {
            res.writeHead(415, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Content-Type must be application/json' }))
            return
          }

          const body = await readJsonBody(req)
          await transport.handleIncoming(body, req)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
          return
        }

        res.writeHead(405, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method Not Allowed' }))
      } catch (error) {
        console.error('Failed to handle HTTP request:', error)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Internal server error' }))
        } else {
          res.end()
        }
      }
    })()
  })

  // Start HTTP server
  httpServer.listen(port, () => {
    console.error(`Simple test MCP server (HTTP) running on http://localhost:${port}`)
    console.error(`SSE endpoint: http://localhost:${port}/sse`)
  })
}

console.error('About to call main()')
main().catch((error) => {
  console.error('Server error:', error)
  process.exit(1)
})
