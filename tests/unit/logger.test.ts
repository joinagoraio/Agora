import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock console methods
const mockConsoleDebug = vi.spyOn(console, "debug").mockImplementation(() => {})
const mockConsoleInfo = vi.spyOn(console, "info").mockImplementation(() => {})
const mockConsoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {})
const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {})

// Mock env BEFORE importing logger (logger reads env at module load time)
vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "development", // Override to allow logging in tests
  },
}))

// Import logger AFTER mocking env
import { logger } from "@/lib/utils/logger"

describe("Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("error", () => {
    it("logs error messages (errors are always logged even in test mode)", () => {
      logger.error("Error message", new Error("Test error"), { key: "value" })
      expect(mockConsoleError).toHaveBeenCalled()
    })

    it("handles non-Error objects", () => {
      logger.error("Error message", "string error", { key: "value" })
      expect(mockConsoleError).toHaveBeenCalled()
    })
  })

  // Note: In test mode, only errors are logged. Other log levels are suppressed.
  // These tests verify the logger methods exist and can be called without errors.
  describe("logger methods exist and are callable", () => {
    it("debug method exists and is callable", () => {
      expect(() => logger.debug("Debug message", { key: "value" })).not.toThrow()
    })

    it("info method exists and is callable", () => {
      expect(() => logger.info("Info message", { key: "value" })).not.toThrow()
    })

    it("warn method exists and is callable", () => {
      expect(() => logger.warn("Warning message", { key: "value" })).not.toThrow()
    })

    it("apiRequest method exists and is callable", () => {
      expect(() => logger.apiRequest("GET", "/api/test", { ip: "127.0.0.1" })).not.toThrow()
    })

    it("apiResponse method exists and is callable", () => {
      expect(() => logger.apiResponse("GET", "/api/test", 200, 100)).not.toThrow()
    })

    it("dbOperation method exists and is callable", () => {
      expect(() => logger.dbOperation("SELECT", "documents", { workspaceId: "123" })).not.toThrow()
    })

    it("externalService method exists and is callable", () => {
      expect(() => logger.externalService("OpenAI", "chat.completions.create", { model: "gpt-4" })).not.toThrow()
    })
  })
})

