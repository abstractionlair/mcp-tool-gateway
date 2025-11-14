/**
 * MCP Tool Schema (from @modelcontextprotocol/sdk)
 * Represents a tool as returned by the MCP client
 */
export interface MCPTool {
  name: string
  description?: string
  inputSchema?: Record<string, any>
  // Some SDK versions may use 'parameters' or 'schema' instead
  parameters?: Record<string, any>
  schema?: Record<string, any>
}

/**
 * MCP tool invocation format
 * Used to call tools via the MCP client
 */
export interface MCPToolCall {
  name: string
  arguments: Record<string, any>
}

/**
 * Base interface for provider-specific adapters
 * Each adapter translates between MCP tool schemas and provider-specific formats
 */
export interface ProviderAdapter {
  /**
   * Provider name (e.g., "gemini", "openai", "xai")
   */
  readonly name: string

  /**
   * Translate a single MCP tool schema to provider-specific format
   * @param mcpTool The MCP tool to translate
   * @returns Provider-specific tool schema
   */
  translateSchema(mcpTool: MCPTool): any

  /**
   * Translate all MCP tools to provider-specific response format
   * @param mcpTools Array of MCP tools
   * @returns Provider-specific tools response (e.g., { function_declarations: [...] })
   */
  translateAllTools(mcpTools: MCPTool[]): any

  /**
   * Translate provider-specific function call to MCP format
   * @param providerCall Provider-specific call format (e.g., { name, args } for Gemini)
   * @returns MCP tool call format
   */
  translateInvocation(providerCall: any): MCPToolCall

  /**
   * Format MCP execution result for provider
   * @param mcpResult Raw result from MCP tool execution
   * @returns Provider-specific result format
   */
  formatResult(mcpResult: any): any

  /**
   * Generate human-readable context for prompt injection
   * Formats tool descriptions in a concise, context-efficient manner
   * @param mcpTools Array of MCP tools
   * @returns Human-readable tool descriptions (plain text or markdown)
   */
  formatForContext(mcpTools: MCPTool[]): string
}
