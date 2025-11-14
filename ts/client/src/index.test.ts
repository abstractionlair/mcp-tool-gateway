/**
 * Tests for MCP Tool Gateway TypeScript Client
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GatewayClient, type Provider, type HealthStatus, type LogEntry } from './index';

// Mock fetch globally
global.fetch = vi.fn();

describe('GatewayClient', () => {
  let client: GatewayClient;
  const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new GatewayClient({
      baseUrl: 'http://localhost:8787',
      timeoutMs: 5000,
      maxRetries: 2,
      retryDelayMs: 100
    });
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultClient = new GatewayClient({ baseUrl: 'http://test' });
      expect(defaultClient).toBeDefined();
    });

    it('should accept custom retry configuration', () => {
      const customClient = new GatewayClient({
        baseUrl: 'http://test',
        maxRetries: 5,
        retryDelayMs: 2000,
        retryBackoff: 3.0
      });
      expect(customClient).toBeDefined();
    });
  });

  describe('getTools', () => {
    it('should fetch Gemini tools successfully', async () => {
      const mockTools = {
        function_declarations: [
          { name: 'add', description: 'Add two numbers' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTools,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const result = await client.getTools('gemini', 'default');
      expect(result).toEqual(mockTools);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/tools/gemini?server=default',
        expect.any(Object)
      );
    });

    it('should fetch OpenAI tools successfully', async () => {
      const mockTools = {
        tools: [
          { type: 'function', function: { name: 'add', description: 'Add two numbers' } }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTools,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const result = await client.getTools('openai');
      expect(result).toEqual(mockTools);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/tools/openai',
        expect.any(Object)
      );
    });

    it('should URL encode server parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ function_declarations: [] }),
        headers: new Headers({ 'content-type': 'application/json' })
      });

      await client.getTools('gemini', 'my server');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/tools/gemini?server=my%20server',
        expect.any(Object)
      );
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'Server not found'
      });

      await expect(client.getTools('gemini', 'nonexistent')).rejects.toThrow(
        'Gateway HTTP 404'
      );
    });

    it('should handle JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Failed to connect to MCP server' })
      });

      await expect(client.getTools('gemini')).rejects.toThrow();
    });
  });

  describe('execute', () => {
    it('should execute Gemini tool call successfully', async () => {
      const mockResult = { result: 42 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const result = await client.execute('gemini', {
        name: 'add',
        args: { a: 15, b: 27 }
      }, 'default');

      expect(result).toBe(42);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/execute',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'gemini',
            call: { name: 'add', args: { a: 15, b: 27 } },
            server: 'default'
          })
        })
      );
    });

    it('should execute OpenAI tool call successfully', async () => {
      const mockResult = { result: 42 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const result = await client.execute('openai', {
        name: 'add',
        arguments: '{"a": 15, "b": 27}'
      });

      expect(result).toBe(42);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/execute',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            provider: 'openai',
            call: { name: 'add', arguments: '{"a": 15, "b": 27}' }
          })
        })
      );
    });

    it('should handle execution errors', async () => {
      const mockResult = { error: 'Tool not found' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      await expect(client.execute('gemini', { name: 'invalid' })).rejects.toThrow(
        'Tool not found'
      );
    });
  });

  describe('callTool', () => {
    it('should call tool using legacy format', async () => {
      const mockResult = { result: 30 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const result = await client.callTool('default', 'add', { a: 10, b: 20 });

      expect(result).toBe(30);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/call_tool',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            server: 'default',
            tool: 'add',
            arguments: { a: 10, b: 20 }
          })
        })
      );
    });
  });

  describe('tools', () => {
    it('should fetch raw MCP tools', async () => {
      const mockTools = {
        tools: [
          { name: 'add', inputSchema: { type: 'object' } }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTools,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const result = await client.tools('default');
      expect(result).toEqual(mockTools);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/tools?server=default',
        expect.any(Object)
      );
    });

    it('should fetch tools without server parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: [] }),
        headers: new Headers({ 'content-type': 'application/json' })
      });

      await client.tools();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/tools',
        expect.any(Object)
      );
    });
  });

  describe('logs', () => {
    it('should fetch logs with all parameters', async () => {
      const mockLogs: LogEntry[] = [
        {
          timestamp: '2025-01-01T00:00:00Z',
          tool: 'add',
          input: { a: 1, b: 2 },
          result: 3
        }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLogs,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const result = await client.logs('default', '2025-01-01T00:00:00Z', 50);
      expect(result).toEqual(mockLogs);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/logs?server=default&limit=50&since=2025-01-01T00%3A00%3A00Z',
        expect.any(Object)
      );
    });

    it('should fetch logs with default limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
        headers: new Headers({ 'content-type': 'application/json' })
      });

      await client.logs('default');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/logs?server=default&limit=100',
        expect.any(Object)
      );
    });
  });

  describe('health', () => {
    it('should fetch health status', async () => {
      const mockHealth: HealthStatus = {
        ok: true,
        servers: [{ name: 'default', status: 'connected' }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealth,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const result = await client.health();
      expect(result).toEqual(mockHealth);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/health',
        expect.any(Object)
      );
    });
  });

  describe('retry logic', () => {
    it('should retry on network errors', async () => {
      // First two attempts fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true }),
          headers: new Headers({ 'content-type': 'application/json' })
        });

      const result = await client.health();
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Invalid request' })
      });

      await expect(client.health()).rejects.toThrow('Gateway HTTP 400');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retry
    });

    it('should retry on 5xx errors', async () => {
      // First attempt fails with 500, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers({ 'content-type': 'text/plain' }),
          text: async () => 'Server error'
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true }),
          headers: new Headers({ 'content-type': 'application/json' })
        });

      const result = await client.health();
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.health()).rejects.toThrow('Request failed after 3 attempts');
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('timeout handling', () => {
    it('should timeout long requests', async () => {
      // Simulate an AbortError which is what happens on timeout
      mockFetch.mockImplementationOnce(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const timeoutClient = new GatewayClient({
        baseUrl: 'http://localhost:8787',
        timeoutMs: 1000,
        maxRetries: 0
      });

      await expect(timeoutClient.health()).rejects.toThrow('Request timeout');
    });
  });

  describe('type safety', () => {
    it('should enforce Provider type', () => {
      const validProviders: Provider[] = ['gemini', 'openai', 'xai'];
      expect(validProviders).toHaveLength(3);
    });
  });
});
