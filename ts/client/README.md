# MCP Tool Gateway - TypeScript Client

A TypeScript client library for interacting with the MCP Tool Gateway service, providing type-safe access to MCP (Model Context Protocol) servers with support for Gemini, OpenAI, xAI, and other AI providers.

## Features

- ✅ **Type-safe** - Full TypeScript support with detailed type definitions
- ✅ **Provider support** - Gemini, OpenAI, xAI formats
- ✅ **Automatic retries** - Configurable retry logic with exponential backoff
- ✅ **Error handling** - Comprehensive error handling and timeout support
- ✅ **Well documented** - JSDoc comments and usage examples
- ✅ **Tested** - 22 unit tests with full coverage

## Installation

```bash
npm install @mcp-tool-gateway/client
```

## Quick Start

```typescript
import { GatewayClient } from '@mcp-tool-gateway/client';

// Initialize the client
const gateway = new GatewayClient({
  baseUrl: 'http://localhost:8787'
});

// Get tools in Gemini format
const tools = await gateway.getTools('gemini', 'default');

// Execute a tool call
const result = await gateway.execute('gemini', {
  name: 'add',
  args: { a: 15, b: 27 }
}, 'default');

console.log(result); // 42
```

## API Reference

### Constructor

```typescript
new GatewayClient(options: GatewayOptions)
```

**Options:**
- `baseUrl` (required): Base URL of the gateway service
- `timeoutMs` (optional): Request timeout in milliseconds (default: 60000)
- `maxRetries` (optional): Maximum retry attempts (default: 3)
- `retryDelayMs` (optional): Initial retry delay in milliseconds (default: 1000)
- `retryBackoff` (optional): Exponential backoff multiplier (default: 2.0)

**Example:**
```typescript
const client = new GatewayClient({
  baseUrl: 'http://localhost:8787',
  timeoutMs: 30000,
  maxRetries: 5,
  retryDelayMs: 2000,
  retryBackoff: 2.5
});
```

### Methods

#### `getTools(provider, server?)`

Get tools from an MCP server in provider-specific format.

**Parameters:**
- `provider`: `'gemini' | 'openai' | 'xai'`
- `server` (optional): Server name (defaults to "default")

**Returns:** Provider-specific tool schema

**Example:**
```typescript
// Gemini format
const geminiTools = await client.getTools('gemini', 'default');
// Returns: { function_declarations: [...] }

// OpenAI format
const openaiTools = await client.getTools('openai');
// Returns: { tools: [{ type: 'function', function: {...} }] }
```

#### `execute(provider, call, server?)`

Execute a tool call via the gateway.

**Parameters:**
- `provider`: `'gemini' | 'openai' | 'xai'`
- `call`: Tool call in provider-specific format
- `server` (optional): Server name

**Returns:** Execution result from the MCP server

**Example:**
```typescript
// Gemini
const geminiResult = await client.execute('gemini', {
  name: 'add',
  args: { a: 15, b: 27 }
}, 'default');

// OpenAI (note: arguments is a JSON string)
const openaiResult = await client.execute('openai', {
  name: 'add',
  arguments: '{"a": 15, "b": 27}'
});
```

#### `callTool(server, tool, args)`

Execute a tool using the legacy generic format.

**Parameters:**
- `server`: MCP server name
- `tool`: Tool name
- `args`: Tool arguments object

**Returns:** Execution result

**Example:**
```typescript
const result = await client.callTool('default', 'add', { a: 10, b: 20 });
// Returns: 30
```

#### `tools(server?)`

Get raw MCP tool schemas (not provider-specific).

**Parameters:**
- `server` (optional): Server name

**Returns:** Raw MCP tool schemas

**Example:**
```typescript
const mcpTools = await client.tools('default');
```

#### `logs(server, since?, limit?)`

Retrieve execution logs from the gateway.

**Parameters:**
- `server`: MCP server name
- `since` (optional): ISO 8601 timestamp to filter logs
- `limit` (optional): Maximum log entries (default: 100)

**Returns:** Array of log entries

**Example:**
```typescript
const logs = await client.logs('default', '2025-01-01T00:00:00Z', 50);

for (const entry of logs) {
  console.log(`${entry.timestamp}: ${entry.tool} - ${entry.result}`);
}
```

#### `health()`

Check the health status of the gateway service.

**Returns:** Health status object

**Example:**
```typescript
const status = await client.health();

if (status.ok) {
  console.log('Gateway is healthy');
  console.log('Servers:', status.servers);
}
```

## Usage with AI Providers

### Gemini

```typescript
import { GatewayClient } from '@mcp-tool-gateway/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const gateway = new GatewayClient({ baseUrl: 'http://localhost:8787' });

// Get tools in Gemini format
const tools = await gateway.getTools('gemini', 'default');

// Create Gemini model with tools
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash-exp',
  tools: tools.function_declarations
});

// Start a chat
const chat = model.startChat();
let response = await chat.sendMessage('What tasks do I have?');

// Handle function calls
while (response.functionCalls()?.length > 0) {
  const functionCalls = response.functionCalls()!;

  // Execute each function call via the gateway
  const functionResponses = await Promise.all(
    functionCalls.map(async (fc) => {
      const result = await gateway.execute('gemini', {
        name: fc.name,
        args: fc.args
      }, 'default');

      return {
        name: fc.name,
        response: result
      };
    })
  );

  // Send results back to the model
  response = await chat.sendMessage(
    functionResponses.map(fr => ({
      functionResponse: fr
    }))
  );
}

console.log(response.text());
```

### OpenAI

```typescript
import { GatewayClient } from '@mcp-tool-gateway/client';
import OpenAI from 'openai';

const gateway = new GatewayClient({ baseUrl: 'http://localhost:8787' });

// Get tools in OpenAI format
const tools = await gateway.getTools('openai', 'default');

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Make a request with tools
let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: 'user', content: 'What is 15 plus 27?' }
];

let response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  tools: tools.tools
});

// Handle tool calls
while (response.choices[0].finish_reason === 'tool_calls') {
  const message = response.choices[0].message;
  messages.push(message);

  if (message.tool_calls) {
    // Execute each tool call via the gateway
    for (const toolCall of message.tool_calls) {
      const result = await gateway.execute('openai', {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments
      }, 'default');

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }

    // Get next response
    response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: tools.tools
    });
  }
}

console.log(response.choices[0].message.content);
```

### xAI (Grok)

```typescript
import { GatewayClient } from '@mcp-tool-gateway/client';
import OpenAI from 'openai';

const gateway = new GatewayClient({ baseUrl: 'http://localhost:8787' });

// Get tools in xAI format
const tools = await gateway.getTools('xai', 'default');

// Create xAI client (uses OpenAI SDK)
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

// Make a request with tools
let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: 'user', content: 'Calculate 42 times 13' }
];

let response = await xai.chat.completions.create({
  model: 'grok-beta',
  messages,
  tools: tools.tools
});

// Handle tool calls (same pattern as OpenAI)
while (response.choices[0].finish_reason === 'tool_calls') {
  const message = response.choices[0].message;
  messages.push(message);

  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      const result = await gateway.execute('xai', {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments
      }, 'default');

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }

    response = await xai.chat.completions.create({
      model: 'grok-beta',
      messages,
      tools: tools.tools
    });
  }
}

console.log(response.choices[0].message.content);
```

## Error Handling

The client automatically handles:

- **Network errors** - Retries with exponential backoff
- **Timeouts** - Configurable request timeouts
- **HTTP errors** - Proper error messages with status codes
- **4xx errors** - No retry (client errors)
- **5xx errors** - Automatic retry (server errors)

**Example:**
```typescript
try {
  const result = await client.execute('gemini', {
    name: 'nonexistent_tool',
    args: {}
  });
} catch (error) {
  if (error instanceof Error) {
    console.error('Error:', error.message);
    // Handle error appropriately
  }
}
```

## Type Definitions

The client exports the following types:

```typescript
// Supported providers
type Provider = 'gemini' | 'openai' | 'xai';

// Tool schema (provider-specific format)
type ToolSchema = Record<string, any>;

// Execution result
type ExecutionResult = any;

// Gateway options
interface GatewayOptions {
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  retryBackoff?: number;
}

// Log entry
interface LogEntry {
  timestamp: string;
  tool: string;
  input: Record<string, any>;
  result?: any;
  error?: string;
}

// Health status
interface HealthStatus {
  ok: boolean;
  servers?: Array<{ name: string; status: string }>;
}
```

## Testing

The client includes comprehensive unit tests:

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Building

```bash
# Build the client
npm run build

# Output will be in the dist/ directory
# - dist/index.js (compiled JavaScript)
# - dist/index.d.ts (TypeScript definitions)
```

## Requirements

- Node.js 18+ (for native `fetch` support)
- TypeScript 5.6+ (if using TypeScript)

## License

MIT

## See Also

- [MCP Tool Gateway](../../README.md) - Main gateway documentation
- [Python Client](../../python/) - Python client library
- [API Documentation](../../docs/PLAN.md) - Full API reference
