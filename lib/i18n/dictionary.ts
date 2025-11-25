import { DEFAULT_LANGUAGE, type SupportedLanguage } from "@/lib/i18n/config"
import { enMessages } from "@/lib/i18n/messages/en"
import { nlMessages } from "@/lib/i18n/messages/nl"

const dictionaries = {
  en: enMessages,
  nl: nlMessages,
}

export type Messages = typeof enMessages

export function getDictionary(language: SupportedLanguage): Messages {
  return dictionaries[language] ?? dictionaries[DEFAULT_LANGUAGE]
}

