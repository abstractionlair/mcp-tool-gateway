import { ProviderAdapter, MCPTool, MCPToolCall } from './types.js'

/**
 * Gemini function declaration schema
 * Follows Google's function calling format for Gemini API
 */
export interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

/**
 * Gemini tools response format
 */
export interface GeminiToolsResponse {
  function_declarations: GeminiFunctionDeclaration[]
}

/**
 * Adapter for translating MCP tools to Gemini function_declarations format
 *
 * Gemini uses a subset of OpenAPI schema with specific requirements:
 * - Each function must have name, description, and parameters
 * - Parameters must have type: "object" with properties
 * - Supports: type, nullable, required, format, description, properties, items, enum
 * - Does NOT support: default, optional, maximum, oneOf
 */
export class GeminiAdapter implements ProviderAdapter {
  readonly name = 'gemini'

  /**
   * Translate a single MCP tool to Gemini function_declaration format
   */
  translateSchema(mcpTool: MCPTool): GeminiFunctionDeclaration {
    // Extract schema from whichever field it's in (SDK version compatibility)
    const schema = mcpTool.inputSchema ?? mcpTool.parameters ?? mcpTool.schema ?? {}

    // Extract properties and required fields from the schema
    const properties = schema.properties ?? {}
    const required = schema.required ?? []

    return {
      name: mcpTool.name,
      description: mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
      parameters: {
        type: 'object',
        properties: this.sanitizeProperties(properties),
        ...(Array.isArray(required) && required.length > 0 ? { required } : {}),
      },
    }
  }

  /**
   * Translate all MCP tools to Gemini tools response format
   */
  translateAllTools(mcpTools: MCPTool[]): GeminiToolsResponse {
    return {
      function_declarations: mcpTools.map(tool => this.translateSchema(tool)),
    }
  }

  /**
   * Translate Gemini function call to MCP tool call format
   *
   * Gemini sends function calls as: { name: string, args: object }
   * MCP expects: { name: string, arguments: object }
   */
  translateInvocation(providerCall: any): MCPToolCall {
    if (!providerCall || typeof providerCall !== 'object') {
      throw new Error('Invalid Gemini function call: must be an object')
    }

    if (!providerCall.name || typeof providerCall.name !== 'string') {
      throw new Error('Invalid Gemini function call: missing or invalid "name" field')
    }

    return {
      name: providerCall.name,
      arguments: providerCall.args ?? {},
    }
  }

  /**
   * Format MCP execution result for Gemini
   *
   * Gemini expects function responses as plain JSON objects
   * For now, we return the MCP result directly
   */
  formatResult(mcpResult: any): any {
    return mcpResult
  }

  /**
   * Generate human-readable context for prompt injection
   * Formats tool descriptions in a concise, markdown format
   */
  formatForContext(mcpTools: MCPTool[]): string {
    if (!mcpTools || mcpTools.length === 0) {
      return 'No tools available.'
    }

    const toolDescriptions = mcpTools.map((tool, index) => {
      const schema = tool.inputSchema ?? tool.parameters ?? tool.schema ?? {}
      const properties = schema.properties ?? {}
      const required = schema.required ?? []

      // Build parameter list
      const params = Object.entries(properties).map(([name, prop]: [string, any]) => {
        const isRequired = required.includes(name)
        const type = prop.type || 'any'
        const desc = prop.description ? ` - ${prop.description}` : ''
        const requiredMarker = isRequired ? '*' : ''
        return `  - ${name}${requiredMarker}: ${type}${desc}`
      }).join('\n')

      const description = tool.description || `Tool: ${tool.name}`
      const paramSection = params ? `\n${params}` : '\n  (no parameters)'

      return `${index + 1}. **${tool.name}**\n   ${description}${paramSection}`
    }).join('\n\n')

    return `# Available Tools\n\n${toolDescriptions}\n\n*Parameters marked with * are required.`
  }

  /**
   * Sanitize properties to ensure Gemini compatibility
   * - Remove unsupported fields (default, optional, maximum, oneOf)
   * - Recursively process nested objects and arrays
   */
  private sanitizeProperties(properties: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {}

    for (const [key, value] of Object.entries(properties)) {
      if (!value || typeof value !== 'object') {
        sanitized[key] = value
        continue
      }

      const prop: Record<string, any> = {}

      // Copy supported fields
      const supportedFields = ['type', 'nullable', 'format', 'description', 'enum']
      for (const field of supportedFields) {
        if (field in value) {
          prop[field] = value[field]
        }
      }

      // Handle nested properties (for type: object)
      if (value.properties) {
        prop.properties = this.sanitizeProperties(value.properties)
      }

      // Handle required array for nested objects
      if (value.required && Array.isArray(value.required)) {
        prop.required = value.required
      }

      // Handle array items
      if (value.items) {
        if (typeof value.items === 'object') {
          prop.items = this.sanitizeProperty(value.items)
        } else {
          prop.items = value.items
        }
      }

      sanitized[key] = prop
    }

    return sanitized
  }

  /**
   * Sanitize a single property object
   */
  private sanitizeProperty(prop: any): any {
    if (!prop || typeof prop !== 'object') {
      return prop
    }

    const sanitized: Record<string, any> = {}
    const supportedFields = ['type', 'nullable', 'format', 'description', 'enum']

    for (const field of supportedFields) {
      if (field in prop) {
        sanitized[field] = prop[field]
      }
    }

    if (prop.properties) {
      sanitized.properties = this.sanitizeProperties(prop.properties)
    }

    if (prop.items) {
      sanitized.items = this.sanitizeProperty(prop.items)
    }

    if (prop.required && Array.isArray(prop.required)) {
      sanitized.required = prop.required
    }

    return sanitized
  }
}
