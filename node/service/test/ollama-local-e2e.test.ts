/**
 * Local end-to-end integration test with Ollama (No API calls)
 *
 * This test validates the complete workflow using a local LLM:
 * 1. Gateway connects to simple-test-server MCP server
 * 2. Tools are retrieved in Gemini format
 * 3. Ollama (local) is called with tools
 * 4. Ollama generates function calls
 * 5. Function calls are executed via gateway
 * 6. Results are returned to Ollama
 * 7. Ollama generates final response
 *
 * Requirements:
 * - Ollama must be installed and running locally (override host with OLLAMA_HOST)
 * - Default model `llama3.2:3b` will be pulled automatically if missing (override with OLLAMA_E2E_MODEL)
 *
 * To run:
 * npm test -- ollama-local-e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../src/server.js'
import { Ollama } from 'ollama'
import type { ListResponse, ProgressResponse } from 'ollama'
import path from 'node:path'

const LOG_PREFIX = '[Ollama Local E2E]'
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434'
const OLLAMA_E2E_MODEL =
  process.env.OLLAMA_E2E_MODEL ?? process.env.OLLAMA_TEST_MODEL ?? 'llama3.2:3b'

const isModelInstalled = async (ollama: Ollama, model: string): Promise<boolean> => {
  const listResponse = await listModels(ollama)
  return (
    listResponse.models?.some(
      (entry) => entry.name === model || entry.model === model
    ) ?? false
  )
}

const listModels = async (ollama: Ollama): Promise<ListResponse> => {
  try {
    return await ollama.list()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `${LOG_PREFIX} Unable to reach Ollama at ${OLLAMA_HOST}. Ensure \`ollama serve\` is running. Original error: ${message}`
    )
  }
}

const ensureModelAvailable = async (ollama: Ollama, model: string): Promise<void> => {
  if (await isModelInstalled(ollama, model)) {
    return
  }

  console.log(
    `${LOG_PREFIX} Model "${model}" not found locally. Pulling from the Ollama registry...`
  )
  console.log(`${LOG_PREFIX} This step can take a few minutes on first run.`)

  try {
    const pullStream = await ollama.pull({ model, stream: true })
    for await (const progress of pullStream) {
      logPullProgress(progress)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `${LOG_PREFIX} Failed to pull model "${model}". See Ollama logs for details. Original error: ${message}`
    )
  }

  if (!(await isModelInstalled(ollama, model))) {
    throw new Error(
      `${LOG_PREFIX} Model "${model}" is still unavailable after pulling. Check your Ollama configuration.`
    )
  }
}

const logPullProgress = (progress: ProgressResponse): void => {
  if (!progress?.status) {
    return
  }

  const { completed, total } = progress
  const percent =
    typeof completed === 'number' &&
    typeof total === 'number' &&
    total > 0
      ? Math.round((completed / total) * 100)
      : null
  const progressSuffix =
    percent !== null ? ` (${percent}%)` : ''

  console.log(`${LOG_PREFIX} ${progress.status}${progressSuffix}`)
}

describe('Ollama Local E2E Integration', () => {
  const testServerPath = path.join(
    process.cwd(),
    'test/fixtures/dist/simple-test-server.js'
  )

  let ollama: Ollama | null = null

  const getOllamaClient = (): Ollama => {
    if (!ollama) {
      throw new Error('Ollama client not initialized')
    }
    return ollama
  }

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
    process.env.GTD_GRAPH_BASE_PATH = path.join(process.cwd(), '.tmp', 'ollama-e2e-test')
    process.env.GTD_GRAPH_LOG_PATH = path.join(process.cwd(), '.tmp', 'ollama-e2e-test', 'mcp-calls.log')

    // Create test directory
    const fs2 = await import('node:fs')
    fs2.mkdirSync(process.env.GTD_GRAPH_BASE_PATH, { recursive: true })

    // Initialize Ollama
    const client = new Ollama({ host: OLLAMA_HOST })
    await ensureModelAvailable(client, OLLAMA_E2E_MODEL)
    ollama = client
  }, 600000)

  afterAll(() => {
    ollama?.abort()
  })

  it('completes full workflow: tool discovery → Ollama call → execution → response', async () => {
    const client = getOllamaClient()

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

    // Step 2: Test simple math operation with Ollama
    console.log('\n=== Testing Math Operation with Ollama ===')

    // Convert Gemini function declarations to Ollama tools format
    const ollamaTools = tools.map((tool: any) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))

    const mathPrompt = 'What is 15 plus 27? Use the add tool to calculate it. You must call the add function with arguments a=15 and b=27.'

    let mathResponse = await client.chat({
      model: OLLAMA_E2E_MODEL,
      messages: [
        {
          role: 'user',
          content: mathPrompt,
        },
      ],
      tools: ollamaTools,
    })

    console.log('Ollama initial response:', JSON.stringify(mathResponse.message, null, 2))

    // Step 3: Check if Ollama made a function call
    const toolCalls = mathResponse.message.tool_calls

    expect(toolCalls).toBeTruthy()
    expect(Array.isArray(toolCalls)).toBe(true)
    expect(toolCalls.length).toBeGreaterThan(0)

    const addCall = toolCalls.find((call: any) => call.function.name === 'add')
    expect(addCall).toBeTruthy()

    const args = addCall.function.arguments
    console.log('Function call:', JSON.stringify(addCall, null, 2))

    // Convert string arguments to numbers (Ollama sometimes returns strings)
    const convertedArgs = {
      a: typeof args.a === 'string' ? parseFloat(args.a) : args.a,
      b: typeof args.b === 'string' ? parseFloat(args.b) : args.b,
    }

    // Step 4: Execute the function call via gateway
    const executeResponse = await request(app)
      .post('/execute')
      .send({
        provider: 'gemini',
        call: {
          name: addCall.function.name,
          args: convertedArgs,
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

    // Step 5: Send result back to Ollama
    mathResponse = await client.chat({
      model: OLLAMA_E2E_MODEL,
      messages: [
        {
          role: 'user',
          content: mathPrompt,
        },
        mathResponse.message,
        {
          role: 'tool',
          content: JSON.stringify(parsedResult),
        },
      ],
      tools: ollamaTools,
    })

    const finalText = mathResponse.message.content

    console.log('Ollama final response:', finalText)
    expect(finalText).toBeTruthy()
    expect(finalText.toLowerCase()).toContain('42')

    // Step 6: Verify logs were created
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

    console.log('Tool calls logged:', [...new Set(loggedToolNames)])
  }, 120000) // 2 minute timeout for local processing

  it('handles weather tool with string parameters', async () => {
    const client = getOllamaClient()

    // Get tools
    const toolsResponse = await request(app)
      .get('/tools/gemini')
      .query({ server: 'gtd-graph-memory' })

    const tools = toolsResponse.body.function_declarations

    // Convert to Ollama format
    const ollamaTools = tools.map((tool: any) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))

    const prompt = "What's the weather in San Francisco? Use the get_weather tool with location 'San Francisco'."

    let response = await client.chat({
      model: OLLAMA_E2E_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      tools: ollamaTools,
    })

    const toolCalls = response.message.tool_calls

    // Find weather call (might not always work with smaller models)
    if (!toolCalls || toolCalls.length === 0) {
      console.log('Note: Model did not generate tool calls. This can happen with smaller models.')
      return // Skip rest of test
    }

    const weatherCall = toolCalls.find((call: any) => call.function.name === 'get_weather')

    if (!weatherCall) {
      console.log('Note: Model did not call get_weather. This can happen with smaller models.')
      return // Skip rest of test
    }

    expect(weatherCall.function.arguments).toHaveProperty('location')
    expect(typeof weatherCall.function.arguments.location).toBe('string')

    // Execute via gateway
    const executeResponse = await request(app)
      .post('/execute')
      .send({
        provider: 'gemini',
        call: {
          name: weatherCall.function.name,
          args: weatherCall.function.arguments,
        },
        server: 'gtd-graph-memory',
      })

    expect(executeResponse.status).toBe(200)
    const result = executeResponse.body.result

    // Parse the result
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
    response = await client.chat({
      model: OLLAMA_E2E_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
        response.message,
        {
          role: 'tool',
          content: JSON.stringify(parsedResult),
        },
      ],
      tools: ollamaTools,
    })

    const finalText = response.message.content
    expect(finalText).toBeTruthy()
    expect(finalText.toLowerCase()).toMatch(/weather|temperature|sunny/)
  }, 120000)
})
