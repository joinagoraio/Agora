import { describe, it, expect, vi, beforeEach } from "vitest"
import { checkRateLimit, chatRateLimit } from "@/lib/rate-limit"

// Mock Upstash Redis
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: vi.fn(),
  },
}))

// Mock Upstash Ratelimit
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: vi.fn().mockImplementation(() => ({
    limit: vi.fn(),
  })),
}))

describe("Rate Limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("checkRateLimit", () => {
    it("returns success when limiter is not configured", async () => {
      const result = await checkRateLimit(null, "test-key")
      expect(result.success).toBe(true)
    })

    it("returns success when rate limit is not exceeded", async () => {
      const mockLimiter = {
        limit: vi.fn().mockResolvedValue({
          success: true,
          limit: 20,
          remaining: 19,
          reset: Date.now() + 60000,
        }),
      }

      const result = await checkRateLimit(mockLimiter as any, "test-key")
      expect(result.success).toBe(true)
      expect(result.reset).toBeDefined()
      expect(result.limit).toBe(20)
      expect(result.remaining).toBe(19)
    })

    it("returns failure when rate limit is exceeded", async () => {
      const mockLimiter = {
        limit: vi.fn().mockResolvedValue({
          success: false,
          limit: 20,
          remaining: 0,
          reset: Date.now() + 60000,
        }),
      }

      const result = await checkRateLimit(mockLimiter as any, "test-key")
      expect(result.success).toBe(false)
      expect(result.reset).toBeDefined()
      expect(result.limit).toBe(20)
      expect(result.remaining).toBe(0)
    })
  })
})

