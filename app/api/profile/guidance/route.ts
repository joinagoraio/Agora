import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import type { GuidanceMode } from "@/lib/guidance/jobs"

const payloadSchema = z.object({
  guidanceMode: z.enum(["guided", "expert"]).optional(),
  dismissExpertPrompt: z.boolean().optional(),
})

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("guidance_mode, expert_prompt_dismissed_at")
    .eq("id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: "Failed to load guidance preference" }, { status: 500 })
  }

  const mode: GuidanceMode = data?.guidance_mode === "expert" ? "expert" : "guided"
  return NextResponse.json({
    guidanceMode: mode,
    expertPromptDismissedAt: data?.expert_prompt_dismissed_at ?? null,
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const result = payloadSchema.safeParse(payload)
  if (!result.success) {
    return NextResponse.json({ error: "Invalid guidance preference" }, { status: 400 })
  }

  const patch: Record<string, string | null> = {}
  if (result.data.guidanceMode) patch.guidance_mode = result.data.guidanceMode
  if (result.data.dismissExpertPrompt) patch.expert_prompt_dismissed_at = new Date().toISOString()

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("guidance_mode, expert_prompt_dismissed_at")
    .single()

  if (error) {
    return NextResponse.json({ error: "Failed to update guidance preference" }, { status: 500 })
  }

  return NextResponse.json({
    guidanceMode: data?.guidance_mode === "expert" ? "expert" : "guided",
    expertPromptDismissedAt: data?.expert_prompt_dismissed_at ?? null,
  })
}
