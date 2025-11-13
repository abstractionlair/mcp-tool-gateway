/**
 * End-to-end integration test with real Gemini API using HTTP transport
 *
 * This test validates the complete workflow with HTTP/SSE transport:
 * 1. Start HTTP MCP server
 * 2. Gateway connects to MCP server via HTTP/SSE
 * 3. Tools are retrieved in Gemini format
 * 4. Gemini API is called with tools
 * 5. Gemini generates function calls
 * 6. Function calls are executed via gateway
 * 7. Results are returned to Gemini
 * 8. Gemini generates final response
 *
 * Requirements:
 * - GEMINI_API_KEY environment variable must be set
 * - Uses gemini-2.5-flash for cost efficiency
 *
 * To run:
 * GEMINI_API_KEY=your_key npm test -- gemini-http-e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { GoogleGenerativeAI } from '@google/generative-ai'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import { McpClientManager, ServerSpec } from '../src/mcpManager.js'
import express from 'express'
import { runLocalTool } from '../src/runLocalTool.js'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// Skip all tests if no API key provided
const describeOrSkip = GEMINI_API_KEY ? describe : describe.skip

describeOrSkip('Gemini HTTP Transport E2E Integration', () => {
  const testServerPath = path.join(
    process.cwd(),
    'test/fixtures/dist/simple-test-server-http.js'
  )
  const HTTP_SERVER_PORT = 3001
  const HTTP_SERVER_URL = `http://localhost:${HTTP_SERVER_PORT}/sse`

  let httpServerProcess: ChildProcess
  let genAI: GoogleGenerativeAI
  let testApp: express.Application

  beforeAll(async () => {
    // Verify test server exists
    const fs = await import('node:fs')
    if (!fs.existsSync(testServerPath)) {
      throw new Error(
        `HTTP test server not found at ${testServerPath}. Run: cd test/fixtures && npx tsc`
      )
    }

    // Create test directory
    const logDir = path.join(process.cwd(), '.tmp', 'http-e2e-test')
    fs.mkdirSync(logDir, { recursive: true })
    const logPath = path.join(logDir, 'mcp-calls.log')

    // Start HTTP MCP server
    console.log('Starting HTTP MCP server...')
    httpServerProcess = spawn('node', [testServerPath], {
      env: {
        ...process.env,
        PORT: HTTP_SERVER_PORT.toString(),
        MCP_CALL_LOG: logPath,
      },
      stdio: 'pipe',
    })

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('HTTP server failed to start within 5 seconds'))
      }, 5000)

      httpServerProcess.stderr?.on('data', (data) => {
        const message = data.toString()
        console.log('HTTP server:', message.trim())
        if (message.includes('running on')) {
          clearTimeout(timeout)
          resolve(true)
        }
      })

      httpServerProcess.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })

    // Create test app with HTTP transport
    testApp = express()
    testApp.use(express.json())

    // Configure MCP client manager with HTTP transport
    const manager = new McpClientManager(() => {
      const specs: ServerSpec[] = [
        {
          name: 'gtd-graph-memory',
          transport: 'http',
          url: HTTP_SERVER_URL,
          logPath,
        },
      ]
      return specs
    })

    // Add routes
    testApp.get('/tools/gemini', async (req, res) => {
      try {
        const serverName = (req.query.server as string) || 'gtd-graph-memory'
        const result = await manager.listTools(serverName)
        const tools = (result as any)?.tools || []

        // Convert to Gemini format
        const functionDeclarations = tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        }))

        res.json({ function_declarations: functionDeclarations })
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    testApp.post('/execute', async (req, res) => {
      try {
        const { provider, call, server } = req.body
        const serverName = server || 'gtd-graph-memory'

        if (provider !== 'gemini') {
          return res.status(400).json({ error: 'Only gemini provider supported in this test' })
        }

        const result = await manager.callTool(serverName, call.name, call.args)
        res.json({ result })
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    testApp.get('/logs', async (req, res) => {
      try {
        const serverName = (req.query.server as string) || 'gtd-graph-memory'
        const since = req.query.since as string | undefined
        const limit = parseInt((req.query.limit as string) || '200', 10)

        const logs = manager.readLogs(serverName, since, limit)
        res.json(logs)
      } catch (error: any) {
        res.status(500).json({ error: error.message })
      }
    })

    // Initialize Gemini
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY!)
  }, 10000) // 10 second timeout for setup

  afterAll(async () => {
    // Clean up HTTP server
    if (httpServerProcess) {
      httpServerProcess.kill()
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  })

  it('completes full workflow with HTTP transport: tool discovery → Gemini call → execution → response', async () => {
    // Step 1: Get tools in Gemini format
    const toolsResponse = await request(testApp)
      .get('/tools/gemini')
      .query({ server: 'gtd-graph-memory' })

    expect(toolsResponse.status).toBe(200)
    expect(toolsResponse.body).toHaveProperty('function_declarations')
    const tools = toolsResponse.body.function_declarations
    expect(tools.length).toBeGreaterThan(0)

    // Verify expected tools are present
    const toolNames = tools.map((t: any) => t.name)
    expect(toolNames).toContain('add')
    expect(toolNames).toContain('multiply')
    expect(toolNames).toContain('get_weather')

    // Step 2: Create Gemini model with tools
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ functionDeclarations: tools }],
    })

    // Step 3: Test simple math operation
    console.log('\n=== Testing Math Operation (HTTP Transport) ===')
    const mathChat = model.startChat()
    const mathPrompt = 'What is 25 plus 17? Use the add tool to calculate it.'

    let mathResponse = await mathChat.sendMessage(mathPrompt)
    console.log('Gemini initial response:', mathResponse.response.text() || '(function call)')

    // Step 4: Check if Gemini made a function call
    const mathParts = mathResponse.response.candidates?.[0]?.content?.parts || []
    const mathFunctionCall = mathParts.find((part: any) => part.functionCall)?.functionCall

    expect(mathFunctionCall).toBeTruthy()
    expect(mathFunctionCall.name).toBe('add')
    expect(mathFunctionCall.args).toHaveProperty('a')
    expect(mathFunctionCall.args).toHaveProperty('b')

    console.log('Function call:', JSON.stringify(mathFunctionCall, null, 2))

    // Step 5: Execute the function call via gateway
    const executeResponse = await request(testApp)
      .post('/execute')
      .send({
        provider: 'gemini',
        call: {
          name: mathFunctionCall.name,
          args: mathFunctionCall.args,
        },
        server: 'gtd-graph-memory',
      })

    expect(executeResponse.status).toBe(200)
    expect(executeResponse.body).toHaveProperty('result')
    const result = executeResponse.body.result

    console.log('Tool execution result:', result)

    // Parse the result - extract from MCP content format
    let parsedResult
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text')?.text
      parsedResult = typeof textContent === 'string' ? JSON.parse(textContent) : textContent
    } else {
      parsedResult = typeof result === 'string' ? JSON.parse(result) : result
    }
    expect(parsedResult).toHaveProperty('result', 42)

    // Step 6: Send result back to Gemini
    const functionResponse = {
      functionResponse: {
        name: mathFunctionCall.name,
        response: parsedResult,
      },
    }

    mathResponse = await mathChat.sendMessage([{ functionResponse: functionResponse.functionResponse }])
    const finalText = mathResponse.response.text()

    console.log('Gemini final response:', finalText)
    expect(finalText).toBeTruthy()
    expect(finalText.toLowerCase()).toContain('42')

    // Step 7: Verify logs were created
    console.log('\n=== Verifying Logs (HTTP Transport) ===')
    const logsResponse = await request(testApp)
      .get('/logs')
      .query({ server: 'gtd-graph-memory', limit: 100 })

    expect(logsResponse.status).toBe(200)
    const logs = Array.isArray(logsResponse.body) ? logsResponse.body : []

    console.log(`Found ${logs.length} log entries`)

    // Should have logs for the tool call we made
    expect(logs.length).toBeGreaterThan(0)
    const loggedToolNames = logs.map((log: any) => log.tool)
    expect(loggedToolNames).toContain('add')

    console.log('Tool calls logged:', [...new Set(loggedToolNames)])
  }, 60000) // 60 second timeout for API calls

  it('handles weather tool with string parameters via HTTP transport', async () => {
    // Get tools
    const toolsResponse = await request(testApp)
      .get('/tools/gemini')
      .query({ server: 'gtd-graph-memory' })

    const tools = toolsResponse.body.function_declarations

    // Create model
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ functionDeclarations: tools }],
    })

    const chat = model.startChat()
    const prompt = "What's the weather in Boston? Use the get_weather tool."

    let response = await chat.sendMessage(prompt)

    const parts = response.response.candidates?.[0]?.content?.parts || []
    const functionCall = parts.find((part: any) => part.functionCall)?.functionCall

    expect(functionCall).toBeTruthy()
    expect(functionCall.name).toBe('get_weather')
    expect(functionCall.args).toHaveProperty('location')
    expect(typeof functionCall.args.location).toBe('string')

    // Execute via gateway
    const executeResponse = await request(testApp)
      .post('/execute')
      .send({
        provider: 'gemini',
        call: {
          name: functionCall.name,
          args: functionCall.args,
        },
        server: 'gtd-graph-memory',
      })

    expect(executeResponse.status).toBe(200)
    const result = executeResponse.body.result

    // Parse the result - extract from MCP content format
    let parsedResult
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text')?.text
      parsedResult = typeof textContent === 'string' ? JSON.parse(textContent) : textContent
    } else {
      parsedResult = typeof result === 'string' ? JSON.parse(result) : result
    }

    expect(parsedResult).toHaveProperty('location')
    expect(parsedResult).toHaveProperty('temperature')
    expect(parsedResult).toHaveProperty('conditions')

    // Send result back
    response = await chat.sendMessage([{
      functionResponse: {
        name: functionCall.name,
        response: parsedResult,
      },
    }])

    const finalText = response.response.text()
    expect(finalText).toBeTruthy()
    expect(finalText.toLowerCase()).toMatch(/weather|temperature|sunny/)
  }, 30000)
})

// Print helpful message if tests are skipped
if (!GEMINI_API_KEY) {
  console.log('\n⚠️  Gemini HTTP E2E tests skipped: GEMINI_API_KEY not set')
  console.log('To run these tests:')
  console.log('  GEMINI_API_KEY=your_key npm test -- gemini-http-e2e.test.ts\n')
}
