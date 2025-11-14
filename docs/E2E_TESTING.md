# End-to-End Testing

This document describes how to run end-to-end (E2E) integration tests.

The test suite includes three types of E2E tests:
1.  **Local E2E Tests with Ollama**: Validates the full workflow using a local LLM. **This is recommended for most development** as it requires no API keys and runs entirely offline.
2.  **API-based E2E Tests with Google Gemini**: Validates the workflow with a real AI provider, making live API calls. This is useful for ensuring compatibility with the specific provider.
3.  **HTTP Transport E2E Tests**: Validates the complete workflow using HTTP/SSE transport instead of stdio, testing remote server connection patterns.

## Setup (important)

Before running any tests for the first time:

```bash
cd node/service
npm ci  # install dev deps (vitest, supertest, provider SDKs, etc.)
```

Notes:
- Provider E2E tests use SDKs in `devDependencies` (e.g., `openai`, `@google/generative-ai`). If you skip installing, you may see errors like: "Failed to load url openai (Does the file exist?)".
- Tests attempt to auto-load API keys from a `.env` at the repository root (../../.env). You can also set env vars directly.

## Local E2E Testing with Ollama

This test validates the complete workflow using a local Ollama LLM, providing a way to test the gateway's logic without external API calls or network dependency.

### Prerequisites

1.  **Build the Test Server**:
    ```bash
    cd node/service/test/fixtures
    npx tsc -p tsconfig.json
    ```

2.  **Install and Run Ollama**:
    - Download and install Ollama from [ollama.com](https://ollama.com/).
    - Start the Ollama server. Typically, this is done by running the Ollama application or via the command line:
      ```bash
      ollama serve
      ```
    - The test will automatically pull the required model (`qwen3:8b` by default) if it's not already available.

### Running the Test

```bash
cd node/service
npm test -- ollama-local-e2e.test.ts
```

The test will connect to your local Ollama instance, run the full tool-use workflow, and execute tool calls against the local test MCP server.

### Python Client E2E Test with Ollama

A Python version of the Ollama E2E test is available that validates the Python client library.

**Prerequisites:**
1. Install Python dependencies:
   ```bash
   cd python
   pip install -e .
   pip install ollama
   ```

2. Install and run Ollama (same as above)

3. Start the gateway service:
   ```bash
   cd node/service
   npm run dev
   ```

**Running the Python E2E Test:**

```bash
cd python
python3 test_e2e_ollama.py
```

**Configuration:**
- `OLLAMA_HOST`: Override default http://127.0.0.1:11434
- `OLLAMA_E2E_MODEL`: Override default model (qwen3:8b)
- `GATEWAY_URL`: Override default http://localhost:8787

**What it tests:**
- Python client `get_tools()` method with Gemini format
- Ollama function calling integration
- Python client `execute()` method for tool execution
- Python client `logs()` method for log verification
- Complete multi-step workflow with string and numeric parameters

This test provides validation that the Python client library works correctly for real-world use cases with Ollama.

## API-based E2E Testing with Google Gemini

This document describes how to run E2E integration tests that make real API calls to AI providers like Google Gemini.

## Overview

The E2E tests validate the complete workflow from tool discovery through AI provider integration to tool execution. These tests use real API calls to ensure the gateway works correctly in production scenarios.

**Test Coverage:**
- Tool discovery via `/tools/gemini` endpoint
- Gemini AI function calling with MCP tools
- Tool execution via `/execute` endpoint
- Multi-step function calling workflows
- Log verification
- State management across multiple tool calls

## Prerequisites

### 1. Build the Test Server

The E2E tests use a simple test MCP server with basic tools (math operations, weather, key-value store).

```bash
cd node/service/test/fixtures
npx tsc -p tsconfig.json
```

This creates `dist/simple-test-server.js` which the tests will use.

#### Test Fixture Design

The `simple-test-server` is a minimal MCP server implementation designed to provide comprehensive test coverage for different tool parameter types and workflow patterns:

**Tools provided:**
- **`add(a, b)`** and **`multiply(a, b)`**: Number parameters for testing arithmetic operations and type handling
- **`get_weather(location)`**: String parameters for testing text-based inputs
- **`store_value(key, value)`** and **`get_value(key)`**: State management for testing multi-step workflows and stateful interactions

**Design rationale:**
- **Minimal dependencies**: Simple TypeScript implementation with no external service dependencies
- **Deterministic results**: Math operations return predictable values for assertion testing
- **State testing**: Key-value store validates that multiple tool calls can share state
- **Multiple parameter types**: Covers numbers, strings, and object types commonly used in MCP tools
- **Logging capability**: Implements `MCP_CALL_LOG` environment variable for execution verification

The test server is available in two variants:
- `simple-test-server.ts`: Stdio transport (default)
- `simple-test-server-http.ts`: HTTP/SSE transport for testing remote connections

### 2. Get a Gemini API Key

You need a Google Gemini API key to run the E2E tests.

**Option A: Get a free API key (Recommended for testing)**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key (starts with `AIza...`)

**Option B: Use Google Cloud Console (For production use)**
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the "Generative Language API"
3. Create credentials (API key)
4. Copy the API key

## Running the Tests

### Secure API Key Handling

**⚠️ SECURITY BEST PRACTICES:**

1. **NEVER commit API keys to git**
   - API keys should only exist in environment variables
   - Do not hardcode keys in test files
   - Do not add keys to any files tracked by git

2. **Use environment variables**
   - Set `GEMINI_API_KEY` in your shell session
   - Or use a `.env` file (already gitignored)

3. **Limit key permissions**
   - Use API keys with minimal required permissions
   - Set usage quotas in Google AI Studio or Cloud Console
   - Rotate keys regularly

### Method 1: Direct Environment Variable (Recommended)

```bash
cd node/service

# Set the API key for this session only
export GEMINI_API_KEY="your_api_key_here"

# Run E2E tests
npm test -- gemini-e2e.test.ts
```

The key will only exist for the current terminal session and won't be stored anywhere.

### Method 2: Using a .env File

Tests will auto-read a `.env` at the repository root (../../.env) if present.

```bash
# At repo root
echo "GEMINI_API_KEY=your_api_key_here" >> .env

cd node/service
npm test -- gemini-e2e.test.ts
```

### Method 3: Inline (For CI/CD or one-off runs)

```bash
cd node/service
GEMINI_API_KEY="your_api_key_here" npm test -- gemini-e2e.test.ts
```

## Test Behavior

### When API Key is Present
- Tests run and make real API calls to Gemini
- Uses `gemini-2.5-flash` model (most cost-effective)
- Typically costs < $0.01 per test run
- Takes 10-30 seconds depending on API latency

### When API Key is Missing
- Tests are automatically skipped (using `describe.skip`)
- A helpful message is printed:
  ```
  ⚠️  Gemini E2E tests skipped: GEMINI_API_KEY not set
  To run these tests:
    GEMINI_API_KEY=your_key npm test -- gemini-e2e.test.ts
  ```
- No errors occur - the test suite passes

## What the Tests Verify

### Test 1: Complete Workflow
1. **Tool Discovery**: Gets tools from gateway in Gemini format
2. **Gemini Function Call**: AI model generates function calls based on prompt
3. **Execution**: Gateway executes tool via MCP server
4. **Response**: Result is sent back to Gemini
5. **Final Answer**: Gemini generates natural language response
6. **Logs**: Verifies MCP calls were logged correctly

### Test 2: Multi-Step Operation
- Tests complex workflows with multiple sequential function calls
- Verifies state management (store_value → get_value)
- Tests arithmetic operations
- Ensures Gemini can chain multiple tool calls

### Test 3: String Parameters
- Tests tools with string parameters (get_weather)
- Verifies parameter type handling
- Tests natural language → structured tool call conversion

## Cost Considerations

The E2E tests use the `gemini-2.5-flash` model which is:
- **Very cost-effective**: ~$0.075 per 1M input tokens, $0.30 per 1M output tokens
- **Fast**: Optimized for speed
- **Sufficient for testing**: Provides reliable function calling

**Estimated costs per full test run: < $0.01**

You can monitor usage at:
- [Google AI Studio](https://makersuite.google.com/app/apikey) → View usage
- [Google Cloud Console](https://console.cloud.google.com/) → Billing

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd node/service
          npm install

      - name: Build test server
        run: |
          cd node/service/test/fixtures
          npx tsc -p tsconfig.json

      - name: Run E2E tests
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: |
          cd node/service
          npm test -- gemini-e2e.test.ts
```

**Setting up secrets:**
1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `GEMINI_API_KEY`
4. Value: Your API key
5. Click "Add secret"

## Troubleshooting

### Tests are skipped
- **Cause**: `GEMINI_API_KEY` not set
- **Solution**: Export the environment variable as shown above

### "Test server not found" error
- **Cause**: Test server not built
- **Solution**: Run `cd node/service/test/fixtures && npx tsc -p tsconfig.json`

### API quota exceeded
- **Cause**: Too many requests or rate limiting
- **Solution**: Wait a few minutes or check quotas in Google AI Studio

### "Invalid API key" error
- **Cause**: Wrong or expired key
- **Solution**: Generate a new key from Google AI Studio

### Tests timeout
- **Cause**: Network issues or slow API responses
- **Solution**: Tests have 30-60s timeouts; check network connection

### "Failed to load url openai (Does the file exist?)"
- **Cause**: Node dependencies not installed in `node/service`
- **Solution**: Run `cd node/service && npm ci` (or `npm install`) to install dev dependencies

## HTTP Transport E2E Testing

The gateway supports both stdio and HTTP/SSE transports for connecting to MCP servers. The HTTP transport E2E test validates the complete workflow using a remote MCP server connection.

### What This Test Validates

The `gemini-http-e2e.test.ts` test verifies:
- Starting an HTTP MCP server on a local port
- Gateway connecting to MCP server via HTTP/SSE transport instead of stdio
- Tool discovery through HTTP transport (`/tools/gemini`)
- Gemini API function calling with HTTP-connected tools
- Tool execution via gateway's `/execute` endpoint with HTTP backend
- Multi-step workflows with HTTP transport
- Log verification for HTTP-based tool calls

### Running HTTP Transport Tests

```bash
cd node/service

# Set your Gemini API key
export GEMINI_API_KEY="your_api_key_here"

# Run HTTP E2E tests
npm test -- gemini-http-e2e.test.ts
```

### How It Works

1. Test spawns `simple-test-server-http.js` as a subprocess on port 3001
2. Gateway creates an HTTP/SSE client connection to `http://localhost:3001/sse`
3. Tools are discovered via the HTTP connection
4. Gemini API is called with the tools
5. Tool executions flow through: Gemini → Gateway → HTTP transport → MCP server
6. Results return through the same HTTP path

### Use Cases for HTTP Transport

- **Remote MCP servers**: Connect to servers running on different machines or in containers
- **Cloud deployments**: MCP servers deployed as microservices
- **Scalability testing**: Validate gateway works with network-based server connections
- **Production patterns**: Test realistic deployment architectures

For detailed HTTP transport configuration and usage, see [HTTP_TRANSPORT.md](./HTTP_TRANSPORT.md).

## API-based E2E Testing with OpenAI

This test validates the workflow with real API calls to the OpenAI API using Chat Completions tool calling.

### Prerequisites

1. Build the Test Server (if not running `npm test`, which builds automatically):
   ```bash
   cd node/service/test/fixtures
   npx tsc -p tsconfig.json
   ```

2. Get an OpenAI API key from https://platform.openai.com/api-keys
   - Recommended model: `gpt-4o-mini` (fast, inexpensive)

### Running the Test

Method 1: direct env var
```bash
cd node/service
export OPENAI_API_KEY="your_key"
npm test -- openai-e2e.test.ts
```

Method 2: .env file at repository root
```bash
# ../../.env (repo root)
OPENAI_API_KEY=your_key

cd node/service
npm test -- openai-e2e.test.ts
```

Behavior:
- If `OPENAI_API_KEY` is not set, the test is auto-skipped with a helpful message.
- Typical runtime: 30–90 seconds; cost is minimal for a single run.

## Adding More E2E Tests

To add tests for other providers (xAI, etc.):

1. Install the provider's SDK if not already present in `devDependencies`.

2. Create a new test file (e.g., `openai-e2e.test.ts`)

3. Follow the same pattern as `gemini-e2e.test.ts`:
   - Skip tests if API key not present
   - Get tools via `/tools/{provider}`
   - Make provider API calls
   - Execute via `/execute` with provider-specific format
   - Verify logs

4. Document in this file

## Security Checklist

Before running E2E tests, verify:

- [ ] API key is not in any tracked files
- [ ] `.env` is in `.gitignore`
- [ ] Using minimum required API permissions
- [ ] Rate limits and quotas are set
- [ ] Running in secure environment (not on shared machines)
- [ ] Keys are rotated periodically

## Questions?

- **Architecture**: See [PLAN.md](./PLAN.md)
- **API Contract**: See [PLAN.md](./PLAN.md#api-contract)
- **Provider Adapters**: See `node/service/src/adapters/`
- **Issues**: Open an issue in the repository
