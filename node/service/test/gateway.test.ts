import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '../src/server.js'
import path from 'node:path'
import fs from 'node:fs'

const dist = process.env.GTD_GRAPH_DIST
const base = process.env.GTD_GRAPH_BASE_PATH
const logp = process.env.GTD_GRAPH_LOG_PATH

describe('gateway endpoints', () => {
  beforeAll(() => {
    if (!dist || !base) {
      throw new Error('Set GTD_GRAPH_DIST and GTD_GRAPH_BASE_PATH for tests')
    }
  })

  it('health returns ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('lists tools for gtd-graph-memory', async () => {
    const res = await request(app).get('/tools').query({ server: 'gtd-graph-memory' })
    expect(res.status).toBe(200)
    // Result may be { tools: [...] } depending on SDK version
    const tools = Array.isArray((res.body as any).tools) ? (res.body as any).tools : res.body
    expect(Array.isArray(tools)).toBe(true)
    const names = tools.map((t: any) => t.name)
    expect(names).toContain('create_node')
    expect(names).toContain('query_nodes')
    const create = tools.find((t: any) => t.name === 'create_node')
    expect(create).toBeTruthy()
    expect(create.inputSchema || create.parameters || create.schema).toBeTruthy()
  })

  it('can call query_nodes via /call_tool', async () => {
    const res = await request(app)
      .post('/call_tool')
      .send({ server: 'gtd-graph-memory', tool: 'query_nodes', arguments: {} })
    expect(res.status).toBe(200)
    expect(res.body.result).toBeTruthy()
  })

  it('can create ontology and then create a task', async () => {
    // Use a unique base path per test to avoid ontology collisions
    const uniqueBase = path.join(process.cwd(), '.tmp', 'test-data-' + Date.now())
    fs.mkdirSync(uniqueBase, { recursive: true })
    process.env.GTD_GRAPH_BASE_PATH = uniqueBase

    // Create ontology if missing
    const ontology = {
      node_types: ['Task', 'Context', 'State', 'UNSPECIFIED'],
      connection_types: [
        { name: 'DependsOn', from_types: ['Task'], to_types: ['Task'] },
        { name: 'DependsOn', from_types: ['Task'], to_types: ['Context'] },
        { name: 'DependsOn', from_types: ['Task'], to_types: ['State'] },
        { name: 'DependsOn', from_types: ['Task'], to_types: ['UNSPECIFIED'] },
      ],
    }
    const resOnt = await request(app)
      .post('/call_tool')
      .send({ server: 'gtd-graph-memory', tool: 'create_ontology', arguments: ontology })
    expect(resOnt.status).toBe(200)

    // Create a task
    const createArgs = {
      type: 'Task',
      content: 'Test task via gateway',
      encoding: 'utf-8',
      format: 'text/plain',
      properties: { isComplete: false },
    }
    const resCreate = await request(app)
      .post('/call_tool')
      .send({ server: 'gtd-graph-memory', tool: 'create_node', arguments: createArgs })
    expect(resCreate.status).toBe(200)
    const nodeRes = resCreate.body.result || {}
    const nodeId = nodeRes.node_id || nodeRes?.structuredContent?.node_id
    expect(typeof nodeId).toBe('string')

    // Query tasks to verify presence
    const resQuery = await request(app)
      .post('/call_tool')
      .send({ server: 'gtd-graph-memory', tool: 'query_nodes', arguments: { type: 'Task' } })
    expect(resQuery.status).toBe(200)
    const resultObj = resQuery.body?.result || resQuery.body
    const nodeIds = resultObj?.node_ids || resultObj?.structuredContent?.node_ids
    expect(Array.isArray(nodeIds)).toBe(true)
    expect(nodeIds).toContain(nodeId)
  })
})
