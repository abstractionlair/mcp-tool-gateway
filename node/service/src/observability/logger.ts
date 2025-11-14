import { getCorrelationId } from './correlation.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  correlationId?: string
  provider?: string
  server?: string
  tool?: string
  duration?: number
  error?: string
  [key: string]: any
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context: LogContext
}

/**
 * Structured logger with correlation ID and provider context support.
 */
export class Logger {
  private minLevel: LogLevel

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = minLevel
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    const minIndex = levels.indexOf(this.minLevel)
    const currentIndex = levels.indexOf(level)
    return currentIndex >= minIndex
  }

  private log(level: LogLevel, message: string, context: LogContext = {}): void {
    if (!this.shouldLog(level)) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        correlationId: getCorrelationId(),
        ...context,
      },
    }

    // Log to console in structured format
    const output = JSON.stringify(entry)

    switch (level) {
      case 'error':
        console.error(output)
        break
      case 'warn':
        console.warn(output)
        break
      default:
        console.log(output)
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context)
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context)
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context)
  }

  /**
   * Log a request with timing information.
   */
  logRequest(method: string, path: string, statusCode: number, duration: number, context: LogContext = {}): void {
    this.info(`${method} ${path} ${statusCode}`, {
      ...context,
      method,
      path,
      statusCode,
      duration,
    })
  }

  /**
   * Log tool execution with timing information.
   */
  logToolExecution(tool: string, server: string, duration: number, success: boolean, context: LogContext = {}): void {
    const level = success ? 'info' : 'error'
    const message = `Tool execution: ${tool} on ${server} (${duration}ms)`
    this.log(level, message, {
      ...context,
      tool,
      server,
      duration,
      success,
    })
  }
}

// Global logger instance
export const logger = new Logger(process.env.LOG_LEVEL as LogLevel || 'info')
