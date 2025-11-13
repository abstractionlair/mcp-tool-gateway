/**
 * End-to-end integration test with real Gemini API
 *
 * This test validates the complete workflow:
 * 1. Gateway connects to simple-test-server MCP server
 * 2. Tools are retrieved in Gemini format
 * 3. Gemini API is called with tools
 * 4. Gemini generates function calls
 * 5. Function calls are executed via gateway
 * 6. Results are returned to Gemini
 * 7. Gemini generates final response
 *
 * Requirements:
 * - GEMINI_API_KEY environment variable must be set
 * - Uses gemini-1.5-flash for cost efficiency
 *
 * To run:
 * GEMINI_API_KEY=your_key npm test -- gemini-e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../src/server.js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// Skip all tests if no API key provided
const describeOrSkip = GEMINI_API_KEY ? describe : describe.skip

describeOrSkip('Gemini E2E Integration', () => {
  const testServerPath = path.join(
    process.cwd(),
    'test/fixtures/dist/simple-test-server.js'
  )

  let genAI: GoogleGenerativeAI

  beforeAll(async () => {
    // Verify test server exists
    const fs = await import('node:fs')
    if (!fs.existsSync(testServerPath)) {
      throw new Error(
        `Test server not found at ${testServerPath}. Run: cd test/fixtures && npx tsc`
      )
    }

    // Configure environment to use simple-test-server
    process.env.GTD_GRAPH_DIST = testServerPath
    process.env.GTD_GRAPH_BASE_PATH = path.join(process.cwd(), '.tmp', 'e2e-test')
    process.env.GTD_GRAPH_LOG_PATH = path.join(process.cwd(), '.tmp', 'e2e-test', 'mcp-calls.log')

    // Create test directory
    const fs2 = await import('node:fs')
    fs2.mkdirSync(process.env.GTD_GRAPH_BASE_PATH, { recursive: true })

    // Initialize Gemini
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY!)
  })

  it('completes full workflow: tool discovery → Gemini call → execution → response', async () => {
    // Step 1: Get tools in Gemini format
    const toolsResponse = await request(app)
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
    expect(toolNames).toContain('store_value')
    expect(toolNames).toContain('get_value')

    // Step 2: Create Gemini model with tools
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      tools: [{ functionDeclarations: tools }],
    })

    // Step 3: Test simple math operation
    console.log('\n=== Testing Math Operation ===')
    const mathChat = model.startChat()
    const mathPrompt = 'What is 15 plus 27? Use the add tool to calculate it.'

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
    const executeResponse = await request(app)
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

    // Parse the result (simple-test-server returns JSON string)
    const parsedResult = typeof result === 'string' ? JSON.parse(result) : result
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

    // Step 7: Test multi-step operation with state
    console.log('\n=== Testing Multi-Step Operation with State ===')
    const stateChat = model.startChat()
    const statePrompt = 'First, store the value "test123" with key "session_id". Then, multiply 6 by 7. Finally, retrieve the stored value using key "session_id".'

    let stateResponse = await stateChat.sendMessage(statePrompt)
    console.log('Multi-step initial response:', stateResponse.response.text() || '(function calls)')

    // Gemini may make multiple function calls or do them sequentially
    // We'll process up to 5 rounds of function calls
    let rounds = 0
    const maxRounds = 5

    while (rounds < maxRounds) {
      const parts = stateResponse.response.candidates?.[0]?.content?.parts || []
      const functionCalls = parts
        .filter((part: any) => part.functionCall)
        .map((part: any) => part.functionCall)

      if (functionCalls.length === 0) {
        // No more function calls, we're done
        break
      }

      console.log(`\nRound ${rounds + 1}: Processing ${functionCalls.length} function call(s)`)

      // Process each function call
      const functionResponses = []
      for (const fc of functionCalls) {
        console.log(`  - Calling ${fc.name} with args:`, fc.args)

        const execResp = await request(app)
          .post('/execute')
          .send({
            provider: 'gemini',
            call: {
              name: fc.name,
              args: fc.args,
            },
            server: 'gtd-graph-memory',
          })

        expect(execResp.status).toBe(200)
        const execResult = execResp.body.result
        const parsedExecResult = typeof execResult === 'string' ? JSON.parse(execResult) : execResult

        console.log(`  - Result:`, parsedExecResult)

        functionResponses.push({
          functionResponse: {
            name: fc.name,
            response: parsedExecResult,
          },
        })
      }

      // Send all function responses back to Gemini
      stateResponse = await stateChat.sendMessage(
        functionResponses.map(fr => ({ functionResponse: fr.functionResponse }))
      )

      rounds++
    }

    const finalStateText = stateResponse.response.text()
    console.log('\nFinal response:', finalStateText)

    expect(finalStateText).toBeTruthy()
    // Should mention both the multiplication result (42) and the stored value (test123)
    expect(finalStateText.toLowerCase()).toMatch(/42|forty.?two/)
    expect(finalStateText).toContain('test123')

    // Step 8: Verify logs were created
    console.log('\n=== Verifying Logs ===')
    const logsResponse = await request(app)
      .get('/logs')
      .query({ server: 'gtd-graph-memory', limit: 100 })

    expect(logsResponse.status).toBe(200)
    const logs = Array.isArray(logsResponse.body) ? logsResponse.body : []

    console.log(`Found ${logs.length} log entries`)

    // Should have logs for the tool calls we made
    expect(logs.length).toBeGreaterThan(0)
    const loggedToolNames = logs.map((log: any) => log.tool)
    expect(loggedToolNames).toContain('add')
    expect(loggedToolNames).toContain('multiply')
    expect(loggedToolNames).toContain('store_value')
    expect(loggedToolNames).toContain('get_value')

    console.log('Tool calls logged:', [...new Set(loggedToolNames)])
  }, 60000) // 60 second timeout for API calls

  it('handles weather tool with string parameters', async () => {
    // Get tools
    const toolsResponse = await request(app)
      .get('/tools/gemini')
      .query({ server: 'gtd-graph-memory' })

    const tools = toolsResponse.body.function_declarations

    // Create model
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      tools: [{ functionDeclarations: tools }],
    })

    const chat = model.startChat()
    const prompt = "What's the weather in San Francisco? Use the get_weather tool."

    let response = await chat.sendMessage(prompt)

    const parts = response.response.candidates?.[0]?.content?.parts || []
    const functionCall = parts.find((part: any) => part.functionCall)?.functionCall

    expect(functionCall).toBeTruthy()
    expect(functionCall.name).toBe('get_weather')
    expect(functionCall.args).toHaveProperty('location')
    expect(typeof functionCall.args.location).toBe('string')

    // Execute via gateway
    const executeResponse = await request(app)
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
    const parsedResult = typeof result === 'string' ? JSON.parse(result) : result

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
  console.log('\n⚠️  Gemini E2E tests skipped: GEMINI_API_KEY not set')
  console.log('To run these tests:')
  console.log('  GEMINI_API_KEY=your_key npm test -- gemini-e2e.test.ts\n')
}
