import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { recordLlmUsage } from "@/lib/llm/usage"

type Details = { text_tokens?: number; audio_tokens?: number; cached_tokens?: number }

/** Realtime prices per million tokens: text and audio are billed differently. */
function realtimeCost(model: string, usage: { input_token_details?: Details; output_token_details?: Details }) {
  const mini = /mini/.test(model)
  const price = mini
    ? { textIn: 0.6, audioIn: 10, cached: 0.3, textOut: 2.4, audioOut: 20 }
    : { textIn: 4, audioIn: 32, cached: 0.4, textOut: 24, audioOut: 64 }
  const input = usage.input_token_details ?? {}
  const output = usage.output_token_details ?? {}
  const cached = input.cached_tokens ?? 0
  const textIn = Math.max(0, (input.text_tokens ?? 0) - cached)
  return (
    (textIn * price.textIn +
      (input.audio_tokens ?? 0) * price.audioIn +
      cached * price.cached +
      (output.text_tokens ?? 0) * price.textOut +
      (output.audio_tokens ?? 0) * price.audioOut) /
    1_000_000
  )
}

/** Records what one spoken answer to a question from the room cost. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    workspaceId?: string
    model?: string
    usage?: { input_tokens?: number; output_tokens?: number; input_token_details?: Details; output_token_details?: Details }
  }
  if (!body.workspaceId || !body.usage) return NextResponse.json({ error: "Missing usage" }, { status: 400 })
  const model = body.model || "gpt-realtime"
  await recordLlmUsage({
    workspaceId: body.workspaceId,
    kind: "questions",
    provider: "openai",
    model,
    inputTokens: body.usage.input_tokens ?? 0,
    outputTokens: body.usage.output_tokens ?? 0,
    costUsd: realtimeCost(model, body.usage),
  })
  return NextResponse.json({ ok: true })
}
