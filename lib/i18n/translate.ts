import type { Messages } from "@/lib/i18n/dictionary"

export type TranslateFn = (key: string, fallback?: string, replacements?: Record<string, string | number>) => string

export function translate(
  messages: Messages,
  key: string,
  fallback?: string,
  replacements?: Record<string, string | number>,
): string {
  if (!key) {
    return fallback ?? ""
  }

  const segments = key.split(".")
  let current: unknown = messages

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return fallback ?? key
    }

    current = (current as Record<string, unknown>)[segment]
  }

  const value = typeof current === "string" ? current : fallback ?? key

  if (!replacements) {
    return value
  }

  return Object.entries(replacements).reduce(
    (acc, [token, replacement]) => acc.replace(new RegExp(`{{\\s*${token}\\s*}}`, "g"), String(replacement)),
    value,
  )
}

