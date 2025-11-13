import { ProviderAdapter, MCPTool, MCPToolCall } from './types.js'

/**
 * xAI function schema
 * Follows xAI's function calling format for Chat Completions API
 */
export interface XAIFunction {
  name: string
  description: string
  parameters: Record<string, any>
}

/**
 * xAI tool definition
 */
export interface XAITool {
  type: 'function'
  function: XAIFunction
}

/**
 * xAI tools response format
 */
export interface XAIToolsResponse {
  tools: XAITool[]
}

/**
 * Adapter for translating MCP tools to xAI tools format
 *
 * xAI uses JSON Schema for function parameters with specific requirements:
 * - Each tool has type: "function" with a nested function object
 * - Function object contains: name, description, parameters
 * - Parameters follow JSON Schema format (more flexible than Gemini)
 * - Supports: all standard JSON Schema features including additionalProperties
 * - Function call arguments come as JSON string that needs parsing
 */
export class XAIAdapter implements ProviderAdapter {
  readonly name = 'xai'

  /**
   * Translate a single MCP tool to xAI tool format
   */
  translateSchema(mcpTool: MCPTool): XAITool {
    // Extract schema from whichever field it's in (SDK version compatibility)
    const schema = mcpTool.inputSchema ?? mcpTool.parameters ?? mcpTool.schema ?? {}

    // Extract properties and required fields from the schema
    const properties = schema.properties ?? {}
    const required = schema.required ?? []

    // Build parameters object using JSON Schema
    const parameters: Record<string, any> = {
      type: 'object',
      properties: this.sanitizeProperties(properties),
    }

    // Add required array if present
    if (Array.isArray(required) && required.length > 0) {
      parameters.required = required
    }

    // Add additionalProperties if present in schema
    if ('additionalProperties' in schema) {
      parameters.additionalProperties = schema.additionalProperties
    }

    return {
      type: 'function',
      function: {
        name: mcpTool.name,
        description: mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
        parameters,
      },
    }
  }

  /**
   * Translate all MCP tools to xAI tools response format
   */
  translateAllTools(mcpTools: MCPTool[]): XAIToolsResponse {
    return {
      tools: mcpTools.map(tool => this.translateSchema(tool)),
    }
  }

  /**
   * Translate xAI function call to MCP tool call format
   *
   * xAI sends function calls as: { name: string, arguments: string }
   * where arguments is a JSON string that needs to be parsed
   * MCP expects: { name: string, arguments: object }
   */
  translateInvocation(providerCall: any): MCPToolCall {
    if (!providerCall || typeof providerCall !== 'object') {
      throw new Error('Invalid xAI function call: must be an object')
    }

    if (!providerCall.name || typeof providerCall.name !== 'string') {
      throw new Error('Invalid xAI function call: missing or invalid "name" field')
    }

    // Parse arguments - xAI sends them as a JSON string
    let parsedArgs: Record<string, any> = {}
    if (providerCall.arguments) {
      if (typeof providerCall.arguments === 'string') {
        try {
          parsedArgs = JSON.parse(providerCall.arguments)
        } catch (error) {
          throw new Error(
            `Invalid xAI function call: arguments field is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      } else if (typeof providerCall.arguments === 'object') {
        // If it's already an object, use it directly (for flexibility)
        parsedArgs = providerCall.arguments
      }
    }

    return {
      name: providerCall.name,
      arguments: parsedArgs,
    }
  }

  /**
   * Format MCP execution result for xAI
   *
   * xAI expects function responses as plain JSON objects
   * For now, we return the MCP result directly
   */
  formatResult(mcpResult: any): any {
    return mcpResult
  }

  /**
   * Sanitize properties to ensure xAI compatibility
   * xAI supports full JSON Schema, but we still sanitize to ensure
   * consistent behavior and remove any problematic fields
   */
  private sanitizeProperties(properties: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {}

    for (const [key, value] of Object.entries(properties)) {
      if (!value || typeof value !== 'object') {
        sanitized[key] = value
        continue
      }

      const prop: Record<string, any> = {}

      // Copy standard JSON Schema fields
      // xAI supports more fields than Gemini
      const supportedFields = [
        'type',
        'description',
        'enum',
        'format',
        'nullable',
        'default',
        'minimum',
        'maximum',
        'minLength',
        'maxLength',
        'pattern',
        'minItems',
        'maxItems',
      ]

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

      // Handle additionalProperties
      if ('additionalProperties' in value) {
        prop.additionalProperties = value.additionalProperties
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
    const supportedFields = [
      'type',
      'description',
      'enum',
      'format',
      'nullable',
      'default',
      'minimum',
      'maximum',
      'minLength',
      'maxLength',
      'pattern',
      'minItems',
      'maxItems',
    ]

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

    if ('additionalProperties' in prop) {
      sanitized.additionalProperties = prop.additionalProperties
    }

    return sanitized
  }
}
