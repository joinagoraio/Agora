/**
 * Error tracking utility
 * Provides integration with error tracking services (e.g., Sentry)
 * Gracefully degrades if not configured
 */

import { env } from "@/lib/env"
import { logger } from "@/lib/utils/logger"

interface ErrorTrackingService {
  captureException(error: Error, context?: Record<string, any>): void
  captureMessage(message: string, level?: "info" | "warning" | "error", context?: Record<string, any>): void
  setUser(user: { id: string; email?: string; username?: string }): void
  setContext(name: string, context: Record<string, any>): void
  addBreadcrumb(message: string, category?: string, level?: "info" | "warning" | "error", data?: Record<string, any>): void
}

class NoOpErrorTracking implements ErrorTrackingService {
  captureException(_error: Error, _context?: Record<string, any>): void {
    // No-op
  }
  captureMessage(_message: string, _level?: "info" | "warning" | "error", _context?: Record<string, any>): void {
    // No-op
  }
  setUser(_user: { id: string; email?: string; username?: string }): void {
    // No-op
  }
  setContext(_name: string, _context: Record<string, any>): void {
    // No-op
  }
  addBreadcrumb(_message: string, _category?: string, _level?: "info" | "warning" | "error", _data?: Record<string, any>): void {
    // No-op
  }
}

class SentryErrorTracking implements ErrorTrackingService {
  private sentry: any

  constructor() {
    try {
      // Dynamic import to avoid breaking if Sentry is not installed
      // In production, you would install: @sentry/nextjs
      // For now, we'll use a no-op implementation
      this.sentry = null
    } catch (error) {
      logger.warn("[Error Tracking] Sentry not available", { error })
      this.sentry = null
    }
  }

  captureException(error: Error, context?: Record<string, any>): void {
    if (!this.sentry) {
      logger.error("[Error Tracking] Exception (Sentry not configured)", error, context)
      return
    }

    try {
      if (context) {
        this.sentry.setContext("additional", context)
      }
      this.sentry.captureException(error)
    } catch (err) {
      logger.error("[Error Tracking] Failed to capture exception", err)
    }
  }

  captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: Record<string, any>): void {
    if (!this.sentry) {
      logger[level]("[Error Tracking] Message (Sentry not configured)", context || {}, { message })
      return
    }

    try {
      if (context) {
        this.sentry.setContext("additional", context)
      }
      this.sentry.captureMessage(message, level)
    } catch (err) {
      logger.error("[Error Tracking] Failed to capture message", err)
    }
  }

  setUser(user: { id: string; email?: string; username?: string }): void {
    if (!this.sentry) return

    try {
      this.sentry.setUser(user)
    } catch (err) {
      logger.error("[Error Tracking] Failed to set user", err)
    }
  }

  setContext(name: string, context: Record<string, any>): void {
    if (!this.sentry) return

    try {
      this.sentry.setContext(name, context)
    } catch (err) {
      logger.error("[Error Tracking] Failed to set context", err)
    }
  }

  addBreadcrumb(message: string, category?: string, level: "info" | "warning" | "error" = "info", data?: Record<string, any>): void {
    if (!this.sentry) return

    try {
      this.sentry.addBreadcrumb({
        message,
        category,
        level,
        data,
      })
    } catch (err) {
      logger.error("[Error Tracking] Failed to add breadcrumb", err)
    }
  }
}

// Initialize error tracking service
let errorTracking: ErrorTrackingService

if (env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  // In production with Sentry configured, use Sentry
  errorTracking = new SentryErrorTracking()
} else {
  // Otherwise, use no-op implementation
  errorTracking = new NoOpErrorTracking()
}

export const errorTracker = errorTracking

/**
 * Helper to capture exceptions with context
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  errorTracker.captureException(error, context)
}

/**
 * Helper to capture messages
 */
export function captureMessage(message: string, level: "info" | "warning" | "error" = "info", context?: Record<string, any>): void {
  errorTracker.captureMessage(message, level, context)
}

/**
 * Helper to set user context
 */
export function setUser(user: { id: string; email?: string; username?: string }): void {
  errorTracker.setUser(user)
}

/**
 * Helper to add breadcrumb
 */
export function addBreadcrumb(message: string, category?: string, level: "info" | "warning" | "error" = "info", data?: Record<string, any>): void {
  errorTracker.addBreadcrumb(message, category, level, data)
}

