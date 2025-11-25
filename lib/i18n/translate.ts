import type { Messages } from "@/lib/i18n/dictionary"

export type TranslateFn = (key: string, fallback?: string) => string

export function translate(messages: Messages, key: string, fallback?: string): string {
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

  return typeof current === "string" ? current : fallback ?? key
}

