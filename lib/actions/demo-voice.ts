"use server"

import { after } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isSuperAdmin, platformOpenAiKey } from "@/lib/llm/resolve"
import { parseDemoTour, type TourLanguage } from "@/lib/programme/demo-tour"
import {
  listNarrationFiles,
  NARRATION_BUCKET,
  NARRATION_INSTRUCTIONS,
  NARRATION_MODEL,
  NARRATION_VOICE,
  narrationPath,
} from "@/lib/programme/demo-narration"
import { ensureFlevolandDemoPack } from "@/lib/actions/demo-pack"
import { logger } from "@/lib/utils/logger"

export type NarrationStatus = { steps: number; recorded: Record<TourLanguage, number>; voice: string }

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user.id))) return false
  return true
}

async function loadTour(packId: string) {
  await ensureFlevolandDemoPack()
  const admin = createAdminClient()
  const { data } = await admin.from("platform_demo_packs").select("tour").eq("id", packId).maybeSingle()
  return parseDemoTour(data?.tour)
}

/** How much of a pack's tour has narration for the current text. */
export async function getNarrationStatus(packId: string): Promise<{ error?: string; data?: NarrationStatus }> {
  if (!(await requireSuperAdmin())) return { error: "Unauthorized" }
  const tour = await loadTour(packId)
  if (!tour) return { data: { steps: 0, recorded: { nl: 0, en: 0 }, voice: NARRATION_VOICE } }
  const recorded = { nl: 0, en: 0 }
  for (const language of ["nl", "en"] as const) {
    const files = await listNarrationFiles(packId, language)
    recorded[language] = tour.steps.filter((step) => files.has(narrationPath(packId, language, step))).length
  }
  return { data: { steps: tour.steps.length, recorded, voice: NARRATION_VOICE } }
}

async function speak(apiKey: string, language: TourLanguage, text: string) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: NARRATION_MODEL,
      voice: NARRATION_VOICE,
      input: text,
      instructions: NARRATION_INSTRUCTIONS[language],
      response_format: "mp3",
    }),
  })
  if (!response.ok) throw new Error(`Speech failed (${response.status}): ${(await response.text()).slice(0, 200)}`)
  return Buffer.from(await response.arrayBuffer())
}

/** Records narration for every step whose current text has none yet. Runs after the response. */
export async function recordTourNarration(packId: string): Promise<{ error?: string; data?: { missing: number } }> {
  if (!(await requireSuperAdmin())) return { error: "Unauthorized" }
  const tour = await loadTour(packId)
  if (!tour) return { error: "This pack has no tour." }
  const apiKey = await platformOpenAiKey()
  if (!apiKey) return { error: "Add an OpenAI key in Platform admin first." }

  const work: Array<{ language: TourLanguage; path: string; text: string }> = []
  for (const language of ["nl", "en"] as const) {
    const files = await listNarrationFiles(packId, language)
    for (const step of tour.steps) {
      const path = narrationPath(packId, language, step)
      if (!files.has(path)) work.push({ language, path, text: step.text[language].narration })
    }
  }

  after(async () => {
    const admin = createAdminClient()
    const queue = [...work]
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          const audio = await speak(apiKey, item.language, item.text)
          const { error } = await admin.storage.from(NARRATION_BUCKET).upload(item.path, audio, { contentType: "audio/mpeg", upsert: true })
          if (error) throw new Error(error.message)
        } catch (error) {
          logger.error("[DemoVoice] Narration failed", error, { path: item.path })
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
  })

  return { data: { missing: work.length } }
}
