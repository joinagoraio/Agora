import { DEFAULT_LANGUAGE, type SupportedLanguage } from "@/lib/i18n/config"
import { enMessages } from "@/lib/i18n/messages/en"
import { nlMessages } from "@/lib/i18n/messages/nl"

type MessageSchema<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : MessageSchema<T[K]>
}

export type Messages = MessageSchema<typeof enMessages>

const dictionaries: Record<SupportedLanguage, Messages> = {
  en: enMessages as Messages,
  nl: nlMessages as Messages,
}

export function getDictionary(language: SupportedLanguage): Messages {
  return dictionaries[language] ?? dictionaries[DEFAULT_LANGUAGE]
}

