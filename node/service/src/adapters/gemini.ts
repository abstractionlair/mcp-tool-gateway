import { ProviderAdapter, MCPTool } from './types.js'

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
