import { describe, it, expect } from 'vitest'
import { GeminiAdapter } from '../src/adapters/gemini.js'
import { MCPTool } from '../src/adapters/types.js'

describe('GeminiAdapter', () => {
  const adapter = new GeminiAdapter()

  describe('translateSchema', () => {
    it('translates basic MCP tool with inputSchema', () => {
      const mcpTool: MCPTool = {
        name: 'query_nodes',
        description: 'Query nodes from the graph',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum results',
            },
          },
          required: ['query'],
        },
      }

      const result = adapter.translateSchema(mcpTool)

      expect(result).toEqual({
        name: 'query_nodes',
        description: 'Query nodes from the graph',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum results',
            },
          },
          required: ['query'],
        },
      })
    })

    it('handles tool with parameters field instead of inputSchema', () => {
      const mcpTool: MCPTool = {
        name: 'create_node',
        description: 'Create a new node',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
            },
          },
        },
      }

      const result = adapter.translateSchema(mcpTool)

      expect(result.name).toBe('create_node')
      expect(result.parameters.properties.content).toEqual({ type: 'string' })
    })

    it('provides default description if missing', () => {
      const mcpTool: MCPTool = {
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      }

      const result = adapter.translateSchema(mcpTool)

      expect(result.description).toBe('MCP tool: test_tool')
    })

    it('omits required array when empty', () => {
      const mcpTool: MCPTool = {
        name: 'test_tool',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: {
            optional: { type: 'string' },
          },
          required: [],
        },
      }

      const result = adapter.translateSchema(mcpTool)

      expect(result.parameters.required).toBeUndefined()
    })

    it('handles nested object properties', () => {
      const mcpTool: MCPTool = {
        name: 'complex_tool',
        description: 'Complex tool with nested properties',
        inputSchema: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                enabled: { type: 'boolean' },
              },
              required: ['name'],
            },
          },
        },
      }

      const result = adapter.translateSchema(mcpTool)

      expect(result.parameters.properties.config).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          enabled: { type: 'boolean' },
        },
        required: ['name'],
      })
    })

    it('handles array properties with items', () => {
      const mcpTool: MCPTool = {
        name: 'array_tool',
        description: 'Tool with array parameter',
        inputSchema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },
      }

      const result = adapter.translateSchema(mcpTool)

      expect(result.parameters.properties.tags).toEqual({
        type: 'array',
        items: { type: 'string' },
      })
    })

    it('handles enum properties', () => {
      const mcpTool: MCPTool = {
        name: 'enum_tool',
        description: 'Tool with enum',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'completed', 'cancelled'],
              description: 'Task status',
            },
          },
        },
      }

      const result = adapter.translateSchema(mcpTool)

      expect(result.parameters.properties.status).toEqual({
        type: 'string',
        enum: ['pending', 'completed', 'cancelled'],
        description: 'Task status',
      })
    })

    it('removes unsupported fields like default and oneOf', () => {
      const mcpTool: MCPTool = {
        name: 'unsupported_fields',
        description: 'Tool with unsupported fields',
        inputSchema: {
          type: 'object',
          properties: {
            field1: {
              type: 'string',
              default: 'test', // Unsupported by Gemini
            },
            field2: {
              oneOf: [ // Unsupported by Gemini
                { type: 'string' },
                { type: 'number' },
              ],
            },
            field3: {
              type: 'number',
              maximum: 100, // Unsupported by Gemini
            },
          },
        },
      }

      const result = adapter.translateSchema(mcpTool)

      // Supported field 'type' should remain
      expect(result.parameters.properties.field1.type).toBe('string')
      expect(result.parameters.properties.field3.type).toBe('number')

      // Unsupported fields should be removed
      expect(result.parameters.properties.field1.default).toBeUndefined()
      expect(result.parameters.properties.field2.oneOf).toBeUndefined()
      expect(result.parameters.properties.field3.maximum).toBeUndefined()
    })
  })

  describe('translateAllTools', () => {
    it('translates multiple tools to Gemini format', () => {
      const mcpTools: MCPTool[] = [
        {
          name: 'tool1',
          description: 'First tool',
          inputSchema: {
            type: 'object',
            properties: { arg1: { type: 'string' } },
          },
        },
        {
          name: 'tool2',
          description: 'Second tool',
          inputSchema: {
            type: 'object',
            properties: { arg2: { type: 'number' } },
          },
        },
      ]

      const result = adapter.translateAllTools(mcpTools)

      expect(result).toHaveProperty('function_declarations')
      expect(result.function_declarations).toHaveLength(2)
      expect(result.function_declarations[0].name).toBe('tool1')
      expect(result.function_declarations[1].name).toBe('tool2')
    })

    it('returns empty function_declarations for empty array', () => {
      const result = adapter.translateAllTools([])

      expect(result).toEqual({ function_declarations: [] })
    })
  })

  describe('provider name', () => {
    it('has correct provider name', () => {
      expect(adapter.name).toBe('gemini')
    })
  })
})
