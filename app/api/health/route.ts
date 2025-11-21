import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { env } from "@/lib/env"
import { logger } from "@/lib/utils/logger"
import { applySecurityHeaders } from "@/lib/utils/security-headers"

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy"
  timestamp: string
  version?: string
  checks: {
    database: {
      status: "healthy" | "unhealthy"
      responseTime?: number
      error?: string
    }
    storage?: {
      status: "healthy" | "unhealthy"
      error?: string
    }
    openai?: {
      status: "healthy" | "unhealthy"
      error?: string
    }
    redis?: {
      status: "healthy" | "unhealthy"
      responseTime?: number
      error?: string
    }
  }
}

/**
 * Health check endpoint
 * GET /api/health
 * 
 * Returns the health status of the application and its dependencies
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now()
  const checks: HealthCheckResult["checks"] = {
    database: { status: "unhealthy" },
  }

  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy"

  // Check database connection
  try {
    const dbStartTime = Date.now()
    const supabase = await createClient()
    const { error } = await supabase.from("spaces").select("id").limit(1)
    const dbResponseTime = Date.now() - dbStartTime

    if (error) {
      checks.database = {
        status: "unhealthy",
        error: error.message,
      }
      overallStatus = "unhealthy"
    } else {
      checks.database = {
        status: "healthy",
        responseTime: dbResponseTime,
      }
    }
  } catch (error) {
    logger.error("[Health Check] Database check failed", error)
    checks.database = {
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    }
    overallStatus = "unhealthy"
  }

  // Check Supabase Storage (if configured)
  try {
    const supabase = await createClient()
    // Simple storage check - try to list buckets (this is a lightweight operation)
    const { error } = await supabase.storage.listBuckets()
    
    if (error) {
      checks.storage = {
        status: "unhealthy",
        error: error.message,
      }
      if (overallStatus === "healthy") {
        overallStatus = "degraded"
      }
    } else {
      checks.storage = {
        status: "healthy",
      }
    }
  } catch (error) {
    logger.error("[Health Check] Storage check failed", error)
    checks.storage = {
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    }
    if (overallStatus === "healthy") {
      overallStatus = "degraded"
    }
  }

  // Check OpenAI API (if configured)
  if (env.OPENAI_API_KEY) {
    try {
      // Simple check - just verify the key is set (we don't want to make actual API calls on every health check)
      checks.openai = {
        status: "healthy",
      }
    } catch (error) {
      logger.error("[Health Check] OpenAI check failed", error)
      checks.openai = {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      }
      if (overallStatus === "healthy") {
        overallStatus = "degraded"
      }
    }
  }

  // Check Redis/Upstash (if configured)
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Redis } = await import("@upstash/redis")
      const redis = new Redis({
        url: env.UPSTASH_REDIS_REST_URL!,
        token: env.UPSTASH_REDIS_REST_TOKEN!,
      })
      
      const redisStartTime = Date.now()
      await redis.ping()
      const redisResponseTime = Date.now() - redisStartTime

      checks.redis = {
        status: "healthy",
        responseTime: redisResponseTime,
      }
    } catch (error) {
      logger.error("[Health Check] Redis check failed", error)
      checks.redis = {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      }
      if (overallStatus === "healthy") {
        overallStatus = "degraded"
      }
    }
  }

  const totalResponseTime = Date.now() - startTime
  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    checks,
  }

  // Log health check result
  logger.info("[Health Check] Status", {
    status: overallStatus,
    responseTime: totalResponseTime,
    checks: Object.keys(checks).map(key => ({
      service: key,
      status: checks[key as keyof typeof checks]?.status,
    })),
  })

  // Return appropriate status code
  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503

  const response = NextResponse.json(result, {
    status: statusCode,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Response-Time": `${totalResponseTime}ms`,
    },
  })

  return applySecurityHeaders(response)
}

