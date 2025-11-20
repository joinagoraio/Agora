import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { env } from "@/lib/env"

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

/**
 * In-memory rate limiter fallback when Redis is unavailable
 * Uses a simple sliding window algorithm with per-key tracking
 */
class InMemoryRateLimiter {
  private requests: Map<string, number[]> = new Map()
  private readonly windowMs: number
  private readonly maxRequests: number

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
    // Clean up old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  async limit(key: string): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
    const now = Date.now()
    const windowStart = now - this.windowMs

    // Get or create request timestamps for this key
    let timestamps = this.requests.get(key) || []
    
    // Remove timestamps outside the window
    timestamps = timestamps.filter((ts) => ts > windowStart)
    
    // Check if limit exceeded
    const success = timestamps.length < this.maxRequests
    
    if (success) {
      // Add current request
      timestamps.push(now)
    }
    
    // Update map
    this.requests.set(key, timestamps)
    
    // Calculate reset time (oldest request + window)
    const reset = timestamps.length > 0 
      ? Math.floor((Math.min(...timestamps) + this.windowMs) / 1000)
      : Math.floor((now + this.windowMs) / 1000)
    
    return {
      success,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - timestamps.length),
      reset,
    }
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, timestamps] of this.requests.entries()) {
      const windowStart = now - this.windowMs
      const filtered = timestamps.filter((ts) => ts > windowStart)
      if (filtered.length === 0) {
        this.requests.delete(key)
      } else {
        this.requests.set(key, filtered)
      }
    }
  }
}

// Parse window string (e.g., "1 m" -> 60000ms)
function parseWindow(window: string): number {
  const [amount, unit] = window.trim().split(/\s+/)
  const num = parseInt(amount, 10)
  const unitLower = unit.toLowerCase()
  
  if (unitLower === "s" || unitLower === "sec" || unitLower === "second") {
    return num * 1000
  }
  if (unitLower === "m" || unitLower === "min" || unitLower === "minute") {
    return num * 60 * 1000
  }
  if (unitLower === "h" || unitLower === "hr" || unitLower === "hour") {
    return num * 60 * 60 * 1000
  }
  return num * 1000 // Default to seconds
}

function createLimiter(slidingWindow: [number, string]) {
  const [maxRequests, window] = slidingWindow
  const windowMs = parseWindow(window)
  
  // Create in-memory fallback
  const inMemoryLimiter = new InMemoryRateLimiter(maxRequests, windowMs)
  
  if (!redis) {
    // Return a wrapper that uses in-memory limiter
    return {
      limit: (key: string) => inMemoryLimiter.limit(key),
    } as Ratelimit
  }

  // Use Redis limiter with in-memory fallback on error
  const redisLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(...slidingWindow),
    analytics: true,
  })

  return {
    limit: async (key: string) => {
      try {
        return await redisLimiter.limit(key)
      } catch (error) {
        // Fallback to in-memory limiter if Redis fails
        return inMemoryLimiter.limit(key)
      }
    },
  } as Ratelimit
}

export const chatRateLimit = createLimiter([10, "1 m"])
export const uploadRateLimit = createLimiter([5, "1 m"])
export const searchRateLimit = createLimiter([20, "1 m"])
export const evidenceRateLimit = createLimiter([10, "1 m"])
export const driveRateLimit = createLimiter([10, "1 m"])
export const externalSearchRateLimit = createLimiter([30, "10 m"])
export const connectorTestRateLimit = createLimiter([5, "5 m"])

export type RateLimitStatus = {
  success: boolean
  limit?: number
  remaining?: number
  reset?: number
}

export async function checkRateLimit(
  limiter: Ratelimit | null,
  key: string,
): Promise<RateLimitStatus> {
  if (!limiter) {
    return { success: true }
  }

  const result = await limiter.limit(key)
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  }
}

export function applyRateLimitHeaders<T extends Response>(
  response: T,
  status?: RateLimitStatus,
): T {
  if (!status) {
    return response
  }

  if (typeof status.limit === "number") {
    response.headers.set("RateLimit-Limit", status.limit.toString())
  }

  if (typeof status.remaining === "number") {
    response.headers.set("RateLimit-Remaining", Math.max(status.remaining, 0).toString())
  }

  if (typeof status.reset === "number") {
    const resetTimestamp = status.reset < 10_000_000_000 ? status.reset * 1000 : status.reset
    response.headers.set("RateLimit-Reset", resetTimestamp.toString())

    if (!status.success) {
      const retryAfterSeconds =
        resetTimestamp > Date.now()
          ? Math.max(0, Math.ceil((resetTimestamp - Date.now()) / 1000))
          : 0
      response.headers.set("Retry-After", retryAfterSeconds.toString())
    }
  }

  return response
}

