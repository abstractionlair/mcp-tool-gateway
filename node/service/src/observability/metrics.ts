/**
 * Simple in-memory metrics collector for request counters, latencies, and error rates.
 * For production use, consider integrating with Prometheus, StatsD, or CloudWatch.
 */

export interface MetricSnapshot {
  requests: {
    total: number
    byProvider: Record<string, number>
    byEndpoint: Record<string, number>
  }
  errors: {
    total: number
    byProvider: Record<string, number>
    byEndpoint: Record<string, number>
  }
  latencies: {
    p50: number
    p95: number
    p99: number
    avg: number
    byProvider: Record<string, { p50: number; p95: number; p99: number; avg: number }>
    byEndpoint: Record<string, { p50: number; p95: number; p99: number; avg: number }>
  }
}

interface RequestMetric {
  timestamp: number
  endpoint: string
  provider?: string
  duration: number
  success: boolean
}

export class MetricsCollector {
  private requests: RequestMetric[] = []
  private readonly maxStoredRequests = 10000 // Keep last 10k requests in memory

  /**
   * Record a request with timing and success information.
   */
  recordRequest(endpoint: string, duration: number, success: boolean, provider?: string): void {
    this.requests.push({
      timestamp: Date.now(),
      endpoint,
      provider,
      duration,
      success,
    })

    // Trim old requests to prevent memory bloat
    if (this.requests.length > this.maxStoredRequests) {
      this.requests = this.requests.slice(-this.maxStoredRequests)
    }
  }

  /**
   * Calculate percentile from sorted array of numbers.
   */
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }

  /**
   * Calculate average from array of numbers.
   */
  private average(arr: number[]): number {
    if (arr.length === 0) return 0
    return arr.reduce((sum, val) => sum + val, 0) / arr.length
  }

  /**
   * Calculate latency statistics for a set of requests.
   */
  private calculateLatencies(requests: RequestMetric[]): { p50: number; p95: number; p99: number; avg: number } {
    const durations = requests.map(r => r.duration)
    return {
      p50: this.percentile(durations, 50),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
      avg: this.average(durations),
    }
  }

  /**
   * Get current metrics snapshot.
   */
  getSnapshot(since?: number): MetricSnapshot {
    const relevantRequests = since
      ? this.requests.filter(r => r.timestamp >= since)
      : this.requests

    // Count requests by provider
    const byProvider: Record<string, number> = {}
    const byEndpoint: Record<string, number> = {}
    const errorsByProvider: Record<string, number> = {}
    const errorsByEndpoint: Record<string, number> = {}
    const requestsByProvider: Record<string, RequestMetric[]> = {}
    const requestsByEndpoint: Record<string, RequestMetric[]> = {}

    for (const req of relevantRequests) {
      // Count by endpoint
      byEndpoint[req.endpoint] = (byEndpoint[req.endpoint] || 0) + 1
      if (!req.success) {
        errorsByEndpoint[req.endpoint] = (errorsByEndpoint[req.endpoint] || 0) + 1
      }

      // Group by endpoint for latency calculation
      if (!requestsByEndpoint[req.endpoint]) {
        requestsByEndpoint[req.endpoint] = []
      }
      requestsByEndpoint[req.endpoint].push(req)

      // Count by provider (if present)
      if (req.provider) {
        byProvider[req.provider] = (byProvider[req.provider] || 0) + 1
        if (!req.success) {
          errorsByProvider[req.provider] = (errorsByProvider[req.provider] || 0) + 1
        }

        // Group by provider for latency calculation
        if (!requestsByProvider[req.provider]) {
          requestsByProvider[req.provider] = []
        }
        requestsByProvider[req.provider].push(req)
      }
    }

    // Calculate latencies
    const overallLatencies = this.calculateLatencies(relevantRequests)
    const latenciesByProvider: Record<string, { p50: number; p95: number; p99: number; avg: number }> = {}
    const latenciesByEndpoint: Record<string, { p50: number; p95: number; p99: number; avg: number }> = {}

    for (const [provider, requests] of Object.entries(requestsByProvider)) {
      latenciesByProvider[provider] = this.calculateLatencies(requests)
    }

    for (const [endpoint, requests] of Object.entries(requestsByEndpoint)) {
      latenciesByEndpoint[endpoint] = this.calculateLatencies(requests)
    }

    return {
      requests: {
        total: relevantRequests.length,
        byProvider,
        byEndpoint,
      },
      errors: {
        total: relevantRequests.filter(r => !r.success).length,
        byProvider: errorsByProvider,
        byEndpoint: errorsByEndpoint,
      },
      latencies: {
        ...overallLatencies,
        byProvider: latenciesByProvider,
        byEndpoint: latenciesByEndpoint,
      },
    }
  }

  /**
   * Reset all metrics (useful for testing).
   */
  reset(): void {
    this.requests = []
  }

  /**
   * Get total number of stored requests.
   */
  getStoredRequestCount(): number {
    return this.requests.length
  }
}

// Global metrics collector instance
export const metrics = new MetricsCollector()
