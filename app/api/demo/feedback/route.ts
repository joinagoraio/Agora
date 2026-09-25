import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { demoContextForWorkspace } from "@/lib/demo/feedback"

/** Keeps one spoken question from the room and the spoken answer, for the summary at the end of the demo. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    workspaceId?: string
    question?: string
    answer?: string
    step?: string
    language?: string
  }
  const question = (body.question ?? "").trim()
  if (!body.workspaceId || !question) return NextResponse.json({ error: "Missing question" }, { status: 400 })
  const context = await demoContextForWorkspace(body.workspaceId)
  if (!context) return NextResponse.json({ error: "Not a demo" }, { status: 400 })
  const { error } = await createAdminClient().from("demo_feedback_log").insert({
    pack_id: context.packId,
    space_id: context.spaceId,
    workspace_id: body.workspaceId,
    demo_name: context.demoName,
    source: "questions",
    step_id: body.step ?? null,
    language: body.language === "en" ? "en" : "nl",
    question: question.slice(0, 4000),
    answer: (body.answer ?? "").trim().slice(0, 8000) || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
