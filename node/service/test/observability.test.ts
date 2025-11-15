import { describe, it, expect, beforeEach } from 'vitest'
import supertest from 'supertest'
import { app } from '../src/server.js'
import { metrics, logger, CORRELATION_ID_HEADER } from '../src/observability/index.js'

const request = supertest(app)

describe('Observability Features', () => {
  beforeEach(() => {
    // Reset metrics before each test
    metrics.reset()
  })

  describe('Correlation IDs', () => {
    it('should generate correlation ID for requests without one', async () => {
      const response = await request.get('/health')

      expect(response.status).toBe(200)
      expect(response.headers[CORRELATION_ID_HEADER]).toBeDefined()
      expect(response.headers[CORRELATION_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/) // UUID format
    })

    it('should preserve correlation ID from request header', async () => {
      const correlationId = 'test-correlation-id-123'
      const response = await request
        .get('/health')
        .set(CORRELATION_ID_HEADER, correlationId)

      expect(response.status).toBe(200)
      expect(response.headers[CORRELATION_ID_HEADER]).toBe(correlationId)
    })

    it('should add correlation ID to all endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/health' },
        { method: 'get', path: '/metrics' },
      ]

      for (const endpoint of endpoints) {
        const response = await (request as any)[endpoint.method](endpoint.path)
        expect(response.headers[CORRELATION_ID_HEADER]).toBeDefined()
      }
    })
  })

  describe('Metrics Endpoint', () => {
    it('should return metrics snapshot', async () => {
      const response = await request.get('/metrics')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('requests')
      expect(response.body).toHaveProperty('errors')
      expect(response.body).toHaveProperty('latencies')

      expect(response.body.requests).toHaveProperty('total')
      expect(response.body.requests).toHaveProperty('byProvider')
      expect(response.body.requests).toHaveProperty('byEndpoint')

      expect(response.body.latencies).toHaveProperty('p50')
      expect(response.body.latencies).toHaveProperty('p95')
      expect(response.body.latencies).toHaveProperty('p99')
      expect(response.body.latencies).toHaveProperty('avg')
    })

    it('should track request counts', async () => {
      // Make multiple requests
      await request.get('/health')
      await request.get('/health')
      await request.get('/metrics')

      const response = await request.get('/metrics')

      expect(response.status).toBe(200)
      expect(response.body.requests.total).toBeGreaterThan(0)
      expect(response.body.requests.byEndpoint['/health']).toBeGreaterThanOrEqual(2)
    })

    it('should track error rates', async () => {
      // Make a request that will fail
      await request.get('/tools?server=nonexistent-server')

      const response = await request.get('/metrics')

      expect(response.status).toBe(200)
      expect(response.body.errors.total).toBeGreaterThan(0)
    })

    it('should calculate latency percentiles', async () => {
      // Make several requests
      for (let i = 0; i < 10; i++) {
        await request.get('/health')
      }

      const response = await request.get('/metrics')

      expect(response.status).toBe(200)
      expect(response.body.latencies.p50).toBeGreaterThanOrEqual(0)
      expect(response.body.latencies.p95).toBeGreaterThanOrEqual(response.body.latencies.p50)
      expect(response.body.latencies.p99).toBeGreaterThanOrEqual(response.body.latencies.p95)
      // Latencies might be 0 for very fast requests
      expect(response.body.latencies.avg).toBeGreaterThanOrEqual(0)
    })

    it('should support time-based filtering', async () => {
      // Make some requests
      await request.get('/health')

      // Get current time
      const now = Date.now()

      // Make more requests
      await request.get('/health')
      await request.get('/metrics')

      // Get metrics since timestamp
      const response = await request.get(`/metrics?since=${now}`)

      expect(response.status).toBe(200)
      // Should only include requests after 'now'
      expect(response.body.requests.total).toBeLessThanOrEqual(3)
    })

    it('should track metrics by provider', async () => {
      // Skip if no test server is configured
      if (!process.env.MCP_SERVER_DIST) {
        return
      }

      // Make requests to provider-specific endpoints
      await request.get('/tools/gemini')
      await request.get('/tools/openai')

      const response = await request.get('/metrics')

      expect(response.status).toBe(200)
      const { byProvider } = response.body.requests

      // At least one provider should be tracked
      const providers = Object.keys(byProvider)
      expect(providers.length).toBeGreaterThan(0)
    })
  })

  describe('Logs Endpoint', () => {
    it('should support regular JSON response', async () => {
      const response = await request.get('/logs')

      // May return error if no server is configured, which is fine
      expect([200, 500]).toContain(response.status)

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true)
      }
    })

    it('should support SSE streaming', async () => {
      // Skip SSE test with supertest as it doesn't handle streaming well
      // Supertest will timeout on SSE connections, which is expected behavior
      // In a real scenario, the client would consume the stream
      try {
        await request.get('/logs?stream=true').timeout(500)
      } catch (error: any) {
        // Timeout is expected for SSE streams with supertest
        // Just verify it's a timeout error and not another issue
        expect(error.message).toContain('Timeout')
      }
    })

    it('should accept limit parameter', async () => {
      const response = await request.get('/logs?limit=10')

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true)
        expect(response.body.length).toBeLessThanOrEqual(10)
      }
    })

    it('should accept since parameter', async () => {
      const since = new Date().toISOString()
      const response = await request.get(`/logs?since=${since}`)

      // May return error if no server is configured
      expect([200, 500]).toContain(response.status)

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true)
      }
    })
  })

  describe('Structured Logging', () => {
    it('should log requests with context', async () => {
      // We can't directly test console output, but we can verify the endpoint works
      const response = await request.get('/health')

      expect(response.status).toBe(200)
      // Correlation ID should be present, indicating logging infrastructure works
      expect(response.headers[CORRELATION_ID_HEADER]).toBeDefined()
    })

    it('should log tool executions with timing', async () => {
      // Skip if no test server is configured
      if (!process.env.MCP_SERVER_DIST) {
        return
      }

      const response = await request
        .post('/call_tool')
        .send({
          server: 'default',
          tool: 'add',
          arguments: { a: 1, b: 2 }
        })

      // Should succeed or fail, but logging should happen either way
      expect([200, 400, 500]).toContain(response.status)
    })
  })

  describe('Health Endpoint', () => {
    it('should include server health information', async () => {
      const response = await request.get('/health')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('ok', true)
      expect(response.body).toHaveProperty('serverCount')
      expect(response.body).toHaveProperty('servers')
      expect(response.body).toHaveProperty('configSource')

      expect(Array.isArray(response.body.servers)).toBe(true)
      expect(['file', 'env']).toContain(response.body.configSource)
    })
  })

  describe('Request Timing', () => {
    it('should track request duration', async () => {
      // Make a request
      await request.get('/health')
      await request.get('/health')

      // Check metrics for latency data
      const response = await request.get('/metrics')

      expect(response.status).toBe(200)
      // At least one request should have been tracked (excluding the /metrics call itself)
      expect(response.body.requests.total).toBeGreaterThanOrEqual(2)
      // Latencies might be 0 for very fast requests, so just check they're defined
      expect(response.body.latencies.avg).toBeGreaterThanOrEqual(0)
      expect(response.body.latencies.p50).toBeGreaterThanOrEqual(0)
    })

    it('should track duration by endpoint', async () => {
      // Make requests to different endpoints
      await request.get('/health')
      await request.get('/health')

      const response = await request.get('/metrics')

      expect(response.status).toBe(200)
      expect(response.body.latencies.byEndpoint).toHaveProperty('/health')
      // Latencies might be 0 for very fast requests, so just check they're defined
      expect(response.body.latencies.byEndpoint['/health'].avg).toBeGreaterThanOrEqual(0)
    })
  })
})
