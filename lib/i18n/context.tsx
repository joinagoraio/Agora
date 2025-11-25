import { createContext } from "react"

import type { SupportedLanguage } from "@/lib/i18n/config"
import type { Messages } from "@/lib/i18n/dictionary"
import { translate, type TranslateFn } from "@/lib/i18n/translate"

export type I18nContextValue = {
  language: SupportedLanguage
  messages: Messages
  t: TranslateFn
  setLanguage?: (language: SupportedLanguage) => void
}

export const I18nContext = createContext<I18nContextValue | null>(null)

