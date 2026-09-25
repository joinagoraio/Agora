"use server"

import { after } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isSuperAdmin, platformOpenAiKey } from "@/lib/llm/resolve"
import { parseDemoTour, TOUR_VOICES, type TourLanguage, type TourVoice } from "@/lib/programme/demo-tour"
import {
  listNarrationFiles,
  NARRATION_BUCKET,
  NARRATION_INSTRUCTIONS,
  NARRATION_MODEL,
  NARRATION_VOICES,
  narrationPath,
} from "@/lib/programme/demo-narration"
import { ensureFlevolandDemoPack } from "@/lib/actions/demo-pack"
import { recordLlmUsage } from "@/lib/llm/usage"
import { speechCostUsd, synthesizeSpeech } from "@/lib/speech/openai-speech"
import { logger } from "@/lib/utils/logger"

export type NarrationStatus = {
  steps: number
  recorded: Record<TourVoice, Record<TourLanguage, number>>
  voices: Record<TourVoice, string>
  costUsd: number
}

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return Boolean(user && (await isSuperAdmin(user.id)))
}

async function loadTour(packId: string) {
  await ensureFlevolandDemoPack()
  const admin = createAdminClient()
  const { data } = await admin.from("platform_demo_packs").select("tour").eq("id", packId).maybeSingle()
  return parseDemoTour(data?.tour, { allOptions: true })
}

/** How much of a pack's tour has narration for the current text, per voice and language. */
export async function getNarrationStatus(packId: string): Promise<{ error?: string; data?: NarrationStatus }> {
  if (!(await requireSuperAdmin())) return { error: "Unauthorized" }
  const tour = await loadTour(packId)
  const recorded = { female: { nl: 0, en: 0 }, male: { nl: 0, en: 0 } }
  const admin = createAdminClient()
  const { data: usage } = await admin.from("llm_usage").select("cost_usd").eq("kind", "narration")
  const costUsd = (usage || []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0)
  if (!tour) return { data: { steps: 0, recorded, voices: NARRATION_VOICES, costUsd } }
  for (const voice of TOUR_VOICES) {
    for (const language of ["nl", "en"] as const) {
      const files = await listNarrationFiles(packId, voice, language)
      recorded[voice][language] = tour.steps.filter((step) => files.has(narrationPath(packId, voice, language, step))).length
    }
  }
  return { data: { steps: tour.steps.length, recorded, voices: NARRATION_VOICES, costUsd } }
}

/** Records narration for every voice, language and step whose current text has none yet. Runs after the response. */
export async function recordTourNarration(packId: string): Promise<{ error?: string; data?: { missing: number } }> {
  if (!(await requireSuperAdmin())) return { error: "Unauthorized" }
  const tour = await loadTour(packId)
  if (!tour) return { error: "This pack has no tour." }
  const apiKey = await platformOpenAiKey()
  if (!apiKey) return { error: "Add an OpenAI key in Platform admin first." }

  const work: Array<{ voice: TourVoice; language: TourLanguage; path: string; text: string }> = []
  for (const voice of TOUR_VOICES) {
    for (const language of ["nl", "en"] as const) {
      const files = await listNarrationFiles(packId, voice, language)
      for (const step of tour.steps) {
        const path = narrationPath(packId, voice, language, step)
        if (!files.has(path)) work.push({ voice, language, path, text: step.text[language].narration })
      }
    }
  }

  after(async () => {
    const admin = createAdminClient()
    const queue = [...work]
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          const audio = await synthesizeSpeech(apiKey, {
            voice: NARRATION_VOICES[item.voice],
            instructions: NARRATION_INSTRUCTIONS[item.language],
            text: item.text,
          })
          const { error } = await admin.storage.from(NARRATION_BUCKET).upload(item.path, audio, { contentType: "audio/mpeg", upsert: true })
          if (error) throw new Error(error.message)
          await recordLlmUsage({
            kind: "narration",
            provider: "openai",
            model: NARRATION_MODEL,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: speechCostUsd(audio.length),
          })
        } catch (error) {
          logger.error("[DemoVoice] Narration failed", error, { path: item.path })
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
  })

  return { data: { missing: work.length } }
}
