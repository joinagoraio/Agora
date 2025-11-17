import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  deduplicateRequest,
  generateRequestKey,
  clearAllPendingRequests,
  getPendingRequestCount,
} from "@/lib/utils/request-deduplication"

describe("Request Deduplication", () => {
  beforeEach(() => {
    clearAllPendingRequests()
  })

  describe("generateRequestKey", () => {
    it("generates consistent keys for same parameters", () => {
      const key1 = generateRequestKey("test", { a: 1, b: 2 })
      const key2 = generateRequestKey("test", { b: 2, a: 1 }) // Different order
      expect(key1).toBe(key2)
    })

    it("generates different keys for different parameters", () => {
      const key1 = generateRequestKey("test", { a: 1 })
      const key2 = generateRequestKey("test", { a: 2 })
      expect(key1).not.toBe(key2)
    })

    it("generates different keys for different prefixes", () => {
      const key1 = generateRequestKey("prefix1", { a: 1 })
      const key2 = generateRequestKey("prefix2", { a: 1 })
      expect(key1).not.toBe(key2)
    })
  })

  describe("deduplicateRequest", () => {
    it("executes function on first call", async () => {
      const fn = vi.fn().mockResolvedValue("result")
      const key = "test-key"

      const result = await deduplicateRequest(key, fn)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(result).toBe("result")
    })

    it("deduplicates concurrent requests with same key", async () => {
      const fn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve("result"), 100))
      )
      const key = "test-key"

      // Start two concurrent requests
      const promise1 = deduplicateRequest(key, fn)
      const promise2 = deduplicateRequest(key, fn)

      const [result1, result2] = await Promise.all([promise1, promise2])

      // Function should only be called once
      expect(fn).toHaveBeenCalledTimes(1)
      expect(result1).toBe("result")
      expect(result2).toBe("result")
    })

    it("does not deduplicate requests with different keys", async () => {
      const fn = vi.fn().mockResolvedValue("result")

      await Promise.all([
        deduplicateRequest("key1", fn),
        deduplicateRequest("key2", fn),
      ])

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it("removes key from pending after completion", async () => {
      const fn = vi.fn().mockResolvedValue("result")
      const key = "test-key"

      await deduplicateRequest(key, fn)

      expect(getPendingRequestCount()).toBe(0)
    })

    it("removes key from pending after error", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("test error"))
      const key = "test-key"

      await expect(deduplicateRequest(key, fn)).rejects.toThrow("test error")

      expect(getPendingRequestCount()).toBe(0)
    })

    it("handles sequential requests correctly", async () => {
      const fn = vi.fn().mockResolvedValue("result")
      const key = "test-key"

      const result1 = await deduplicateRequest(key, fn)
      const result2 = await deduplicateRequest(key, fn)

      // Second request should execute again (not deduplicated since first completed)
      expect(fn).toHaveBeenCalledTimes(2)
      expect(result1).toBe("result")
      expect(result2).toBe("result")
    })
  })

  describe("getPendingRequestCount", () => {
    it("returns 0 when no requests are pending", () => {
      expect(getPendingRequestCount()).toBe(0)
    })

    it("returns correct count of pending requests", async () => {
      const fn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve("result"), 100))
      )

      const promise1 = deduplicateRequest("key1", fn)
      const promise2 = deduplicateRequest("key2", fn)

      // Both should be pending
      expect(getPendingRequestCount()).toBe(2)

      await Promise.all([promise1, promise2])

      // Both should be cleared
      expect(getPendingRequestCount()).toBe(0)
    })
  })
})

