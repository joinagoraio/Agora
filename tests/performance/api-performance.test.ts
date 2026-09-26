import { describe, it, expect, beforeEach, vi } from "vitest"
import { monitorPerformance, getPerformanceSummary } from "@/lib/utils/performance-monitor"
import { metrics } from "@/lib/utils/metrics"

/** Runs an operation that waits `ms` on a fake clock, so the measured duration is exact rather than off by a millisecond. */
async function timedOperation(name: string, ms: number, thresholds?: { warning: number; error: number }) {
  vi.useFakeTimers()
  try {
    const run = monitorPerformance(
      name,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, ms))
        return "result"
      },
      thresholds,
    )
    await vi.advanceTimersByTimeAsync(ms)
    await run
  } finally {
    vi.useRealTimers()
  }
}

describe("Performance Monitoring", () => {
  beforeEach(() => {
    metrics.reset()
  })

  describe("monitorPerformance", () => {
    it("tracks operation duration", async () => {
      await timedOperation("test.operation", 10)

      const histograms = metrics.getHistograms()
      const hist = histograms.find(h => h.name === "performance.operation.duration")
      expect(hist).toBeDefined()
      expect(hist?.values.length).toBe(1)
      expect(hist?.values[0]).toBe(10)
    })

    it("tracks warning threshold violations", async () => {
      // Test that metrics are recorded even when threshold is exceeded
      await timedOperation("test.slow", 1100, { warning: 1000, error: 5000 })

      const histograms = metrics.getHistograms()
      const hist = histograms.find(h => h.name === "performance.operation.duration")
      expect(hist).toBeDefined()
      expect(hist?.values[0]).toBe(1100)
    })

    it("tracks error threshold violations", async () => {
      // Test that metrics are recorded even when error threshold is exceeded
      await timedOperation("test.very-slow", 200, { warning: 50, error: 100 })

      const histograms = metrics.getHistograms()
      const hist = histograms.find(h => h.name === "performance.operation.duration")
      expect(hist).toBeDefined()
      expect(hist?.values[0]).toBe(200)
    })

    it("tracks error status on failure", async () => {
      await expect(
        monitorPerformance("test.error", async () => {
          throw new Error("Test error")
        })
      ).rejects.toThrow("Test error")

      const histograms = metrics.getHistograms()
      const hist = histograms.find(h => h.name === "performance.operation.duration")
      expect(hist?.tags?.status).toBe("error")
    })
  })

  describe("getPerformanceSummary", () => {
    it("returns performance summary with metrics", () => {
      // Add some performance metrics
      metrics.histogram("api.request.duration", 100)
      metrics.histogram("database.query.duration", 50)
      metrics.histogram("cache.operation.duration", 10)

      const summary = getPerformanceSummary()
      expect(summary.timestamp).toBeDefined()
      expect(summary.api).toBeDefined()
      expect(summary.database).toBeDefined()
      expect(summary.cache).toBeDefined()
    })
  })
})

