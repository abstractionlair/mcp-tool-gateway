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
}
