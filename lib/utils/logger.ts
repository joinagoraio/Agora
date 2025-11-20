/**
 * Structured logging utility
 * Provides consistent logging across the application with different log levels
 * Supports log aggregation services (e.g., Datadog, Logtail, etc.)
 */

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogContext {
  [key: string]: any
}

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
  }
  service: string
  environment: string
}

const NODE_ENV = (process.env.NODE_ENV ?? "development") as "development" | "test" | "production"

class Logger {
  private isDevelopment = NODE_ENV === "development"
  private isTest = NODE_ENV === "test"
  private serviceName = "agora"

  private shouldLog(level: LogLevel): boolean {
    if (this.isTest) {
      return level === "error" // Only log errors in tests
    }
    return true
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    error?: Error | unknown,
    context?: LogContext,
  ): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      environment: NODE_ENV,
    }

    if (context) {
      entry.context = context
    }

    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: error.message,
        ...(this.isDevelopment && error.stack ? { stack: error.stack } : {}),
      }
    } else if (error) {
      entry.error = {
        name: "UnknownError",
        message: String(error),
      }
    }

    return entry
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const contextStr = context ? ` ${JSON.stringify(context)}` : ""
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`
  }

  private sendToAggregationService(entry: LogEntry): void {
    // In production, this would send logs to a log aggregation service
    // For now, we'll just ensure structured format for easy integration
    // Services like Datadog, Logtail, or CloudWatch can parse JSON logs
    
    // Example: If LOG_AGGREGATION_URL is set, send logs there
    // This is a placeholder for future integration
    if (process.env.LOG_AGGREGATION_URL && NODE_ENV === "production") {
      // In a real implementation, you would:
      // 1. Batch logs and send periodically
      // 2. Use a proper log aggregation client
      // 3. Handle errors gracefully
      // For now, we'll just structure the logs for easy parsing
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog("debug") && this.isDevelopment) {
      const entry = this.createLogEntry("debug", message, undefined, context)
      console.debug(this.formatMessage("debug", message, context))
      this.sendToAggregationService(entry)
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog("info")) {
      const entry = this.createLogEntry("info", message, undefined, context)
      console.info(this.formatMessage("info", message, context))
      this.sendToAggregationService(entry)
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog("warn")) {
      const entry = this.createLogEntry("warn", message, undefined, context)
      console.warn(this.formatMessage("warn", message, context))
      this.sendToAggregationService(entry)
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.shouldLog("error")) {
      const entry = this.createLogEntry("error", message, error, context)
      const errorContext: LogContext = {
        ...context,
        ...(error instanceof Error
          ? {
              errorName: error.name,
              errorMessage: error.message,
              ...(this.isDevelopment && error.stack ? { stack: error.stack } : {}),
            }
          : error
            ? { error: String(error) }
            : {}),
      }
      console.error(this.formatMessage("error", message, errorContext))
      this.sendToAggregationService(entry)
    }
  }

  /**
   * Log API request
   */
  apiRequest(method: string, path: string, context?: LogContext): void {
    this.info(`API Request: ${method} ${path}`, context)
  }

  /**
   * Log API response
   */
  apiResponse(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void {
    const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info"
    this[level](`API Response: ${method} ${path} ${statusCode} (${duration}ms)`, context)
  }

  /**
   * Log database operation
   */
  dbOperation(operation: string, table: string, context?: LogContext): void {
    this.debug(`DB ${operation}: ${table}`, context)
  }

  /**
   * Log external service call
   */
  externalService(service: string, operation: string, context?: LogContext): void {
    this.info(`External Service: ${service} - ${operation}`, context)
  }
}

// Export singleton instance
export const logger = new Logger()

// Export type for use in other modules
export type { LogContext }

