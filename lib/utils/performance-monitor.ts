/**
 * Performance monitoring utility
 * Tracks and reports performance metrics for critical operations
 */

import { metrics } from "@/lib/utils/metrics"
import { logger } from "@/lib/utils/logger"

interface PerformanceThreshold {
  warning: number // milliseconds - log warning if exceeded
  error: number // milliseconds - log error if exceeded
}

const DEFAULT_THRESHOLDS: Record<string, PerformanceThreshold> = {
  "api.request": { warning: 1000, error: 5000 },
  "database.query": { warning: 500, error: 2000 },
  "cache.operation": { warning: 100, error: 500 },
  "rag.search": { warning: 2000, error: 10000 },
  "openai.request": { warning: 3000, error: 15000 },
}

/**
 * Monitor performance of an async operation
 */
export async function monitorPerformance<T>(
  operationName: string,
  operation: () => Promise<T>,
  customThresholds?: PerformanceThreshold,
): Promise<T> {
  const startTime = Date.now()
  const thresholds = customThresholds || DEFAULT_THRESHOLDS[operationName] || { warning: 1000, error: 5000 }

  try {
    const result = await operation()
    const duration = Date.now() - startTime

    // Record metric
    metrics.histogram("performance.operation.duration", duration, {
      operation: operationName,
      status: "success",
    })

    // Check thresholds and log if exceeded
    if (duration >= thresholds.error) {
      logger.error(`[Performance] Operation ${operationName} exceeded error threshold`, undefined, {
        duration,
        threshold: thresholds.error,
        operation: operationName,
      })
    } else if (duration >= thresholds.warning) {
      logger.warn(`[Performance] Operation ${operationName} exceeded warning threshold`, {
        duration,
        threshold: thresholds.warning,
        operation: operationName,
      })
    }

    return result
  } catch (error) {
    const duration = Date.now() - startTime

    // Record error metric
    metrics.histogram("performance.operation.duration", duration, {
      operation: operationName,
      status: "error",
    })

    logger.error(`[Performance] Operation ${operationName} failed`, error, {
      duration,
      operation: operationName,
    })

    throw error
  }
}

/**
 * Monitor performance of a synchronous operation
 */
export function monitorPerformanceSync<T>(
  operationName: string,
  operation: () => T,
  customThresholds?: PerformanceThreshold,
): T {
  const startTime = Date.now()
  const thresholds = customThresholds || DEFAULT_THRESHOLDS[operationName] || { warning: 1000, error: 5000 }

  try {
    const result = operation()
    const duration = Date.now() - startTime

    // Record metric
    metrics.histogram("performance.operation.duration", duration, {
      operation: operationName,
      status: "success",
    })

    // Check thresholds and log if exceeded
    if (duration >= thresholds.error) {
      logger.error(`[Performance] Operation ${operationName} exceeded error threshold`, undefined, {
        duration,
        threshold: thresholds.error,
        operation: operationName,
      })
    } else if (duration >= thresholds.warning) {
      logger.warn(`[Performance] Operation ${operationName} exceeded warning threshold`, {
        duration,
        threshold: thresholds.warning,
        operation: operationName,
      })
    }

    return result
  } catch (error) {
    const duration = Date.now() - startTime

    // Record error metric
    metrics.histogram("performance.operation.duration", duration, {
      operation: operationName,
      status: "error",
    })

    logger.error(`[Performance] Operation ${operationName} failed`, error, {
      duration,
      operation: operationName,
    })

    throw error
  }
}

/**
 * Track slow queries
 */
export function trackSlowQuery(queryName: string, duration: number, threshold: number = 1000): void {
  if (duration >= threshold) {
    logger.warn(`[Performance] Slow query detected: ${queryName}`, {
      duration,
      threshold,
      query: queryName,
    })
    metrics.increment("database.slow_query", 1, { query: queryName })
  }
}

/**
 * Track cache performance
 */
export function trackCachePerformance(
  operation: "hit" | "miss" | "set",
  duration: number,
  backend: "redis" | "memory" = "redis",
): void {
  metrics.histogram("cache.operation.duration", duration, { operation, backend })
  metrics.increment(`cache.${operation}`, 1, { backend })
}

/**
 * Get performance summary
 */
export function getPerformanceSummary() {
  const summary = metrics.getSummary()
  
  // Calculate performance statistics
  const apiRequests = summary.histograms.find(h => h.name === "api.request.duration")
  const dbQueries = summary.histograms.find(h => h.name === "database.query.duration")
  const cacheOps = summary.histograms.find(h => h.name === "cache.operation.duration")

  return {
    api: apiRequests
      ? {
          avg: apiRequests.avg,
          p95: apiRequests.p95,
          p99: apiRequests.p99,
          max: apiRequests.max,
        }
      : null,
    database: dbQueries
      ? {
          avg: dbQueries.avg,
          p95: dbQueries.p95,
          p99: dbQueries.p99,
          max: dbQueries.max,
        }
      : null,
    cache: cacheOps
      ? {
          avg: cacheOps.avg,
          p95: cacheOps.p95,
          p99: cacheOps.p99,
          max: cacheOps.max,
        }
      : null,
    timestamp: new Date().toISOString(),
  }
}

