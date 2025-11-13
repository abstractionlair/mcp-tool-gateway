# HTTP Transport Server Startup Issue

**Date:** 2025-11-13
**Status:** Open
**Priority:** High
**Component:** Phase 1.6 - HTTP/SSE Transport Support

## Summary

The HTTP test server (`test/fixtures/simple-test-server-http.ts`) fails to start when spawned by the E2E test suite. The server process runs but produces no output and doesn't emit the expected "running on" message that the test waits for, causing tests to timeout after 5 seconds.

## Context

### Project Structure
- **Project:** MCP Tool Gateway - HTTP gateway for Model Context Protocol servers
- **Transport Types:**
  - **stdio transport** (Phase 1.5): ✅ Working - All E2E tests pass
  - **HTTP/SSE transport** (Phase 1.6): ⚠️ Code merged but tests fail

### What Works
- Stdio transport E2E tests (`gemini-e2e.test.ts`): Pass successfully (2/2 tests, ~3.6 min runtime)
- Test server logic (tools, handlers): Confirmed working via stdio tests
- HTTP transport code was implemented in PR #5 and merged to main

### What Doesn't Work
- HTTP transport E2E tests (`gemini-http-e2e.test.ts`): Fail during test setup
- HTTP test server fails to start within 5 second timeout
- Server process runs but produces **no output at all**, even with extensive debug logging added

## Technical Details

### File Locations
- **HTTP Test Server:** `node/service/test/fixtures/simple-test-server-http.ts`
- **Compiled Output:** `node/service/test/fixtures/dist/simple-test-server-http.js`
- **E2E Test:** `node/service/test/gemini-http-e2e.test.ts`
- **TypeScript Config:** `node/service/test/fixtures/tsconfig.json`

### Current Implementation

The server is supposed to:
1. Import MCP SDK's `StreamableHTTPServerTransport`
2. Create an Express app
3. Create transport with session management
4. Connect MCP server to transport via `await server.connect(transport)`
5. Set up Express route handler for `/sse` endpoint
6. Start listening on port 3001
7. Log "Simple test MCP server (HTTP) running on http://localhost:3001" to stderr

### The Problem

**Expected behavior:**
```
Starting HTTP MCP server...
HTTP server: [HTTP SERVER] File is being loaded
HTTP server: main() started
HTTP server: Creating Streamable HTTP transport for port 3001
HTTP server: ...
HTTP server: Simple test MCP server (HTTP) running on http://localhost:3001
```

**Actual behavior:**
```
Starting HTTP MCP server...
[5 second timeout]
Error: HTTP server failed to start within 5 seconds
```

The test spawns the server with:
```typescript
httpServerProcess = spawn('node', [testServerPath], {
  env: {
    ...process.env,
    PORT: HTTP_SERVER_PORT.toString(),
    MCP_CALL_LOG: logPath,
  },
  stdio: 'pipe',
})
```

And waits for output on stderr:
```typescript
httpServerProcess.stderr?.on('data', (data) => {
  const message = data.toString()
  console.log('HTTP server:', message.trim())
  if (message.includes('running on')) {
    clearTimeout(timeout)
    resolve(true)
  }
})
```

## Investigation Attempts

### 1. Type Errors with SSEServerTransport (RESOLVED)
- **Issue:** Original PR used deprecated `SSEServerTransport` which expects `ServerResponse` not `Express` app
- **Fix:** Switched to newer `StreamableHTTPServerTransport` API
- **Result:** Compilation succeeds, but runtime issue persists

### 2. Added Extensive Debug Logging
Added console.error statements at every step:
- File load
- Import completion
- main() entry
- Transport creation
- server.connect() before/after
- Express setup
- listen() callback

**Result:** NO output appears, suggesting failure during imports or very early initialization

### 3. Tested Simplified Versions
- **Basic Node script:** ✅ Works - console.error outputs correctly
- **Express-only server:** Not completed - investigation halted
- **Import test:** ✅ Works - All imports load successfully in isolation

### 4. Manual Server Execution
Attempted to run server manually multiple times:
```bash
cd node/service
PORT=3001 node test/fixtures/dist/simple-test-server-http.js
```

**Result:** Process starts but produces absolutely no output (not even early console.error statements)

## Hypotheses

### Most Likely Causes

1. **Silent exception during module initialization**
   - Something in the module-level code throws but is swallowed
   - Happens before any console.error executes
   - Possibly related to MCP SDK initialization

2. **Async initialization race condition**
   - The MCP Server or Transport constructors may have async side effects
   - Process might exit before async operations complete
   - No error handlers to catch rejections

3. **Module resolution issue**
   - Despite imports working in isolation, something about the full dependency graph fails
   - Could be circular dependency or missing peer dependency

4. **Output buffering issue**
   - Console.error might be buffered in this specific spawn configuration
   - Though this seems unlikely given stdio: 'pipe' configuration

### Less Likely

- **Port conflict:** Port 3001 is confirmed free
- **Permissions:** Other test servers work fine
- **Environment:** stdio transport works in same environment

## Current Code State

### Transport Implementation (as of last attempt)
```typescript
// Create Streamable HTTP transport with session management
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
})

// Connect server to transport
await server.connect(transport)

// Handle all MCP requests on /sse endpoint
app.all('/sse', async (req, res) => {
  await transport.handleRequest(req, res, req.body)
})

// Start Express server
app.listen(port, () => {
  console.error(`Simple test MCP server (HTTP) running on http://localhost:${port}`)
})
```

### Imports
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import express from 'express'
```

## Recommended Next Steps

### Immediate Actions

1. **Add top-level error handlers**
   ```typescript
   process.on('uncaughtException', (error) => {
     console.error('UNCAUGHT EXCEPTION:', error)
     process.exit(1)
   })

   process.on('unhandledRejection', (error) => {
     console.error('UNHANDLED REJECTION:', error)
     process.exit(1)
   })
   ```

2. **Wrap everything in try-catch**
   ```typescript
   try {
     console.error('[STARTUP] Beginning')
     // ... all initialization code
   } catch (error) {
     console.error('[STARTUP ERROR]', error)
     process.exit(1)
   }
   ```

3. **Check if server.connect() completes**
   - Add promise rejection handling
   - Try with explicit timeout
   - Log before/after with flush

4. **Compare with working PR #5 implementation**
   ```bash
   git show 0008eb7:node/service/test/fixtures/simple-test-server-http.ts
   ```
   Check if original used different transport API

### Deeper Investigation

5. **Run with Node debugging**
   ```bash
   node --trace-warnings --trace-uncaught test/fixtures/dist/simple-test-server-http.js
   ```

6. **Check MCP SDK version compatibility**
   - Current: `@modelcontextprotocol/sdk` version 1.21.1
   - Verify if StreamableHTTPServerTransport usage matches docs

7. **Review MCP SDK examples**
   - Check if SDK has example HTTP server implementations
   - Look for known initialization gotchas

8. **Test with alternative spawn approach**
   ```typescript
   // Try with shell: true
   spawn('node', [testServerPath], { shell: true, stdio: 'inherit' })
   ```

## Workarounds

### Temporary Solutions

1. **Skip HTTP E2E tests for now**
   - Keep them as `describe.skip`
   - Focus on stdio transport which works
   - Document HTTP tests as known issue

2. **Manual HTTP server testing**
   - Run server separately
   - Test endpoints with curl/Postman
   - Verify transport logic without E2E framework

3. **Increase timeout**
   - Try 30 second timeout instead of 5
   - May reveal delayed initialization

## Success Criteria

The issue is resolved when:
- [ ] HTTP test server starts successfully when spawned by test
- [ ] Server logs "running on http://localhost:3001" to stderr within 5 seconds
- [ ] `npm test -- gemini-http-e2e.test.ts` passes both tests
- [ ] Server responds to HTTP requests on `/sse` endpoint

## Related Files

- Implementation: `node/service/test/fixtures/simple-test-server-http.ts`
- Test: `node/service/test/gemini-http-e2e.test.ts`
- Working reference: `node/service/test/fixtures/simple-test-server.ts` (stdio version)
- Working test: `node/service/test/gemini-e2e.test.ts` (stdio version)
- Original PR: #5 (commit 0008eb7)

## Notes

- The stdio transport tests work perfectly, proving the MCP server logic is sound
- The issue is specifically with HTTP transport initialization
- No TypeScript compilation errors
- Process spawns but produces zero output
- Similar Express servers work fine in the same codebase (main gateway server)

---

**Last Updated:** 2025-11-13
**Investigated By:** Claude
**Next Owner:** TBD
