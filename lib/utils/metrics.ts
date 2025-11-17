/**
 * Metrics collection utility
 * Provides application metrics for monitoring and observability
 */

import { env } from "@/lib/env"

interface Metric {
  name: string
  value: number
  timestamp: number
  tags?: Record<string, string>
}

interface Counter {
  name: string
  value: number
  tags?: Record<string, string>
}

interface Histogram {
  name: string
  values: number[]
  tags?: Record<string, string>
}

// In-memory metrics storage (in production, this would be sent to a metrics service)
class MetricsCollector {
  private counters: Map<string, Counter> = new Map()
  private histograms: Map<string, Histogram> = new Map()
  private metrics: Metric[] = []

  /**
   * Increment a counter
   */
  increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags)
    const existing = this.counters.get(key)
    
    if (existing) {
      existing.value += value
    } else {
      this.counters.set(key, { name, value, tags })
    }
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags)
    const existing = this.histograms.get(key)
    
    if (existing) {
      existing.values.push(value)
      // Keep only last 1000 values to prevent memory issues
      if (existing.values.length > 1000) {
        existing.values = existing.values.slice(-1000)
      }
    } else {
      this.histograms.set(key, { name, values: [value], tags })
    }
  }

  /**
   * Record a gauge value
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
      tags,
    })
    
    // Keep only last 1000 metrics to prevent memory issues
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000)
    }
  }

  /**
   * Get all counters
   */
  getCounters(): Counter[] {
    return Array.from(this.counters.values())
  }

  /**
   * Get all histograms with statistics
   */
  getHistograms(): Array<Histogram & { min: number; max: number; avg: number; p50: number; p95: number; p99: number }> {
    return Array.from(this.histograms.values()).map(hist => {
      const sorted = [...hist.values].sort((a, b) => a - b)
      const sum = sorted.reduce((a, b) => a + b, 0)
      
      return {
        ...hist,
        min: sorted[0] || 0,
        max: sorted[sorted.length - 1] || 0,
        avg: sum / sorted.length || 0,
        p50: this.percentile(sorted, 50),
        p95: this.percentile(sorted, 95),
        p99: this.percentile(sorted, 99),
      }
    })
  }

  /**
   * Get all gauges
   */
  getGauges(): Metric[] {
    return [...this.metrics]
  }

  /**
   * Get all metrics as a summary
   */
  getSummary() {
    return {
      counters: this.getCounters(),
      histograms: this.getHistograms(),
      gauges: this.getGauges(),
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.counters.clear()
    this.histograms.clear()
    this.metrics = []
  }

  private getKey(name: string, tags?: Record<string, string>): string {
    if (!tags) return name
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(",")
    return `${name}:${tagStr}`
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)] || 0
  }
}

// Singleton instance
export const metrics = new MetricsCollector()

/**
 * Helper to measure execution time
 */
export async function measureTime<T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>,
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    const duration = Date.now() - start
    metrics.histogram(name, duration, { ...tags, status: "success" })
    return result
  } catch (error) {
    const duration = Date.now() - start
    metrics.histogram(name, duration, { ...tags, status: "error" })
    throw error
  }
}

/**
 * Helper to measure synchronous execution time
 */
export function measureTimeSync<T>(
  name: string,
  fn: () => T,
  tags?: Record<string, string>,
): T {
  const start = Date.now()
  try {
    const result = fn()
    const duration = Date.now() - start
    metrics.histogram(name, duration, { ...tags, status: "success" })
    return result
  } catch (error) {
    const duration = Date.now() - start
    metrics.histogram(name, duration, { ...tags, status: "error" })
    throw error
  }
}

