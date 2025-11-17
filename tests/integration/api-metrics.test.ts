import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET as metricsGet } from "@/app/api/metrics/route"
import { NextRequest } from "next/server"
import { metrics } from "@/lib/utils/metrics"

describe("Metrics API Endpoint", () => {
  const mockRequest = new NextRequest("http://localhost:3000/api/metrics")

  beforeEach(() => {
    metrics.reset()
    vi.clearAllMocks()
  })

  describe("GET /api/metrics", () => {
    it("returns metrics in JSON format by default", async () => {
      // Add some test metrics
      metrics.increment("test.counter", 5)
      metrics.histogram("test.histogram", 100)
      metrics.gauge("test.gauge", 42)

      const response = await metricsGet(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.counters).toBeDefined()
      expect(data.histograms).toBeDefined()
      expect(data.gauges).toBeDefined()
      expect(data.timestamp).toBeDefined()
    })

    it("returns metrics in Prometheus format when requested", async () => {
      metrics.increment("test.counter", 1, { tag: "value" })
      metrics.histogram("test.histogram", 100)

      const prometheusRequest = new NextRequest("http://localhost:3000/api/metrics?format=prometheus")
      const response = await metricsGet(prometheusRequest)
      const text = await response.text()

      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe("text/plain; version=0.0.4")
      expect(text).toContain("test.counter")
      expect(text).toContain("test.histogram")
    })

    it("handles errors gracefully", async () => {
      // Mock metrics.getSummary to throw an error
      const originalGetSummary = metrics.getSummary
      vi.spyOn(metrics, "getSummary").mockImplementation(() => {
        throw new Error("Test error")
      })

      const response = await metricsGet(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe("Failed to retrieve metrics")

      // Restore original
      vi.spyOn(metrics, "getSummary").mockImplementation(originalGetSummary)
    })
  })
})

