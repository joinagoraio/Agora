import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { sanitizeGuidanceTelemetry } from "@/lib/guidance/telemetry"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = sanitizeGuidanceTelemetry(payload)
  if (!parsed) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 })
  }

  const { error } = await supabase.from("guidance_telemetry_events").insert({
    user_id: user.id,
    event: parsed.event,
    job: parsed.job ?? null,
    mode: parsed.mode ?? null,
    section: parsed.section ?? null,
  })
  if (error) {
    console.info("[guidance-telemetry]", parsed)
    return new NextResponse(null, { status: 204 })
  }
  return new NextResponse(null, { status: 204 })
}
