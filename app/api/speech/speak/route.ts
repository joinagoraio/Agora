import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { platformOpenAiKey } from "@/lib/llm/resolve"
import { recordLlmUsage } from "@/lib/llm/usage"
import { checkRateLimit, speechRateLimit } from "@/lib/rate-limit"
import { NARRATION_INSTRUCTIONS, NARRATION_VOICES } from "@/lib/programme/demo-narration"
import { SPEECH_MODEL, speechCostUsd, synthesizeSpeech } from "@/lib/speech/openai-speech"
import { speakableParts } from "@/lib/speech/speakable"

const MAX_CHARS = 8000

/** Reads an answer aloud: returns one mp3 for the whole text. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const limit = await checkRateLimit(speechRateLimit, `speech:user:${user.id}`)
  if (!limit.success) return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 })

  const body = (await request.json().catch(() => ({}))) as { text?: string; voice?: string; language?: string; workspaceId?: string }
  const text = (body.text ?? "").trim().slice(0, MAX_CHARS)
  if (!text) return NextResponse.json({ error: "Nothing to read" }, { status: 400 })
  const apiKey = await platformOpenAiKey()
  if (!apiKey) return NextResponse.json({ error: "Add an OpenAI key in Platform admin first." }, { status: 400 })

  const language = body.language === "nl" ? "nl" : "en"
  const voice = NARRATION_VOICES[body.voice === "male" ? "male" : "female"]
  try {
    const parts = await Promise.all(
      speakableParts(text).map((part) => synthesizeSpeech(apiKey, { voice, instructions: NARRATION_INSTRUCTIONS[language], text: part })),
    )
    const audio = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
    let offset = 0
    for (const part of parts) {
      audio.set(part, offset)
      offset += part.length
    }
    await recordLlmUsage({
      workspaceId: body.workspaceId ?? null,
      kind: "read_aloud",
      provider: "openai",
      model: SPEECH_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: speechCostUsd(audio.length),
    })
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Speech failed" }, { status: 502 })
  }
}
