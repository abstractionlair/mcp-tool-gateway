#!/usr/bin/env node
/**
 * Simple test MCP server with HTTP/SSE transport
 * Used for end-to-end testing HTTP transport support
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { appendFileSync } from 'node:fs'
import express from 'express'

// Simple in-memory store for testing
const store: Record<string, any> = {}

// Logging functionality
const logPath = process.env.MCP_CALL_LOG
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

// Create MCP server
const server = new Server(
  {
    name: 'simple-test-server-http',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

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
server.setRequestHandler(CallToolRequestSchema, async (request) => {
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

// Start HTTP server with SSE transport
async function main() {
  const app = express()
  const port = parseInt(process.env.PORT || '3001', 10)

  // Create SSE transport
  const transport = new SSEServerTransport('/sse', app)

  // Connect server to transport
  await server.connect(transport)

  // Start Express server
  app.listen(port, () => {
    console.error(`Simple test MCP server (HTTP) running on http://localhost:${port}`)
    console.error(`SSE endpoint: http://localhost:${port}/sse`)
  })
}

main().catch((error) => {
  console.error('Server error:', error)
  process.exit(1)
})
