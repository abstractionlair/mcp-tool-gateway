import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

export const CORRELATION_ID_HEADER = 'x-correlation-id'

// Extend Express Request interface to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId?: string
    }
  }
}

// AsyncLocalStorage provides proper async context isolation for correlation IDs
// Each request gets its own storage context that persists across all async operations
const asyncLocalStorage = new AsyncLocalStorage<string>()

/**
 * Express middleware to add correlation IDs to requests.
 * Accepts existing correlation ID from header or generates a new one.
 * Uses AsyncLocalStorage to ensure correlation IDs are safely scoped per request.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Get correlation ID from header or generate new one
  const correlationId = (req.headers[CORRELATION_ID_HEADER] as string) || randomUUID()

  // Store in request for easy access
  req.correlationId = correlationId

  // Set in response header
  res.setHeader(CORRELATION_ID_HEADER, correlationId)

  // Run the rest of the request handling in the correlation ID's async context
  // This ensures all async operations within this request can access the correlation ID
  asyncLocalStorage.run(correlationId, () => {
    next()
  })
}

/**
 * Get the current correlation ID from the request context.
 * First checks the request object (if provided), then falls back to AsyncLocalStorage.
 */
export function getCorrelationId(req?: Request): string | undefined {
  if (req) {
    return req.correlationId
  }
  return asyncLocalStorage.getStore()
}
