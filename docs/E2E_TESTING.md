# End-to-End Testing with Real AI Providers

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

```bash
cd node/service

# Create .env file (already in .gitignore)
echo "GEMINI_API_KEY=your_api_key_here" > .env

# Load and run tests (if using dotenv or similar)
# Note: Current setup uses direct env vars, may need to add dotenv support
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
- Uses `gemini-1.5-flash` model (most cost-effective)
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

The E2E tests use the `gemini-1.5-flash` model which is:
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

## Adding More E2E Tests

To add tests for other providers (OpenAI, xAI):

1. Install the provider's SDK:
   ```bash
   npm install --save-dev openai  # or other SDK
   ```

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
