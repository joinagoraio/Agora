"use client"

import { useContext } from "react"

import { I18nContext } from "@/lib/i18n/context"

export function useI18n() {
  const context = useContext(I18nContext)

  if (!context || typeof context.setLanguage !== "function") {
    throw new Error("useI18n must be used within the I18nClientProvider.")
  }

  return context
}

