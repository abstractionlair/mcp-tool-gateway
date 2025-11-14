import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'

export const CORRELATION_ID_HEADER = 'x-correlation-id'

// Extend Express Request interface to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId?: string
    }
  }
}

// Store correlation ID in async context
class CorrelationContext {
  private static storage = new Map<string, string>()

  static set(id: string): void {
    // Use process domain or async_hooks in production
    // For now, store in thread-local storage
    this.storage.set('current', id)
  }

  static get(): string | undefined {
    return this.storage.get('current')
  }

  static clear(): void {
    this.storage.delete('current')
  }
}

/**
 * Express middleware to add correlation IDs to requests.
 * Accepts existing correlation ID from header or generates a new one.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Get correlation ID from header or generate new one
  const correlationId = (req.headers[CORRELATION_ID_HEADER] as string) || randomUUID()

  // Store in request for easy access
  req.correlationId = correlationId

  // Set in response header
  res.setHeader(CORRELATION_ID_HEADER, correlationId)

  // Store in context for use in async operations
  CorrelationContext.set(correlationId)

  // Clean up after request
  res.on('finish', () => {
    CorrelationContext.clear()
  })

  next()
}

/**
 * Get the current correlation ID from the request context.
 */
export function getCorrelationId(req?: Request): string | undefined {
  if (req) {
    return req.correlationId
  }
  return CorrelationContext.get()
}
