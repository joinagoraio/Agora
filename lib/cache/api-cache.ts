import { Redis } from "@upstash/redis"
import { env } from "@/lib/env"
import { cache as nextCache } from "react"
import { metrics } from "@/lib/utils/metrics"

// Initialize Redis client if available
const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv()
  : null

export interface CacheOptions {
  ttl?: number // Time to live in seconds
  tags?: string[] // Cache tags for invalidation
  revalidate?: number // Next.js revalidate time
}

/**
 * Generate a cache key from a prefix and parameters
 */
function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${JSON.stringify(params[key])}`)
    .join("|")
  return `${prefix}:${sortedParams}`
}

/**
 * Get cached value from Redis or Next.js cache
 */
export async function getCached<T>(
  key: string,
  options: CacheOptions = {},
): Promise<T | null> {
  // Try Redis first if available
  if (redis) {
    try {
      const cacheStartTime = Date.now()
      const cached = await redis.get<T>(key)
      const cacheDuration = Date.now() - cacheStartTime
      
      if (cached !== null) {
        metrics.histogram("cache.get.duration", cacheDuration, { hit: "true", backend: "redis" })
        metrics.increment("cache.hit", 1, { backend: "redis" })
        return cached
      }
      
      metrics.histogram("cache.get.duration", cacheDuration, { hit: "false", backend: "redis" })
      metrics.increment("cache.miss", 1, { backend: "redis" })
    } catch (error) {
      console.error("[Cache] Redis get error:", error)
      // Fall through to Next.js cache
    }
  }

  // Fallback to Next.js cache (in-memory, request-scoped)
  // Note: Next.js cache is request-scoped, so this is mainly for deduplication
  return null
}

/**
 * Set cached value in Redis or Next.js cache
 */
export async function setCached<T>(
  key: string,
  value: T,
  options: CacheOptions = {},
): Promise<void> {
  const ttl = options.ttl || 300 // Default 5 minutes

  // Try Redis first if available
  if (redis) {
    try {
      const setStartTime = Date.now()
      await redis.setex(key, ttl, value)
      const setDuration = Date.now() - setStartTime
      metrics.histogram("cache.set.duration", setDuration, { backend: "redis" })
      metrics.increment("cache.set", 1, { backend: "redis" })
      return
    } catch (error) {
      console.error("[Cache] Redis set error:", error)
      // Fall through - Next.js cache doesn't support TTL
    }
  }

  // Next.js cache doesn't support TTL, so we can't use it for persistent caching
  // This is mainly for request deduplication
}

/**
 * Invalidate cache by key
 */
export async function invalidateCache(key: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(key)
    } catch (error) {
      console.error("[Cache] Redis delete error:", error)
    }
  }
}

/**
 * Invalidate cache by tags (pattern matching)
 */
export async function invalidateCacheByTag(tag: string): Promise<void> {
  if (redis) {
    try {
      // Redis doesn't have native tag support, so we use pattern matching
      const keys = await redis.keys(`${tag}:*`)
      if (keys.length > 0) {
        await redis.del(...keys)
      }
    } catch (error) {
      console.error("[Cache] Redis tag invalidation error:", error)
    }
  }
}

/**
 * Cache wrapper for API route handlers
 * Returns cached value if available, otherwise calls fetcher and caches result
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  // Try to get from cache
  const cached = await getCached<T>(key, options)
  if (cached !== null) {
    return cached
  }

  // Fetch fresh data
  const data = await fetcher()

  // Cache the result
  await setCached(key, data, options)

  return data
}

/**
 * Generate cache key for workspace queries
 */
export function workspaceCacheKey(
  prefix: string,
  workspaceId: string,
  params: Record<string, any> = {},
): string {
  return generateCacheKey(`${prefix}:workspace:${workspaceId}`, params)
}

/**
 * Generate cache key for space queries
 */
export function spaceCacheKey(
  prefix: string,
  spaceId: string,
  params: Record<string, any> = {},
): string {
  return generateCacheKey(`${prefix}:space:${spaceId}`, params)
}

/**
 * React cache wrapper for server components
 * Uses Next.js request deduplication
 */
export const cached = nextCache

