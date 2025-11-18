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

function createLimiter(slidingWindow: [number, string]) {
  if (!redis) {
    return null
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(...slidingWindow),
    analytics: true,
  })
}

export const chatRateLimit = createLimiter([10, "1 m"])
export const uploadRateLimit = createLimiter([5, "1 m"])
export const searchRateLimit = createLimiter([20, "1 m"])

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

