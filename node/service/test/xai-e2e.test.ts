/**
 * End-to-end integration test with real XAI API
 *
 * This test validates the complete workflow:
 * 1. Gateway connects to simple-test-server MCP server
 * 2. Tools are retrieved in XAI format
 * 3. XAI API is called with tools
 * 4. XAI generates function calls
 * 5. Function calls are executed via gateway
 * 6. Results are returned to XAI
 * 7. XAI generates final response
 *
 * Requirements:
 * - XAI_API_KEY environment variable must be set
 * - Uses grok-1.5-flash for cost efficiency
 *
 * To run:
 * XAI_API_KEY=your_key npm test -- xai-e2e.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '../src/server.js'
import OpenAI from 'openai'
import path from 'node:path'
import fs from 'node:fs'

let XAI_API_KEY = process.env.XAI_API_KEY
// Load from repo root .env if not present
if (!XAI_API_KEY) {
  try {
    const rootEnvPath = path.join(process.cwd(), '..', '..', '.env')
    if (fs.existsSync(rootEnvPath)) {
      const text = fs.readFileSync(rootEnvPath, 'utf-8')
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?XAI_API_KEY\s*=\s*['"]?([^'"\n]+)['"]?\s*$/)
        if (m) {
          XAI_API_KEY = m[1]
          process.env.XAI_API_KEY = XAI_API_KEY
          break
        }
      }
    }
  } catch {}
}

// Skip all tests if no API key provided
const describeOrSkip = XAI_API_KEY ? describe : describe.skip

describeOrSkip('XAI E2E Integration', () => {
  const testServerPath = path.join(
    process.cwd(),
    'test/fixtures/dist/simple-test-server.js'
  )

  let xai: OpenAI

  beforeAll(async () => {
    // Verify test server exists
    if (!fs.existsSync(testServerPath)) {
      throw new Error(
        `Test server not found at ${testServerPath}. Run: cd test/fixtures && npx tsc`
      )
    }

    // Configure environment to use simple-test-server
    process.env.MCP_SERVER_DIST = testServerPath
    process.env.MCP_BASE_PATH = path.join(process.cwd(), '.tmp', 'xai-e2e-test')
    process.env.MCP_LOG_PATH = path.join(process.cwd(), '.tmp', 'xai-e2e-test', 'mcp-calls.log')

    // Create test directory
    fs.mkdirSync(process.env.MCP_BASE_PATH!, { recursive: true })

    // Initialize XAI client using OpenAI SDK
    xai = new OpenAI({
      apiKey: XAI_API_KEY!,
      baseURL: 'https://api.x.ai/v1',
    })
  })

  it('completes full workflow: tool discovery → XAI call → execution → response', async () => {
    // Step 1: Get tools in XAI format
    const toolsResponse = await request(app)
      .get('/tools/xai')
      .query({ server: 'default' })

    expect(toolsResponse.status).toBe(200)
    expect(toolsResponse.body).toHaveProperty('tools')
    const tools = toolsResponse.body.tools
    expect(tools.length).toBeGreaterThan(0)

    // Verify expected tools are present
    const toolNames = tools.map((t: any) => t.function.name)
    expect(toolNames).toContain('add')
    expect(toolNames).toContain('multiply')
    expect(toolNames).toContain('get_weather')
    expect(toolNames).toContain('store_value')
    expect(toolNames).toContain('get_value')

    // Step 2: Test simple math operation with XAI
    console.log('\n=== Testing Math Operation with XAI ===')
    const mathMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: 'What is 15 plus 27? Use the add tool to calculate it.',
      },
    ]

    let mathResponse = await xai.chat.completions.create({
      model: 'grok-4-fast',
      messages: mathMessages,
      tools: tools,
      tool_choice: 'auto',
    })

    console.log('XAI initial response:', mathResponse.choices[0].message.content || '(function call)')

    // Step 3: Check if XAI made a function call
    const message = mathResponse.choices[0].message
    expect(message.tool_calls).toBeTruthy()
    expect(message.tool_calls!.length).toBeGreaterThan(0)

    const toolCall = message.tool_calls![0]
    expect(toolCall.type).toBe('function')
    expect(toolCall.function.name).toBe('add')

    console.log('Function call:', JSON.stringify(toolCall.function, null, 2))

    // Step 4: Execute the function call via gateway
    const executeResponse = await request(app)
      .post('/execute')
      .send({
        provider: 'xai',
        call: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        },
        server: 'default',
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

    console.log('Parsed result:', parsedResult)
    expect(parsedResult).toHaveProperty('result')

    // Step 5: Send result back to XAI
    mathMessages.push(message)
    mathMessages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(parsedResult),
    })

    const finalResponse = await xai.chat.completions.create({
      model: 'grok-4-fast',
      messages: mathMessages,
    })

    console.log('XAI final response:', finalResponse.choices[0].message.content)
    expect(finalResponse.choices[0].message.content).toBeTruthy()

    // The response should mention the result (42)
    const responseText = finalResponse.choices[0].message.content!.toLowerCase()
    expect(responseText).toMatch(/42|forty[- ]?two/)
  }, 60000) // Increased timeout for API calls

  it('handles multi-step workflow with state management', async () => {
    console.log('\n=== Testing Multi-Step Workflow ===')

    // Get tools
    const toolsResponse = await request(app)
      .get('/tools/xai')
      .query({ server: 'default' })
    const tools = toolsResponse.body.tools

    // Create conversation that requires multiple tool calls
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: 'Please store the value "hello world" with key "greeting", then multiply 6 by 7, then retrieve the greeting.',
      },
    ]

    let iterationCount = 0
    const maxIterations = 5

    while (iterationCount < maxIterations) {
      iterationCount++
      console.log(`\n--- Iteration ${iterationCount} ---`)

      const response = await xai.chat.completions.create({
      model: 'grok-4-fast',
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
      })

      const message = response.choices[0].message
      messages.push(message)

      if (!message.tool_calls || message.tool_calls.length === 0) {
        // No more tool calls, we're done
        console.log('Final response:', message.content)
        expect(message.content).toBeTruthy()
        break
      }

      // Execute all tool calls
      for (const toolCall of message.tool_calls) {
        console.log(`Calling tool: ${toolCall.function.name}`)

        const executeResponse = await request(app)
          .post('/execute')
          .send({
            provider: 'xai',
            call: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
            server: 'default',
          })

        expect(executeResponse.status).toBe(200)
        const result = executeResponse.body.result

        // Parse result
        let parsedResult
        if (result.content && Array.isArray(result.content)) {
          const textContent = result.content.find((c: any) => c.type === 'text')?.text
          parsedResult = typeof textContent === 'string' ? JSON.parse(textContent) : textContent
        } else {
          parsedResult = typeof result === 'string' ? JSON.parse(result) : result
        }

        console.log(`Result: ${JSON.stringify(parsedResult)}`)

        // Add tool response to messages
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(parsedResult),
        })
      }
    }

    expect(iterationCount).toBeLessThan(maxIterations) // Should complete before max iterations

    // Verify logs contain the expected tool calls
    const logsResponse = await request(app)
      .get('/logs')
      .query({ server: 'default', limit: 50 })

    expect(logsResponse.status).toBe(200)
    const logs = logsResponse.body

    const loggedToolNames = logs.map((entry: any) => entry.tool).filter(Boolean)
    expect(loggedToolNames).toContain('store_value')
    expect(loggedToolNames).toContain('multiply')
    expect(loggedToolNames).toContain('get_value')

    console.log('Verified log entries:', loggedToolNames.length)
  }, 90000) // Increased timeout for multiple API calls
})
