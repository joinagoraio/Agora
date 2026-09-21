import { describe, it, expect, beforeEach } from "vitest"
import { metrics, measureTime, measureTimeSync } from "@/lib/utils/metrics"

describe("Metrics", () => {
  beforeEach(() => {
    metrics.reset()
  })

  describe("increment", () => {
    it("increments a counter", () => {
      metrics.increment("test.counter", 1)
      metrics.increment("test.counter", 2)
      
      const counters = metrics.getCounters()
      const counter = counters.find(c => c.name === "test.counter")
      expect(counter?.value).toBe(3)
    })

    it("increments counters with tags separately", () => {
      metrics.increment("test.counter", 1, { tag: "a" })
      metrics.increment("test.counter", 1, { tag: "b" })
      
      const counters = metrics.getCounters()
      expect(counters.length).toBe(2)
    })
  })

  describe("histogram", () => {
    it("records histogram values", () => {
      metrics.histogram("test.histogram", 100)
      metrics.histogram("test.histogram", 200)
      metrics.histogram("test.histogram", 300)
      
      const histograms = metrics.getHistograms()
      const hist = histograms.find(h => h.name === "test.histogram")
      expect(hist?.values.length).toBe(3)
      expect(hist?.min).toBe(100)
      expect(hist?.max).toBe(300)
      expect(hist?.avg).toBe(200)
    })

    it("calculates percentiles correctly", () => {
      // Add 100 values from 1 to 100
      for (let i = 1; i <= 100; i++) {
        metrics.histogram("test.percentile", i)
      }
      
      const histograms = metrics.getHistograms()
      const hist = histograms.find(h => h.name === "test.percentile")
      expect(hist?.p50).toBe(50)
      expect(hist?.p95).toBe(95)
      expect(hist?.p99).toBe(99)
    })
  })

  describe("gauge", () => {
    it("records gauge values", () => {
      metrics.gauge("test.gauge", 42, { unit: "bytes" })
      
      const gauges = metrics.getGauges()
      const gauge = gauges.find(g => g.name === "test.gauge")
      expect(gauge?.value).toBe(42)
      expect(gauge?.tags?.unit).toBe("bytes")
    })
  })

  describe("measureTime", () => {
    it("measures async operation duration", async () => {
      await measureTime("test.async", async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return "result"
      })
      
      const histograms = metrics.getHistograms()
      const hist = histograms.find(h => h.name === "test.async")
      expect(hist).toBeDefined()
      expect(hist?.values.length).toBe(1)
      expect(hist?.values[0]).toBeGreaterThanOrEqual(0)
    })

    it("records error status on failure", async () => {
      await expect(
        measureTime("test.async.error", async () => {
          throw new Error("Test error")
        })
      ).rejects.toThrow("Test error")
      
      const histograms = metrics.getHistograms()
      const hist = histograms.find(h => h.name === "test.async.error")
      expect(hist?.tags?.status).toBe("error")
    })
  })

  describe("measureTimeSync", () => {
    it("measures sync operation duration", () => {
      const result = measureTimeSync("test.sync", () => {
        return "result"
      })
      
      expect(result).toBe("result")
      
      const histograms = metrics.getHistograms()
      const hist = histograms.find(h => h.name === "test.sync")
      expect(hist).toBeDefined()
    })
  })

  describe("getSummary", () => {
    it("returns complete metrics summary", () => {
      metrics.increment("counter", 1)
      metrics.histogram("histogram", 100)
      metrics.gauge("gauge", 50)
      
      const summary = metrics.getSummary()
      expect(summary.counters.length).toBe(1)
      expect(summary.histograms.length).toBe(1)
      expect(summary.gauges.length).toBe(1)
      expect(summary.timestamp).toBeDefined()
    })
  })

  describe("reset", () => {
    it("clears all metrics", () => {
      metrics.increment("counter", 1)
      metrics.histogram("histogram", 100)
      metrics.gauge("gauge", 50)
      
      metrics.reset()
      
      const summary = metrics.getSummary()
      expect(summary.counters.length).toBe(0)
      expect(summary.histograms.length).toBe(0)
      expect(summary.gauges.length).toBe(0)
    })
  })
})

