import "server-only"

import { createHash } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import { TOUR_VOICES, type DemoTour, type TourLanguage, type TourNarration, type TourStep, type TourVoice } from "@/lib/programme/demo-tour"

export const NARRATION_BUCKET = "demo-narration"
export { SPEECH_MODEL as NARRATION_MODEL } from "@/lib/speech/openai-speech"
import { SPEECH_MODEL as NARRATION_MODEL } from "@/lib/speech/openai-speech"

/** OpenAI voices: marin and cedar are its most natural female and male voices. */
export const NARRATION_VOICES: Record<TourVoice, string> = {
  female: process.env.DEMO_NARRATION_VOICE_FEMALE || "marin",
  male: process.env.DEMO_NARRATION_VOICE_MALE || "cedar",
}

export const NARRATION_INSTRUCTIONS: Record<TourLanguage, string> = {
  nl: "Spreek Nederlands met een natuurlijke Nederlandse uitspraak, zoals een rustige, heldere presentator op een bijeenkomst voor provinciale ambtenaren. Warm en zeker, niet te snel, met korte pauzes tussen zinnen.",
  en: "Speak clear British-neutral English like a calm, confident presenter at a briefing for civil servants. Warm, unhurried, with short pauses between sentences.",
}

export function narrationPath(packId: string, voice: TourVoice, language: TourLanguage, step: TourStep) {
  const voiceId = NARRATION_VOICES[voice]
  const hash = createHash("sha1")
    .update([NARRATION_MODEL, voiceId, NARRATION_INSTRUCTIONS[language], step.text[language].narration].join("\n"))
    .digest("hex")
    .slice(0, 12)
  return `${packId}/${voiceId}/${language}/${step.id}-${hash}.mp3`
}

export async function listNarrationFiles(packId: string, voice: TourVoice, language: TourLanguage) {
  const admin = createAdminClient()
  const folder = `${packId}/${NARRATION_VOICES[voice]}/${language}`
  const { data } = await admin.storage.from(NARRATION_BUCKET).list(folder, { limit: 1000 })
  return new Set((data || []).map((file) => `${folder}/${file.name}`))
}

/** Public URLs of the narration already recorded for the current text of each step. */
export async function getTourNarration(packId: string, tour: DemoTour): Promise<TourNarration> {
  const admin = createAdminClient()
  const result: TourNarration = { female: { nl: {}, en: {} }, male: { nl: {}, en: {} } }
  for (const voice of TOUR_VOICES) {
    for (const language of ["nl", "en"] as const) {
      const files = await listNarrationFiles(packId, voice, language)
      for (const step of tour.steps) {
        const path = narrationPath(packId, voice, language, step)
        if (!files.has(path)) continue
        result[voice][language][step.id] = admin.storage.from(NARRATION_BUCKET).getPublicUrl(path).data.publicUrl
      }
    }
  }
  return result
}
