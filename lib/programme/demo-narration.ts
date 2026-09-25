import "server-only"

import { createHash } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import type { DemoTour, TourLanguage, TourNarration, TourStep } from "@/lib/programme/demo-tour"

export const NARRATION_BUCKET = "demo-narration"
export const NARRATION_MODEL = "gpt-4o-mini-tts"
export const NARRATION_VOICE = process.env.DEMO_NARRATION_VOICE || "marin"

export const NARRATION_INSTRUCTIONS: Record<TourLanguage, string> = {
  nl: "Spreek Nederlands met een natuurlijke Nederlandse uitspraak, zoals een rustige, heldere presentator op een bijeenkomst voor provinciale ambtenaren. Warm en zeker, niet te snel, met korte pauzes tussen zinnen.",
  en: "Speak clear British-neutral English like a calm, confident presenter at a briefing for civil servants. Warm, unhurried, with short pauses between sentences.",
}

export function narrationPath(packId: string, language: TourLanguage, step: TourStep) {
  const hash = createHash("sha1")
    .update([NARRATION_MODEL, NARRATION_VOICE, NARRATION_INSTRUCTIONS[language], step.text[language].narration].join("\n"))
    .digest("hex")
    .slice(0, 12)
  return `${packId}/${language}/${step.id}-${hash}.mp3`
}

export async function listNarrationFiles(packId: string, language: TourLanguage) {
  const admin = createAdminClient()
  const { data } = await admin.storage.from(NARRATION_BUCKET).list(`${packId}/${language}`, { limit: 1000 })
  return new Set((data || []).map((file) => `${packId}/${language}/${file.name}`))
}

/** Public URLs of the narration already recorded for the current text of each step. */
export async function getTourNarration(packId: string, tour: DemoTour): Promise<TourNarration> {
  const admin = createAdminClient()
  const result: TourNarration = { nl: {}, en: {} }
  for (const language of ["nl", "en"] as const) {
    const files = await listNarrationFiles(packId, language)
    for (const step of tour.steps) {
      const path = narrationPath(packId, language, step)
      if (!files.has(path)) continue
      result[language][step.id] = admin.storage.from(NARRATION_BUCKET).getPublicUrl(path).data.publicUrl
    }
  }
  return result
}
