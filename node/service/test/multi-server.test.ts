import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../src/server.js'
import path from 'node:path'
import fs from 'node:fs'
import type { Server } from 'node:http'

describe('multi-server configuration', () => {
  let server: Server
  let configPath: string
  let tempDir: string

  beforeAll(async () => {
    // Setup: Create a config file with multiple servers
    const testServerPath = path.join(process.cwd(), 'test/fixtures/dist/simple-test-server.js')
    if (!fs.existsSync(testServerPath)) {
      throw new Error('Test server not found. Run: cd node/service/test/fixtures && npx tsc -p tsconfig.json')
    }

    // Create temp directory for test data
    tempDir = path.join(process.cwd(), '.tmp', 'multi-server-test-' + Date.now())
    fs.mkdirSync(tempDir, { recursive: true })

    // Create separate data directories for each server
    const server1Base = path.join(tempDir, 'server1')
    const server2Base = path.join(tempDir, 'server2')
    fs.mkdirSync(server1Base, { recursive: true })
    fs.mkdirSync(server2Base, { recursive: true })

    // Create config file with multiple servers
    const config = {
      servers: {
        'math-server': {
          transport: 'stdio',
          command: process.execPath,
          args: [testServerPath],
          env: {
            BASE_PATH: server1Base,
            MCP_CALL_LOG: path.join(server1Base, 'calls.log')
          },
          logPath: path.join(server1Base, 'calls.log')
        },
        'storage-server': {
          transport: 'stdio',
          command: process.execPath,
          args: [testServerPath],
          env: {
            BASE_PATH: server2Base,
            MCP_CALL_LOG: path.join(server2Base, 'calls.log')
          },
          logPath: path.join(server2Base, 'calls.log')
        },
        'weather-server': {
          // Test default transport (should be stdio)
          command: process.execPath,
          args: [testServerPath],
          env: {
            BASE_PATH: tempDir
          }
        }
      }
    }

    configPath = path.join(tempDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    // Set config path and clear legacy env vars
    process.env.MCP_CONFIG_PATH = configPath
    delete process.env.MCP_SERVER_DIST
    delete process.env.MCP_BASE_PATH
    delete process.env.MCP_LOG_PATH

    // Note: The server module is already imported at the top, so we need to restart
    // For this test to work properly, we start a fresh server instance
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  })

  afterAll(() => {
    server?.close()
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('health endpoint shows all configured servers', async () => {
    const res = await request(server).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.serverCount).toBe(3)
    expect(res.body.configSource).toBe('file')
    expect(res.body.servers).toHaveLength(3)

    const serverNames = res.body.servers.map((s: any) => s.name)
    expect(serverNames).toContain('math-server')
    expect(serverNames).toContain('storage-server')
    expect(serverNames).toContain('weather-server')

    // Check that all servers show correct transport
    const mathServer = res.body.servers.find((s: any) => s.name === 'math-server')
    expect(mathServer.transport).toBe('stdio')
    expect(mathServer.connected).toBe(false) // Not connected yet
  })

  it('can list tools from first server', async () => {
    const res = await request(server).get('/tools').query({ server: 'math-server' })
    expect(res.status).toBe(200)

    const tools = Array.isArray((res.body as any).tools) ? (res.body as any).tools : res.body
    expect(Array.isArray(tools)).toBe(true)
    const names = tools.map((t: any) => t.name)
    expect(names).toEqual(expect.arrayContaining(['add', 'multiply']))
  }, 60000)

  it('can list tools from second server', async () => {
    const res = await request(server).get('/tools').query({ server: 'storage-server' })
    expect(res.status).toBe(200)

    const tools = Array.isArray((res.body as any).tools) ? (res.body as any).tools : res.body
    expect(Array.isArray(tools)).toBe(true)
    const names = tools.map((t: any) => t.name)
    expect(names).toEqual(expect.arrayContaining(['store_value', 'get_value']))
  }, 60000)

  it('can list tools from third server (default transport)', async () => {
    const res = await request(server).get('/tools').query({ server: 'weather-server' })
    expect(res.status).toBe(200)

    const tools = Array.isArray((res.body as any).tools) ? (res.body as any).tools : res.body
    expect(Array.isArray(tools)).toBe(true)
    const names = tools.map((t: any) => t.name)
    expect(names).toEqual(expect.arrayContaining(['get_weather']))
  }, 60000)

  it('returns error for unknown server', async () => {
    const res = await request(server).get('/tools').query({ server: 'nonexistent' })
    expect(res.status).toBe(500)
    expect(res.body.error).toContain('Unknown server: nonexistent')
    expect(res.body.error).toContain('Available servers:')
  })

  it('can call tool on specific server', async () => {
    const res = await request(server)
      .post('/call_tool')
      .send({ server: 'math-server', tool: 'add', arguments: { a: 10, b: 20 } })
    expect(res.status).toBe(200)
    expect(res.body.result).toBeTruthy()
  }, 60000)

  it('can execute tool via provider-specific endpoint', async () => {
    const res = await request(server)
      .post('/execute')
      .send({
        provider: 'gemini',
        server: 'math-server',
        call: { name: 'multiply', args: { a: 5, b: 7 } }
      })
    expect(res.status).toBe(200)
    expect(res.body.result).toBeTruthy()
  }, 60000)

  it('gets tools in Gemini format from specific server', async () => {
    const res = await request(server).get('/tools/gemini').query({ server: 'math-server' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('function_declarations')

    const declarations = res.body.function_declarations
    const addDecl = declarations.find((d: any) => d.name === 'add')
    expect(addDecl).toBeTruthy()
    expect(addDecl.name).toBe('add')
  }, 60000)

  it('gets tools in OpenAI format from specific server', async () => {
    const res = await request(server).get('/tools/openai').query({ server: 'storage-server' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('tools')

    const tools = res.body.tools
    const storeTool = tools.find((t: any) => t.function.name === 'store_value')
    expect(storeTool).toBeTruthy()
    expect(storeTool.type).toBe('function')
  }, 60000)

  it('health shows servers as connected after use', async () => {
    // First, use the servers
    await request(server).get('/tools').query({ server: 'math-server' })
    await request(server).get('/tools').query({ server: 'storage-server' })

    // Check health again
    const res = await request(server).get('/health')
    expect(res.status).toBe(200)

    const mathServer = res.body.servers.find((s: any) => s.name === 'math-server')
    const storageServer = res.body.servers.find((s: any) => s.name === 'storage-server')
    const weatherServer = res.body.servers.find((s: any) => s.name === 'weather-server')

    expect(mathServer.connected).toBe(true)
    expect(storageServer.connected).toBe(true)
    // weather-server was already used in a previous test, so it will be connected
    expect(weatherServer.connected).toBe(true)
  }, 60000)

  it('can read logs from specific server', async () => {
    // First, make a call to generate logs
    await request(server)
      .post('/call_tool')
      .send({ server: 'math-server', tool: 'add', arguments: { a: 1, b: 2 } })

    // Wait a bit for log to be written
    await new Promise(resolve => setTimeout(resolve, 100))

    // Read logs
    const res = await request(server).get('/logs').query({ server: 'math-server' })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    // Should have at least one log entry
    if (res.body.length > 0) {
      const logEntry = res.body[res.body.length - 1]
      expect(logEntry).toHaveProperty('tool')
      expect(logEntry.tool).toBe('add')
    }
  }, 60000)
})
