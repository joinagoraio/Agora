const isProduction = process.env.NODE_ENV === "production"

type ClientLogLevel = "debug" | "info" | "warn" | "error"

function shouldLog(level: ClientLogLevel): boolean {
  if (level === "debug") {
    return !isProduction
  }
  return true
}

function formatMessage(level: ClientLogLevel, message?: any, optionalParams?: any[]) {
  const timestamp = new Date().toISOString()
  const extra = optionalParams && optionalParams.length > 0 ? ["--", ...optionalParams] : []
  return [`[${timestamp}] [${level.toUpperCase()}]`, message, ...extra]
}

export const clientLogger = {
  debug(message?: any, ...optionalParams: any[]) {
    if (shouldLog("debug")) {
      console.debug(...formatMessage("debug", message, optionalParams))
    }
  },
  info(message?: any, ...optionalParams: any[]) {
    if (shouldLog("info")) {
      console.info(...formatMessage("info", message, optionalParams))
    }
  },
  warn(message?: any, ...optionalParams: any[]) {
    if (shouldLog("warn")) {
      console.warn(...formatMessage("warn", message, optionalParams))
    }
  },
  error(message?: any, ...optionalParams: any[]) {
    if (shouldLog("error")) {
      console.error(...formatMessage("error", message, optionalParams))
    }
  },
}

export type ClientLogger = typeof clientLogger


