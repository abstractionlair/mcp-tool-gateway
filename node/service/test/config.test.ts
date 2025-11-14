import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigLoader } from '../src/config.js'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('ConfigLoader', () => {
  const testConfigPath = './test-config.json'
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original env vars
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv }

    // Clean up test config file
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath)
    }
  })

  describe('load from config file', () => {
    it('loads valid stdio server config', () => {
      const config = {
        servers: {
          'test-server': {
            transport: 'stdio',
            command: 'node',
            args: ['/path/to/server.js'],
            env: {
              BASE_PATH: '/data'
            },
            logPath: '/var/log/test.log'
          }
        }
      }

      writeFileSync(testConfigPath, JSON.stringify(config))
      process.env.MCP_CONFIG_PATH = testConfigPath

      const result = ConfigLoader.load()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'test-server',
        transport: 'stdio',
        command: 'node',
        args: ['/path/to/server.js'],
        env: { BASE_PATH: '/data' },
        url: undefined,
        logPath: '/var/log/test.log'
      })
    })

    it('loads valid http server config', () => {
      const config = {
        servers: {
          'remote-server': {
            transport: 'http',
            url: 'http://localhost:3001/sse',
            logPath: '/var/log/remote.log'
          }
        }
      }

      writeFileSync(testConfigPath, JSON.stringify(config))
      process.env.MCP_CONFIG_PATH = testConfigPath

      const result = ConfigLoader.load()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'remote-server',
        transport: 'http',
        command: undefined,
        args: undefined,
        env: undefined,
        url: 'http://localhost:3001/sse',
        logPath: '/var/log/remote.log'
      })
    })

    it('loads multiple servers', () => {
      const config = {
        servers: {
          'server1': {
            transport: 'stdio',
            command: 'node',
            args: ['/path/to/server1.js']
          },
          'server2': {
            transport: 'http',
            url: 'http://localhost:3002/sse'
          },
          'server3': {
            command: 'python',
            args: ['/path/to/server3.py']
            // transport defaults to stdio
          }
        }
      }

      writeFileSync(testConfigPath, JSON.stringify(config))
      process.env.MCP_CONFIG_PATH = testConfigPath

      const result = ConfigLoader.load()

      expect(result).toHaveLength(3)
      expect(result.map(s => s.name)).toEqual(['server1', 'server2', 'server3'])
      expect(result[2].transport).toBe('stdio') // default transport
    })

    it('throws error for stdio server missing command', () => {
      const config = {
        servers: {
          'bad-server': {
            transport: 'stdio',
            args: ['/path/to/server.js']
            // missing command
          }
        }
      }

      writeFileSync(testConfigPath, JSON.stringify(config))
      process.env.MCP_CONFIG_PATH = testConfigPath

      expect(() => ConfigLoader.load()).toThrow('stdio transport requires "command" field')
    })

    it('throws error for http server missing url', () => {
      const config = {
        servers: {
          'bad-server': {
            transport: 'http'
            // missing url
          }
        }
      }

      writeFileSync(testConfigPath, JSON.stringify(config))
      process.env.MCP_CONFIG_PATH = testConfigPath

      expect(() => ConfigLoader.load()).toThrow('http transport requires "url" field')
    })

    it('throws error for invalid transport type', () => {
      const config = {
        servers: {
          'bad-server': {
            transport: 'websocket', // invalid
            command: 'node',
            args: ['/path/to/server.js']
          }
        }
      }

      writeFileSync(testConfigPath, JSON.stringify(config))
      process.env.MCP_CONFIG_PATH = testConfigPath

      expect(() => ConfigLoader.load()).toThrow('invalid transport type')
    })

    it('throws error for invalid JSON', () => {
      writeFileSync(testConfigPath, 'not valid json {')
      process.env.MCP_CONFIG_PATH = testConfigPath

      expect(() => ConfigLoader.load()).toThrow('Failed to load config')
    })

    it('throws error for config without servers object', () => {
      const config = {
        notServers: {}
      }

      writeFileSync(testConfigPath, JSON.stringify(config))
      process.env.MCP_CONFIG_PATH = testConfigPath

      expect(() => ConfigLoader.load()).toThrow('must have a "servers" object')
    })

    it('handles empty servers object', () => {
      const config = {
        servers: {}
      }

      writeFileSync(testConfigPath, JSON.stringify(config))
      process.env.MCP_CONFIG_PATH = testConfigPath

      const result = ConfigLoader.load()
      expect(result).toHaveLength(0)
    })
  })

  describe('load from environment variables (legacy)', () => {
    it('loads single server from env vars', () => {
      process.env.MCP_SERVER_DIST = '/path/to/dist/index.js'
      process.env.MCP_BASE_PATH = '/data'
      process.env.MCP_LOG_PATH = '/var/log/mcp.log'
      delete process.env.MCP_CONFIG_PATH

      const result = ConfigLoader.load()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('default')
      expect(result[0].transport).toBe('stdio')
      expect(result[0].args).toContain('/path/to/dist/index.js')
      expect(result[0].env?.BASE_PATH).toBe('/data')
      expect(result[0].env?.MCP_CALL_LOG).toBe('/var/log/mcp.log')
      expect(result[0].logPath).toBe('/var/log/mcp.log')
    })

    it('returns empty array when env vars not set', () => {
      delete process.env.MCP_SERVER_DIST
      delete process.env.MCP_BASE_PATH
      delete process.env.MCP_CONFIG_PATH

      const result = ConfigLoader.load()
      expect(result).toHaveLength(0)
    })

    it('returns empty array when only MCP_SERVER_DIST is set', () => {
      process.env.MCP_SERVER_DIST = '/path/to/dist/index.js'
      delete process.env.MCP_BASE_PATH
      delete process.env.MCP_CONFIG_PATH

      const result = ConfigLoader.load()
      expect(result).toHaveLength(0)
    })

    it('handles missing MCP_LOG_PATH', () => {
      process.env.MCP_SERVER_DIST = '/path/to/dist/index.js'
      process.env.MCP_BASE_PATH = '/data'
      delete process.env.MCP_LOG_PATH
      delete process.env.MCP_CONFIG_PATH

      const result = ConfigLoader.load()

      expect(result).toHaveLength(1)
      expect(result[0].env?.MCP_CALL_LOG).toBe('')
      expect(result[0].logPath).toBeUndefined()
    })
  })

  describe('config file priority', () => {
    it('prefers config file over env vars', () => {
      const config = {
        servers: {
          'file-server': {
            transport: 'http',
            url: 'http://localhost:3001/sse'
          }
        }
      }

      writeFileSync(testConfigPath, JSON.stringify(config))
      process.env.MCP_CONFIG_PATH = testConfigPath
      process.env.MCP_SERVER_DIST = '/path/to/dist/index.js'
      process.env.MCP_BASE_PATH = '/data'

      const result = ConfigLoader.load()

      // Should load from file, not env vars
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('file-server')
      expect(result[0].transport).toBe('http')
    })

    it('falls back to env vars when config file does not exist', () => {
      delete process.env.MCP_CONFIG_PATH
      process.env.MCP_SERVER_DIST = '/path/to/dist/index.js'
      process.env.MCP_BASE_PATH = '/data'

      const result = ConfigLoader.load()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('default')
    })
  })

  describe('hasConfigFile', () => {
    it('returns true when config file exists', () => {
      const config = { servers: {} }
      writeFileSync(testConfigPath, JSON.stringify(config))
      process.env.MCP_CONFIG_PATH = testConfigPath

      expect(ConfigLoader.hasConfigFile()).toBe(true)
    })

    it('returns false when config file does not exist', () => {
      process.env.MCP_CONFIG_PATH = './nonexistent-config.json'

      expect(ConfigLoader.hasConfigFile()).toBe(false)
    })

    it('checks default path when MCP_CONFIG_PATH not set', () => {
      delete process.env.MCP_CONFIG_PATH

      // Default path is ./mcp-gateway-config.json
      const result = ConfigLoader.hasConfigFile()

      // Will be false unless the default file actually exists
      expect(typeof result).toBe('boolean')
    })
  })
})
