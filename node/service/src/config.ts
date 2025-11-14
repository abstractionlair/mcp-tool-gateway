import './env.js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ServerSpec } from './mcpManager.js'

/**
 * Configuration file format for multi-server setup.
 *
 * Example:
 * {
 *   "servers": {
 *     "filesystem": {
 *       "transport": "stdio",
 *       "command": "node",
 *       "args": ["/path/to/server/dist/index.js"],
 *       "env": {
 *         "BASE_PATH": "/data"
 *       },
 *       "logPath": "/path/to/logs/filesystem.log"
 *     },
 *     "weather": {
 *       "transport": "http",
 *       "url": "http://localhost:3001/sse",
 *       "logPath": "/path/to/logs/weather.log"
 *     }
 *   }
 * }
 */
export interface GatewayConfig {
  servers: Record<string, ServerConfigEntry>
}

export interface ServerConfigEntry {
  transport?: 'stdio' | 'http'
  // Stdio fields
  command?: string
  args?: string[]
  env?: Record<string, string>
  // HTTP fields
  url?: string
  // Common fields
  logPath?: string
}

export class ConfigLoader {
  /**
   * Load configuration from file or environment variables.
   * Priority:
   * 1. Config file specified by MCP_CONFIG_PATH env var
   * 2. Default config file at ./mcp-gateway-config.json
   * 3. Legacy single-server env vars (MCP_SERVER_DIST, MCP_BASE_PATH, MCP_LOG_PATH)
   */
  static load(): ServerSpec[] {
    // Try loading from config file
    const configPath = process.env.MCP_CONFIG_PATH ?? './mcp-gateway-config.json'

    if (existsSync(configPath)) {
      try {
        const config = this.loadFromFile(configPath)
        return this.validateAndConvert(config)
      } catch (error: any) {
        throw new Error(`Failed to load config from ${configPath}: ${error.message}`)
      }
    }

    // Fall back to legacy env vars for backward compatibility
    return this.loadFromEnv()
  }

  /**
   * Load configuration from a JSON file.
   */
  private static loadFromFile(path: string): GatewayConfig {
    const content = readFileSync(resolve(path), 'utf-8')
    const config = JSON.parse(content)

    if (!config || typeof config !== 'object') {
      throw new Error('Config file must contain a JSON object')
    }

    if (!config.servers || typeof config.servers !== 'object') {
      throw new Error('Config file must have a "servers" object')
    }

    return config as GatewayConfig
  }

  /**
   * Load single-server configuration from environment variables (legacy mode).
   */
  private static loadFromEnv(): ServerSpec[] {
    const dist = process.env.MCP_SERVER_DIST
    const base = process.env.MCP_BASE_PATH
    const log = process.env.MCP_LOG_PATH

    if (!dist || !base) {
      console.warn('No config file found and MCP_SERVER_DIST/MCP_BASE_PATH not set. Gateway will start with no servers.')
      return []
    }

    console.log('Using legacy env var configuration (MCP_SERVER_DIST, MCP_BASE_PATH)')

    return [{
      name: 'default',
      transport: 'stdio',
      command: process.execPath,
      args: [dist],
      env: { BASE_PATH: base, MCP_CALL_LOG: log ?? '' },
      logPath: log,
    }]
  }

  /**
   * Validate and convert GatewayConfig to ServerSpec array.
   */
  private static validateAndConvert(config: GatewayConfig): ServerSpec[] {
    const specs: ServerSpec[] = []

    for (const [name, entry] of Object.entries(config.servers)) {
      const transport = entry.transport ?? 'stdio'

      // Validate based on transport type
      if (transport === 'stdio') {
        if (!entry.command) {
          throw new Error(`Server "${name}": stdio transport requires "command" field`)
        }
      } else if (transport === 'http') {
        if (!entry.url) {
          throw new Error(`Server "${name}": http transport requires "url" field`)
        }
      } else {
        throw new Error(`Server "${name}": invalid transport type "${transport}". Must be "stdio" or "http"`)
      }

      specs.push({
        name,
        transport,
        command: entry.command,
        args: entry.args,
        env: entry.env,
        url: entry.url,
        logPath: entry.logPath,
      })
    }

    if (specs.length === 0) {
      console.warn('Config file has no servers defined')
    }

    return specs
  }

  /**
   * Helper to check if a config file exists.
   */
  static hasConfigFile(): boolean {
    const configPath = process.env.MCP_CONFIG_PATH ?? './mcp-gateway-config.json'
    return existsSync(configPath)
  }
}
