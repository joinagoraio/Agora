import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { platformOpenAiKey } from "@/lib/llm/resolve"
import { recordLlmUsage } from "@/lib/llm/usage"
import { checkRateLimit, speechRateLimit } from "@/lib/rate-limit"
import { TRANSCRIBE_MODEL, transcribeSpeech } from "@/lib/speech/openai-speech"

const MAX_BYTES = 10 * 1024 * 1024

/** Turns a spoken question into text for the Ask box. The recording is not kept. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const limit = await checkRateLimit(speechRateLimit, `speech:user:${user.id}`)
  if (!limit.success) return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 })

  const form = await request.formData().catch(() => null)
  const audio = form?.get("audio")
  if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: "No recording" }, { status: 400 })
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "The recording is too long." }, { status: 413 })
  const language = form?.get("language") === "en" ? "en" : "nl"
  const workspaceId = typeof form?.get("workspaceId") === "string" ? (form?.get("workspaceId") as string) : null
  const apiKey = await platformOpenAiKey()
  if (!apiKey) return NextResponse.json({ error: "Add an OpenAI key in Platform admin first." }, { status: 400 })

  try {
    const result = await transcribeSpeech(apiKey, audio, language)
    await recordLlmUsage({
      workspaceId,
      kind: "dictation",
      provider: "openai",
      model: TRANSCRIBE_MODEL,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    })
    return NextResponse.json({ text: result.text })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transcription failed" }, { status: 502 })
  }
}
