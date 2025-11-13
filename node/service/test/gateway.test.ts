import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../src/server.js'
import path from 'node:path'
import fs from 'node:fs'
import type { Server } from 'node:http'

const distEnv = process.env.MCP_SERVER_DIST
const baseEnv = process.env.MCP_BASE_PATH
const logEnv = process.env.MCP_LOG_PATH

describe('gateway endpoints', () => {
  let server: Server

  beforeAll(async () => {
    // If not provided, default to local simple test server fixture
    if (!process.env.MCP_SERVER_DIST || !process.env.MCP_BASE_PATH) {
      const testServerPath = path.join(process.cwd(), 'test/fixtures/dist/simple-test-server.js')
      if (!fs.existsSync(testServerPath)) {
        throw new Error('Test server not found. Run: cd node/service/test/fixtures && npx tsc -p tsconfig.json')
      }
      process.env.MCP_SERVER_DIST = testServerPath
      const uniqueBase = path.join(process.cwd(), '.tmp', 'int-test-' + Date.now())
      fs.mkdirSync(uniqueBase, { recursive: true })
      process.env.MCP_BASE_PATH = uniqueBase
      process.env.MCP_LOG_PATH = path.join(uniqueBase, 'mcp-calls.log')
    }

    server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  })

  afterAll(() => {
    server?.close()
  })

  it('health returns ok', async () => {
    const res = await request(server).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('lists tools for default server', async () => {
    const res = await request(server).get('/tools').query({ server: 'default' })
    expect(res.status).toBe(200)
    // Result may be { tools: [...] } depending on SDK version
    const tools = Array.isArray((res.body as any).tools) ? (res.body as any).tools : res.body
    expect(Array.isArray(tools)).toBe(true)
    const names = tools.map((t: any) => t.name)
    expect(names).toEqual(expect.arrayContaining(['add','multiply','get_weather','store_value','get_value']))
    const add = tools.find((t: any) => t.name === 'add')
    expect(add).toBeTruthy()
    expect(add.inputSchema || add.parameters || add.schema).toBeTruthy()
  }, 30000)

  it('can call add via /call_tool', async () => {
    const res = await request(server)
      .post('/call_tool')
      .send({ server: 'default', tool: 'add', arguments: { a: 15, b: 27 } })
    expect(res.status).toBe(200)
    expect(res.body.result).toBeTruthy()
  }, 30000)

  it('returns tools in Gemini function_declarations format', async () => {
    const res = await request(server).get('/tools/gemini').query({ server: 'default' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('function_declarations')
    expect(Array.isArray(res.body.function_declarations)).toBe(true)

    // Verify structure of Gemini function declarations
    const declarations = res.body.function_declarations
    expect(declarations.length).toBeGreaterThan(0)

    const addDecl = declarations.find((d: any) => d.name === 'add')
    expect(addDecl).toBeTruthy()
    expect(addDecl).toHaveProperty('name')
    expect(addDecl).toHaveProperty('description')
    expect(addDecl).toHaveProperty('parameters')
    expect(addDecl.parameters).toHaveProperty('type', 'object')
    expect(addDecl.parameters).toHaveProperty('properties')

    const weatherDecl = declarations.find((d: any) => d.name === 'get_weather')
    expect(weatherDecl).toBeTruthy()
  })

  it('can execute tools via /execute with Gemini format', async () => {
    const res = await request(server)
      .post('/execute')
      .send({
        provider: 'gemini',
        call: {
          name: 'add',
          args: { a: 15, b: 27 },
        },
        server: 'default',
      })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('result')
    expect(res.body.result).toBeTruthy()
  })

  it('rejects /execute with missing provider', async () => {
    const res = await request(server)
      .post('/execute')
      .send({
        call: { name: 'query_nodes', args: {} },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('provider')
  })

  it('rejects /execute with missing call', async () => {
    const res = await request(server)
      .post('/execute')
      .send({
        provider: 'gemini',
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('call')
  })

  it('rejects /execute with unknown provider', async () => {
    const res = await request(server)
      .post('/execute')
      .send({
        provider: 'unknown-provider',
        call: { name: 'test', args: {} },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Unknown provider')
    expect(res.body.availableProviders).toContain('gemini')
  })

  it('supports multi-step workflow via key-value tools', async () => {
    // Store a value
    const store = await request(server)
      .post('/call_tool')
      .send({ server: 'default', tool: 'store_value', arguments: { key: 'session_id', value: 'test123' } })
    expect(store.status).toBe(200)

    // Retrieve the value
    const get = await request(server)
      .post('/call_tool')
      .send({ server: 'default', tool: 'get_value', arguments: { key: 'session_id' } })
    expect(get.status).toBe(200)
    const result = get.body?.result
    // Result may be wrapped in MCP content format or plain JSON depending on client
    let parsed: any = result
    if (result?.content && Array.isArray(result.content)) {
      const text = result.content.find((c: any) => c.type === 'text')?.text
      parsed = typeof text === 'string' ? JSON.parse(text) : text
    }
    expect(parsed?.value).toBe('test123')
  })
})
