import { cache } from "react"
import { cookies, headers } from "next/headers"

import { createClient } from "@/lib/supabase/server"
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE_NAME,
  type SupportedLanguage,
  fromAcceptLanguage,
  normalizeLanguageCandidate,
} from "@/lib/i18n/config"
import { getDictionary, type Messages } from "@/lib/i18n/dictionary"
import { translate, type TranslateFn } from "@/lib/i18n/translate"

export const getRequestLanguage = cache(async (): Promise<SupportedLanguage> => {
  const cookieStore = await cookies()
  const cookieLanguage = normalizeLanguageCandidate(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value ?? null)
  if (cookieLanguage) {
    return cookieLanguage
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("language")
        .eq("id", user.id)
        .single()

      const profileLanguage = normalizeLanguageCandidate(profile?.language ?? null)
      if (profileLanguage) {
        return profileLanguage
      }
    }
  } catch (error) {
    console.error("[i18n] Failed to resolve language from profile:", error)
  }

  const headerStore = await headers()
  const headerLanguage = fromAcceptLanguage(headerStore.get("accept-language"))
  if (headerLanguage) {
    return headerLanguage
  }

  return DEFAULT_LANGUAGE
})

export const getServerDictionary = cache(async (): Promise<{ language: SupportedLanguage; messages: Messages }> => {
  const language = await getRequestLanguage()
  return {
    language,
    messages: getDictionary(language),
  }
})

export const getServerTranslator = cache(async (): Promise<{ language: SupportedLanguage; t: TranslateFn }> => {
  const { language, messages } = await getServerDictionary()
  return {
    language,
    t: (key: string, fallback?: string, replacements?: Record<string, string | number>) =>
      translate(messages, key, fallback, replacements),
  }
})

