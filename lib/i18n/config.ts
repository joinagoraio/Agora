export const SUPPORTED_LANGUAGES = ["en", "nl"] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: SupportedLanguage = "en"
export const LANGUAGE_COOKIE_NAME = "agora-language"
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)
}

export function normalizeLanguageCandidate(value: string | null | undefined): SupportedLanguage | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return isSupportedLanguage(normalized) ? (normalized as SupportedLanguage) : null
}

export function fromAcceptLanguage(headerValue: string | null | undefined): SupportedLanguage | null {
  if (!headerValue) {
    return null
  }

  const [firstPreference] = headerValue.split(",")
  if (!firstPreference) {
    return null
  }

  const candidate = firstPreference.trim().slice(0, 2).toLowerCase()
  return normalizeLanguageCandidate(candidate)
}

