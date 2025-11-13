#!/usr/bin/env node
/**
 * Simple test MCP server with basic math operations
 * Used for end-to-end testing with real AI providers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

// Simple in-memory store for testing
const store: Record<string, any> = {}

// Create MCP server
const server = new Server(
  {
    name: 'simple-test-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// Define tools
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

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    case 'add': {
      const { a, b } = args as { a: number; b: number }
      const result = a + b
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ result, operation: 'add', a, b }),
          },
        ],
      }
    }

    case 'multiply': {
      const { a, b } = args as { a: number; b: number }
      const result = a * b
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ result, operation: 'multiply', a, b }),
          },
        ],
      }
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
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(weather),
          },
        ],
      }
    }

    case 'store_value': {
      const { key, value } = args as { key: string; value: string }
      store[key] = value
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, key, value }),
          },
        ],
      }
    }

    case 'get_value': {
      const { key } = args as { key: string }
      const value = store[key]
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ key, value: value ?? null }),
          },
        ],
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

// Start server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Simple test MCP server running on stdio')
}

main().catch((error) => {
  console.error('Server error:', error)
  process.exit(1)
})
