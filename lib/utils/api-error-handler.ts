/**
 * API error handler wrapper
 * Provides consistent error handling for Next.js API routes
 */

import { NextRequest, NextResponse } from "next/server"
import { formatErrorResponse, toAppError, isAppError } from "@/lib/utils/errors"
import { logger } from "@/lib/utils/logger"
import { metrics } from "@/lib/utils/metrics"
import { captureException } from "@/lib/utils/error-tracking"
import { env } from "@/lib/env"

/**
 * Wraps an API route handler with standardized error handling
 */
export function withErrorHandler<T = any>(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse<T>>,
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    const startTime = Date.now()
    const method = req.method
    const path = req.nextUrl.pathname

    try {
      logger.apiRequest(method, path, {
        ip: req.headers.get("x-forwarded-for") ?? "unknown",
        userAgent: req.headers.get("user-agent") ?? "unknown",
      })

      const response = await handler(req, context)

      const duration = Date.now() - startTime
      logger.apiResponse(method, path, response.status, duration)
      
      // Record metrics
      metrics.histogram("api.request.duration", duration, {
        method,
        path,
        status: response.status.toString(),
      })
      metrics.increment("api.request.count", 1, {
        method,
        path,
        status: response.status.toString(),
      })

      return response
    } catch (error) {
      const duration = Date.now() - startTime
      const appError = toAppError(error)

      // Log the error
      logger.error(`API Error: ${method} ${path}`, error, {
        statusCode: appError.statusCode,
        code: appError.code,
        duration,
      })
      
      // Track error in error tracking service
      if (error instanceof Error) {
        captureException(error, {
          method,
          path,
          statusCode: appError.statusCode,
          code: appError.code,
          duration,
        })
      }
      
      // Record error metrics
      metrics.histogram("api.request.duration", duration, {
        method,
        path,
        status: appError.statusCode.toString(),
        error: "true",
      })
      metrics.increment("api.request.count", 1, {
        method,
        path,
        status: appError.statusCode.toString(),
        error: "true",
      })
      metrics.increment("api.error.count", 1, {
        method,
        path,
        code: appError.code || "UNKNOWN",
      })

      // Format error response
      const includeStack = env.NODE_ENV === "development"
      const errorResponse = formatErrorResponse(appError, includeStack)

      return NextResponse.json(errorResponse, {
        status: appError.statusCode,
      })
    }
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: unknown,
  defaultStatusCode: number = 500,
): NextResponse {
  const appError = toAppError(error)
  const statusCode = isAppError(error) ? error.statusCode : defaultStatusCode
  const includeStack = env.NODE_ENV === "development"

  const errorResponse = formatErrorResponse(appError, includeStack)

  return NextResponse.json(errorResponse, {
    status: statusCode,
  })
}

/**
 * Create a success response with optional data
 */
export function createSuccessResponse<T = any>(
  data: T,
  statusCode: number = 200,
): NextResponse<T> {
  return NextResponse.json(data, { status: statusCode })
}

