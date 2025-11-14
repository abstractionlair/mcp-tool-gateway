# Python Client E2E Test with Ollama

This directory contains an end-to-end integration test for the MCP Tool Gateway Python client library using Ollama as the LLM provider.

## Overview

The test (`test_e2e_ollama.py`) validates the complete workflow:

1. **Tool Discovery**: Uses `GatewayClient.get_tools()` to fetch available MCP tools in Gemini format
2. **LLM Integration**: Sends tools to Ollama which generates function calls based on natural language prompts
3. **Tool Execution**: Uses `GatewayClient.execute()` to execute the function calls via the gateway
4. **Result Processing**: Sends execution results back to Ollama for final response generation
5. **Log Verification**: Uses `GatewayClient.logs()` to verify tool calls were properly logged

## Prerequisites

### 1. Install Ollama

Download and install Ollama from [ollama.com](https://ollama.com/):

```bash
# On macOS or Linux
curl -fsSL https://ollama.com/install.sh | sh

# Start the Ollama server
ollama serve
```

The test will automatically pull the required model (`qwen3:8b` by default) on first run.

### 2. Install Python Dependencies

```bash
cd python
pip install -e .        # Install the gateway client
pip install ollama      # Install Ollama Python package
```

### 3. Build the Test MCP Server

```bash
cd node/service/test/fixtures
npx tsc -p tsconfig.json
```

This creates `dist/simple-test-server.js` which provides test tools (add, multiply, get_weather, store_value, get_value).

### 4. Start the Gateway Service

In a separate terminal:

```bash
cd node/service
npm install   # if not already done
npm run dev
```

The gateway should be running on `http://localhost:8787`.

## Running the Test

```bash
cd python
python3 test_e2e_ollama.py
```

The test will:
- Connect to Ollama at `http://127.0.0.1:11434` (default)
- Pull the model if needed (first run may take a few minutes)
- Connect to the gateway at `http://localhost:8787`
- Run 3 test scenarios:
  1. **Math Operation**: Tests the `add` tool with numeric parameters
  2. **Weather Query**: Tests the `get_weather` tool with string parameters
  3. **Log Verification**: Confirms tool executions are properly logged

## Configuration

Override defaults with environment variables:

```bash
# Use a different Ollama host
export OLLAMA_HOST=http://remote-server:11434

# Use a different model
export OLLAMA_E2E_MODEL=llama3.2:3b

# Use a different gateway URL
export GATEWAY_URL=http://localhost:3000

# Run the test
python3 test_e2e_ollama.py
```

## Expected Output

The test provides colorful, detailed output:

```
Ollama E2E Test for MCP Tool Gateway Python Client
Model: qwen3:8b
Ollama Host: http://127.0.0.1:11434
Gateway URL: http://localhost:8787

============================================================
Setting Up E2E Test Environment
============================================================

[INFO] Checking Ollama at http://127.0.0.1:11434
[SUCCESS] Ollama is accessible at http://127.0.0.1:11434
[INFO] Checking for model: qwen3:8b
[SUCCESS] Model qwen3:8b is available
[INFO] Checking gateway at http://localhost:8787
[SUCCESS] Gateway is accessible: {'status': 'ok', ...}

============================================================
Test 1: Math Operation (add tool)
============================================================

[INFO] Fetching tools from gateway...
[SUCCESS] Retrieved 5 tools
[INFO] Available tools: add, multiply, get_weather, store_value, get_value
[INFO] Converting tools to Ollama format...
[INFO] Calling Ollama to generate function call...
[SUCCESS] Ollama called: add
[INFO] Arguments: {'a': 15, 'b': 27}
[INFO] Executing tool via gateway...
[SUCCESS] Tool executed successfully
[SUCCESS] Result verified: 15 + 27 = 42
[INFO] Sending result back to Ollama for final response...
[SUCCESS] Ollama final response: The sum of 15 and 27 is 42.
[SUCCESS] Math operation test PASSED!

... [similar output for other tests] ...

============================================================
All Tests PASSED!
============================================================
```

## What Gets Tested

### Python Client Methods

- ✅ `GatewayClient.get_tools(provider, server)` - Tool discovery in provider-specific format
- ✅ `GatewayClient.execute(provider, call, server)` - Tool execution
- ✅ `GatewayClient.logs(server, limit)` - Log retrieval
- ✅ `GatewayClient.health()` - Health check

### Integration Points

- ✅ Gateway → MCP Server communication (stdio transport)
- ✅ Tool schema conversion (MCP → Gemini → Ollama formats)
- ✅ Parameter handling (numbers, strings, objects)
- ✅ Result parsing (MCP content format → JSON)
- ✅ Multi-step workflows (prompt → function call → execution → response)
- ✅ Logging and observability

### Provider Compatibility

- ✅ Gemini format (used by Ollama for function calling)
- ✅ Numeric parameters (math tools)
- ✅ String parameters (weather tool)
- ✅ Stateful operations (store/retrieve values)

## Troubleshooting

### "Cannot connect to Ollama"

Make sure Ollama is running:
```bash
ollama serve
```

### "Model not found"

The test will automatically pull the model on first run. If it fails:
```bash
ollama pull qwen3:8b
```

### "Cannot connect to gateway"

Make sure the gateway is running:
```bash
cd node/service
npm run dev
```

### "Test server not found"

Build the test fixtures:
```bash
cd node/service/test/fixtures
npx tsc -p tsconfig.json
```

### Model doesn't call tools

Some smaller models may not reliably generate function calls. Try:
- Using a larger model: `export OLLAMA_E2E_MODEL=llama3.2:7b`
- The test gracefully handles this and will skip tests that require tool calls

## Comparison with TypeScript E2E Test

| Feature | TypeScript Test | Python Test |
|---------|----------------|-------------|
| Location | `node/service/test/ollama-local-e2e.test.ts` | `python/test_e2e_ollama.py` |
| Test Framework | Vitest | Custom (plain Python) |
| Client Library | Direct gateway HTTP calls (supertest) | Python client library |
| Purpose | Validates gateway service | Validates Python client + gateway |
| Output | TAP/Vitest format | Colorful terminal output |
| CI Integration | Via `npm test` | Via direct execution |

Both tests validate the same workflow but at different layers of the stack.

## Next Steps

After this test passes, you can:

1. **Try with real applications**: Use the Python client in your own projects
2. **Test other providers**: Modify the test to use OpenAI or xAI formats
3. **Add more test scenarios**: Extend with your own MCP server and tools
4. **Run in CI**: Add to your CI pipeline for regression testing

## Related Documentation

- [Main E2E Testing Guide](../docs/E2E_TESTING.md) - All E2E tests (TypeScript + Python)
- [Python Client README](./README.md) - Python client library documentation
- [Main README](../README.md) - Project overview and architecture

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the full E2E testing documentation
3. Open an issue in the repository with:
   - Python version (`python3 --version`)
   - Ollama version (`ollama --version`)
   - Full test output
   - Gateway logs
