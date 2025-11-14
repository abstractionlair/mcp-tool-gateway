/**
 * MCP Tool Gateway TypeScript Client
 *
 * A TypeScript client library for interacting with the MCP Tool Gateway service,
 * which provides provider-agnostic access to MCP (Model Context Protocol) servers
 * with support for Gemini, OpenAI, xAI, and other AI providers.
 *
 * @example Usage with Gemini
 * ```typescript
 * import { GatewayClient } from '@mcp-tool-gateway/client';
 * import { GoogleGenerativeAI } from '@google/generative-ai';
 *
 * // Initialize gateway client
 * const gateway = new GatewayClient({ baseUrl: 'http://localhost:8787' });
 *
 * // Get tools in Gemini format
 * const tools = await gateway.getTools('gemini', 'default');
 *
 * // Create Gemini model with tools
 * const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
 * const model = genAI.getGenerativeModel({
 *   model: 'gemini-1.5-pro',
 *   tools: tools.function_declarations
 * });
 *
 * // Generate content and handle function calls
 * const chat = model.startChat();
 * const result = await chat.sendMessage('What tasks do I have?');
 * const response = result.response;
 *
 * // Execute tool calls via gateway
 * if (response.functionCalls()) {
 *   for (const fc of response.functionCalls()) {
 *     const toolResult = await gateway.execute('gemini', {
 *       name: fc.name,
 *       args: fc.args
 *     }, 'default');
 *   }
 * }
 * ```
 *
 * @example Usage with OpenAI
 * ```typescript
 * import { GatewayClient } from '@mcp-tool-gateway/client';
 * import OpenAI from 'openai';
 *
 * const gateway = new GatewayClient({ baseUrl: 'http://localhost:8787' });
 * const tools = await gateway.getTools('openai', 'default');
 *
 * const openai = new OpenAI();
 * const completion = await openai.chat.completions.create({
 *   model: 'gpt-4o-mini',
 *   messages: [{ role: 'user', content: 'What is 15 plus 27?' }],
 *   tools: tools.tools
 * });
 *
 * // Execute tool calls
 * const message = completion.choices[0].message;
 * if (message.tool_calls) {
 *   for (const toolCall of message.tool_calls) {
 *     const result = await gateway.execute('openai', {
 *       name: toolCall.function.name,
 *       arguments: toolCall.function.arguments
 *     }, 'default');
 *   }
 * }
 * ```
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Supported AI providers
 */
export type Provider = 'gemini' | 'openai' | 'xai';

/**
 * Tool schema returned by the gateway (provider-specific format)
 */
export type ToolSchema = Record<string, any>;

/**
 * Result from tool execution (format varies by tool)
 */
export type ExecutionResult = any;

/**
 * Configuration options for the GatewayClient
 */
export interface GatewayOptions {
  /**
   * Base URL of the gateway service (e.g., "http://localhost:8787")
   */
  baseUrl: string;

  /**
   * Request timeout in milliseconds
   * @default 60000 (60 seconds)
   */
  timeoutMs?: number;

  /**
   * Maximum number of retry attempts for failed requests
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial delay between retries in milliseconds
   * @default 1000 (1 second)
   */
  retryDelayMs?: number;

  /**
   * Exponential backoff multiplier for retries
   * @default 2.0
   */
  retryBackoff?: number;
}

/**
 * Log entry from the gateway
 */
export interface LogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Tool name that was executed */
  tool: string;
  /** Tool input arguments */
  input: Record<string, any>;
  /** Tool execution result (if successful) */
  result?: any;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Health status response
 */
export interface HealthStatus {
  /** Boolean indicating if service is healthy */
  ok: boolean;
  /** List of configured servers and their status */
  servers?: Array<{ name: string; status: string }>;
}

// ============================================================================
// Main Client Class
// ============================================================================

/**
 * Client for interacting with the MCP Tool Gateway HTTP API.
 *
 * This client provides methods for discovering tools from MCP servers in
 * provider-specific formats and executing tool calls with automatic retries
 * and error handling.
 *
 * @example
 * ```typescript
 * const client = new GatewayClient({
 *   baseUrl: 'http://localhost:8787',
 *   timeoutMs: 30000,
 *   maxRetries: 5
 * });
 *
 * const tools = await client.getTools('gemini');
 * const result = await client.execute('gemini', {
 *   name: 'add',
 *   args: { a: 1, b: 2 }
 * });
 * ```
 */
export class GatewayClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly retryBackoff: number;

  constructor(options: GatewayOptions) {
    this.baseUrl = options.baseUrl;
    this.timeout = options.timeoutMs ?? 60000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelayMs ?? 1000;
    this.retryBackoff = options.retryBackoff ?? 2.0;
  }

  /**
   * Make an HTTP request with retry logic and error handling
   */
  private async makeRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<any> {
    let delay = this.retryDelay;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Handle HTTP errors
        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let errorMessage = response.statusText;

          // Try to extract error details from response body
          if (contentType?.includes('application/json')) {
            try {
              const errorBody = await response.json();
              errorMessage = errorBody.error || errorMessage;
            } catch {
              // Ignore JSON parsing errors
            }
          } else {
            try {
              const textBody = await response.text();
              if (textBody) {
                errorMessage = textBody;
              }
            } catch {
              // Ignore text parsing errors
            }
          }

          // Don't retry 4xx errors (client errors)
          if (response.status >= 400 && response.status < 500) {
            throw new Error(`Gateway HTTP ${response.status}: ${errorMessage}`);
          }

          lastError = new Error(`Gateway HTTP ${response.status}: ${errorMessage}`);
        } else {
          // Success - return parsed JSON
          return await response.json();
        }
      } catch (error) {
        // Handle network errors and timeouts
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            lastError = new Error(`Request timeout after ${this.timeout}ms`);
          } else if (error.message.includes('Gateway HTTP')) {
            // This is an HTTP error we already formatted, rethrow immediately if 4xx
            if (error.message.includes('HTTP 4')) {
              throw error;
            }
            lastError = error;
          } else {
            lastError = new Error(`Network error: ${error.message}`);
          }
        } else {
          lastError = new Error('Unknown error occurred');
        }
      }

      // If this wasn't the last attempt, wait before retrying
      if (attempt < this.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= this.retryBackoff;
      }
    }

    // All retries exhausted
    throw new Error(
      `Request failed after ${this.maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Get tools from an MCP server in provider-specific format.
   *
   * Retrieves the list of available tools from the specified MCP server,
   * translated into the format expected by the given AI provider.
   *
   * @param provider - The AI provider format ("gemini", "openai", or "xai")
   * @param server - Optional server name (defaults to "default" on gateway)
   * @returns A dictionary containing the tools in provider-specific format:
   *   - Gemini: `{ function_declarations: [...] }`
   *   - OpenAI: `{ tools: [{ type: "function", function: {...} }] }`
   *   - xAI: `{ tools: [{ type: "function", function: {...} }] }`
   * @throws Error if the request fails or the server returns an error
   *
   * @example
   * ```typescript
   * const client = new GatewayClient({ baseUrl: 'http://localhost:8787' });
   *
   * // Get tools for Gemini
   * const geminiTools = await client.getTools('gemini', 'default');
   * console.log(geminiTools.function_declarations[0].name);
   *
   * // Get tools for OpenAI
   * const openaiTools = await client.getTools('openai');
   * console.log(openaiTools.tools[0].function.name);
   * ```
   */
  async getTools(provider: Provider, server?: string): Promise<ToolSchema> {
    let url = `${this.baseUrl}/tools/${provider}`;
    if (server) {
      url += `?server=${encodeURIComponent(server)}`;
    }

    return this.makeRequest(url);
  }

  /**
   * Execute a tool call via the gateway using provider-specific format.
   *
   * Translates a provider-specific tool call to MCP format, executes it
   * on the MCP server, and returns the result.
   *
   * @param provider - The AI provider format ("gemini", "openai", or "xai")
   * @param call - The tool call in provider-specific format:
   *   - Gemini: `{ name: "tool_name", args: {...} }`
   *   - OpenAI: `{ name: "tool_name", arguments: "{...}" }` (JSON string)
   *   - xAI: `{ name: "tool_name", arguments: "{...}" }` (JSON string)
   * @param server - Optional server name (defaults to "default" on gateway)
   * @returns The execution result from the MCP server (format varies by tool)
   * @throws Error if the request fails or the tool execution fails
   *
   * @example Usage with Gemini
   * ```typescript
   * const client = new GatewayClient({ baseUrl: 'http://localhost:8787' });
   * const result = await client.execute('gemini', {
   *   name: 'add',
   *   args: { a: 15, b: 27 }
   * }, 'default');
   * console.log(result); // 42
   * ```
   *
   * @example Usage with OpenAI
   * ```typescript
   * const result = await client.execute('openai', {
   *   name: 'add',
   *   arguments: '{"a": 15, "b": 27}' // Note: JSON string
   * }, 'default');
   * console.log(result); // 42
   * ```
   */
  async execute(
    provider: Provider,
    call: Record<string, any>,
    server?: string
  ): Promise<ExecutionResult> {
    const url = `${this.baseUrl}/execute`;
    const payload: Record<string, any> = {
      provider,
      call
    };
    if (server) {
      payload.server = server;
    }

    const response = await this.makeRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Check for errors in response
    if (response.error) {
      throw new Error(response.error);
    }

    return response.result;
  }

  /**
   * Execute a tool using the legacy generic format.
   *
   * This method uses the generic `/call_tool` endpoint which doesn't require
   * provider-specific formatting. Useful for direct MCP tool invocation.
   *
   * @param server - The MCP server name
   * @param tool - The tool name to execute
   * @param args - The tool arguments as an object
   * @returns The execution result from the MCP server
   * @throws Error if the request fails or the tool execution fails
   *
   * @example
   * ```typescript
   * const client = new GatewayClient({ baseUrl: 'http://localhost:8787' });
   * const result = await client.callTool('default', 'add', { a: 10, b: 20 });
   * console.log(result); // 30
   * ```
   *
   * @remarks
   * For provider-specific workflows, prefer using `execute()` with the
   * appropriate provider format instead of this method.
   */
  async callTool(
    server: string,
    tool: string,
    args: Record<string, any>
  ): Promise<any> {
    const url = `${this.baseUrl}/call_tool`;
    const payload = { server, tool, arguments: args };

    const response = await this.makeRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.result;
  }

  /**
   * Get raw MCP tool schemas (not provider-specific).
   *
   * Returns the tools in their original MCP format without any provider-specific
   * translation. Useful for debugging or when you need the raw schema.
   *
   * @param server - Optional server name (defaults to "default" on gateway)
   * @returns Dictionary containing raw MCP tool schemas
   * @throws Error if the request fails
   *
   * @example
   * ```typescript
   * const client = new GatewayClient({ baseUrl: 'http://localhost:8787' });
   * const mcpTools = await client.tools('default');
   * console.log(mcpTools);
   * ```
   *
   * @remarks
   * For provider-specific formats, use `getTools(provider)` instead.
   */
  async tools(server?: string): Promise<Record<string, any>> {
    let url = `${this.baseUrl}/tools`;
    if (server) {
      url += `?server=${encodeURIComponent(server)}`;
    }

    return this.makeRequest(url);
  }

  /**
   * Retrieve execution logs from the gateway.
   *
   * Returns recent tool execution logs from the specified MCP server,
   * useful for debugging and monitoring.
   *
   * @param server - The MCP server name
   * @param since - Optional ISO 8601 timestamp to filter logs after this time
   * @param limit - Maximum number of log entries to return (default: 100)
   * @returns List of log entries, each containing:
   *   - timestamp: ISO 8601 timestamp
   *   - tool: Tool name that was executed
   *   - input: Tool input arguments
   *   - result: Tool execution result (if successful)
   *   - error: Error message (if failed)
   * @throws Error if the request fails
   *
   * @example
   * ```typescript
   * const client = new GatewayClient({ baseUrl: 'http://localhost:8787' });
   * const logs = await client.logs('default', undefined, 10);
   * for (const entry of logs) {
   *   console.log(`${entry.timestamp}: ${entry.tool} - ${entry.result}`);
   * }
   * ```
   */
  async logs(
    server: string,
    since?: string,
    limit: number = 100
  ): Promise<LogEntry[]> {
    const params = new URLSearchParams({
      server,
      limit: limit.toString()
    });
    if (since) {
      params.set('since', since);
    }

    const url = `${this.baseUrl}/logs?${params.toString()}`;
    return this.makeRequest(url);
  }

  /**
   * Check the health status of the gateway service.
   *
   * @returns Dictionary containing health information:
   *   - ok: Boolean indicating if service is healthy
   *   - servers: List of configured servers and their status
   * @throws Error if the request fails
   *
   * @example
   * ```typescript
   * const client = new GatewayClient({ baseUrl: 'http://localhost:8787' });
   * const status = await client.health();
   * if (status.ok) {
   *   console.log('Gateway is healthy');
   * }
   * console.log(`Servers: ${status.servers}`);
   * ```
   */
  async health(): Promise<HealthStatus> {
    const url = `${this.baseUrl}/health`;
    return this.makeRequest(url);
  }
}
