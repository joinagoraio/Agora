import { describe, it, expect } from "vitest"
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ExternalServiceError,
  isAppError,
  toAppError,
  getSafeErrorMessage,
  formatErrorResponse,
} from "@/lib/utils/errors"

describe("Error Utilities", () => {
  describe("AppError", () => {
    it("creates error with default status code", () => {
      const error = new AppError("Test error")
      expect(error.message).toBe("Test error")
      expect(error.statusCode).toBe(500)
      expect(error.name).toBe("AppError")
    })

    it("creates error with custom status code and code", () => {
      const error = new AppError("Test error", 404, "NOT_FOUND", { id: "123" })
      expect(error.statusCode).toBe(404)
      expect(error.code).toBe("NOT_FOUND")
      expect(error.details).toEqual({ id: "123" })
    })
  })

  describe("ValidationError", () => {
    it("creates validation error with 400 status", () => {
      const error = new ValidationError("Invalid input", { field: "email" })
      expect(error.statusCode).toBe(400)
      expect(error.code).toBe("VALIDATION_ERROR")
      expect(error.name).toBe("ValidationError")
    })
  })

  describe("AuthenticationError", () => {
    it("creates authentication error with 401 status", () => {
      const error = new AuthenticationError()
      expect(error.statusCode).toBe(401)
      expect(error.code).toBe("AUTHENTICATION_ERROR")
    })
  })

  describe("AuthorizationError", () => {
    it("creates authorization error with 403 status", () => {
      const error = new AuthorizationError()
      expect(error.statusCode).toBe(403)
      expect(error.code).toBe("AUTHORIZATION_ERROR")
    })
  })

  describe("NotFoundError", () => {
    it("creates not found error with 404 status", () => {
      const error = new NotFoundError()
      expect(error.statusCode).toBe(404)
      expect(error.code).toBe("NOT_FOUND")
    })
  })

  describe("RateLimitError", () => {
    it("creates rate limit error with 429 status", () => {
      const error = new RateLimitError("Too many requests", 1234567890)
      expect(error.statusCode).toBe(429)
      expect(error.code).toBe("RATE_LIMIT_ERROR")
      expect(error.details?.reset).toBe(1234567890)
    })
  })

  describe("ExternalServiceError", () => {
    it("creates external service error with service name", () => {
      const error = new ExternalServiceError("OpenAI", "API error", 502)
      expect(error.statusCode).toBe(502)
      expect(error.code).toBe("EXTERNAL_SERVICE_ERROR")
      expect(error.details?.service).toBe("OpenAI")
      expect(error.message).toContain("OpenAI")
    })
  })

  describe("isAppError", () => {
    it("returns true for AppError instances", () => {
      expect(isAppError(new AppError("test"))).toBe(true)
      expect(isAppError(new ValidationError("test"))).toBe(true)
    })

    it("returns false for other errors", () => {
      expect(isAppError(new Error("test"))).toBe(false)
      expect(isAppError("string")).toBe(false)
      expect(isAppError(null)).toBe(false)
    })
  })

  describe("toAppError", () => {
    it("returns AppError as-is", () => {
      const error = new AppError("test")
      expect(toAppError(error)).toBe(error)
    })

    it("converts Error to AppError", () => {
      const error = new Error("test error")
      const appError = toAppError(error)
      expect(appError.message).toBe("test error")
      expect(appError.statusCode).toBe(500)
      expect(appError.code).toBe("UNKNOWN_ERROR")
    })

    it("converts unknown types to AppError", () => {
      const appError = toAppError("string error")
      expect(appError.message).toBe("string error")
      expect(appError.statusCode).toBe(500)
    })
  })

  describe("getSafeErrorMessage", () => {
    it("returns safe message for AppError", () => {
      const error = new ValidationError("Invalid input", { field: "email" })
      const safe = getSafeErrorMessage(error, true)
      expect(safe.message).toBe("Invalid input")
      expect(safe.code).toBe("VALIDATION_ERROR")
      expect(safe.details).toEqual({ field: "email" })
    })

    it("hides details when includeDetails is false", () => {
      const error = new ValidationError("Invalid input", { field: "email" })
      const safe = getSafeErrorMessage(error, false)
      expect(safe.details).toBeUndefined()
    })

    it("returns generic message for non-AppError", () => {
      const error = new Error("Sensitive error message")
      const safe = getSafeErrorMessage(error)
      expect(safe.message).toBe("An unexpected error occurred")
      expect(safe.code).toBe("INTERNAL_ERROR")
    })
  })

  describe("formatErrorResponse", () => {
    it("formats AppError correctly", () => {
      const error = new ValidationError("Invalid input", { field: "email" })
      const response = formatErrorResponse(error, false)
      expect(response.error).toBe("Invalid input")
      expect(response.code).toBe("VALIDATION_ERROR")
      expect(response.details).toEqual({ field: "email" })
    })

    it("includes stack trace in development", () => {
      const error = new AppError("Test error")
      const response = formatErrorResponse(error, true)
      expect(response.stack).toBeDefined()
    })
  })
})

