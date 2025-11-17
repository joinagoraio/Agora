/**
 * Standardized error handling utilities
 * Provides consistent error types and handling across the application
 */

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: Record<string, any>,
  ) {
    super(message)
    this.name = "AppError"
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 400, "VALIDATION_ERROR", details)
    this.name = "ValidationError"
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication required", details?: Record<string, any>) {
    super(message, 401, "AUTHENTICATION_ERROR", details)
    this.name = "AuthenticationError"
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "Insufficient permissions", details?: Record<string, any>) {
    super(message, 403, "AUTHORIZATION_ERROR", details)
    this.name = "AuthorizationError"
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found", details?: Record<string, any>) {
    super(message, 404, "NOT_FOUND", details)
    this.name = "NotFoundError"
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = "Rate limit exceeded", reset?: number, details?: Record<string, any>) {
    super(message, 429, "RATE_LIMIT_ERROR", { ...details, reset })
    this.name = "RateLimitError"
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string,
    statusCode: number = 502,
    details?: Record<string, any>,
  ) {
    super(`External service error (${service}): ${message}`, statusCode, "EXTERNAL_SERVICE_ERROR", {
      ...details,
      service,
    })
    this.name = "ExternalServiceError"
  }
}

/**
 * Check if an error is an AppError instance
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * Convert any error to an AppError
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error
  }

  if (error instanceof Error) {
    return new AppError(error.message, 500, "UNKNOWN_ERROR", {
      originalError: error.name,
      stack: error.stack,
    })
  }

  return new AppError(String(error), 500, "UNKNOWN_ERROR", {
    originalError: typeof error,
  })
}

/**
 * Get safe error message for client responses
 * Never exposes sensitive information
 */
export function getSafeErrorMessage(error: unknown, includeDetails: boolean = false): {
  message: string
  code?: string
  details?: Record<string, any>
} {
  if (isAppError(error)) {
    return {
      message: error.message,
      code: error.code,
      ...(includeDetails && error.details ? { details: error.details } : {}),
    }
  }

  if (error instanceof Error) {
    return {
      message: "An unexpected error occurred",
      code: "INTERNAL_ERROR",
    }
  }

  return {
    message: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
  }
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error: unknown, includeStack: boolean = false) {
  const appError = toAppError(error)
  const safe = getSafeErrorMessage(appError, true) // Always get details, we'll conditionally include stack

  return {
    error: safe.message,
    code: safe.code,
    ...(safe.details ? { details: safe.details } : {}),
    ...(includeStack && appError.stack ? { stack: appError.stack } : {}),
  }
}

