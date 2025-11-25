"use client"

import type { ReactNode } from "react"
import { useCallback, useMemo, useState } from "react"

import type { SupportedLanguage } from "@/lib/i18n/config"
import type { Messages } from "@/lib/i18n/dictionary"
import { I18nContext } from "@/lib/i18n/context"
import { getDictionary } from "@/lib/i18n/dictionary"
import { translate } from "@/lib/i18n/translate"

interface I18nClientProviderProps {
  children: ReactNode
  initialLanguage: SupportedLanguage
  initialMessages?: Messages
}

export function I18nClientProvider({ children, initialLanguage, initialMessages }: I18nClientProviderProps) {
  const [language, setLanguageState] = useState<SupportedLanguage>(initialLanguage)
  const [messages, setMessages] = useState<Messages>(initialMessages ?? getDictionary(initialLanguage))

  const setLanguage = useCallback(
    (nextLanguage: SupportedLanguage) => {
      if (nextLanguage === language) {
        return
      }

      setLanguageState(nextLanguage)
      setMessages(getDictionary(nextLanguage))
    },
    [language],
  )

  const value = useMemo(
    () => ({
      language,
      messages,
      t: (key: string, fallback?: string) => translate(messages, key, fallback),
      setLanguage,
    }),
    [language, messages, setLanguage],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

