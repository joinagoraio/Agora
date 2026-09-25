import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isSuperAdmin, platformOpenAiKey } from "@/lib/llm/resolve"
import { NARRATION_VOICE } from "@/lib/programme/demo-narration"

const REALTIME_MODEL = process.env.DEMO_REALTIME_MODEL || "gpt-realtime"

const LANGUAGE_RULE = {
  nl: "Antwoord altijd in het Nederlands, met een natuurlijke Nederlandse uitspraak.",
  en: "Always answer in English.",
} as const

async function programmeContext(workspaceId: string) {
  const admin = createAdminClient()
  const [{ data: workspace }, { data: interests }, { data: measures }] = await Promise.all([
    admin.from("workspaces").select("name, space_id").eq("id", workspaceId).maybeSingle(),
    admin.from("programme_interests").select("reference, label, selected").eq("workspace_id", workspaceId),
    admin.from("programme_measures").select("title, decision, priority").eq("workspace_id", workspaceId),
  ])
  const { data: space } = workspace?.space_id
    ? await admin.from("spaces").select("name").eq("id", workspace.space_id).maybeSingle()
    : { data: null }
  const chosen = (interests || []).filter((interest) => interest.selected)
  const lines = [
    `Programme: ${workspace?.name ?? ""}`,
    `Authority: ${space?.name ?? ""}`,
    `Chosen provincial interests: ${chosen.map((interest) => `${interest.reference ?? ""} ${interest.label}`.trim()).join("; ") || "none yet"}`,
    `Measures (${(measures || []).length}): ${(measures || [])
      .slice(0, 40)
      .map((measure) => `${measure.title}${measure.decision ? ` [${measure.decision}]` : ""}${measure.priority ? ` (priority ${measure.priority})` : ""}`)
      .join("; ") || "none yet"}`,
  ]
  return lines.join("\n")
}

/** A short-lived key for a live voice session that answers audience questions during a demo tour. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user.id))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { workspaceId?: string; language?: string; step?: string }
  if (!body.workspaceId) return NextResponse.json({ error: "Missing programme" }, { status: 400 })
  const language = body.language === "nl" ? "nl" : "en"
  const apiKey = await platformOpenAiKey()
  if (!apiKey) return NextResponse.json({ error: "Add an OpenAI key in Platform admin first." }, { status: 400 })

  const instructions = [
    "You are the voice of Agora during a live demonstration to civil servants of Provincie Flevoland.",
    "Agora is a workbench that helps civil servants write an environmental programme (omgevingsprogramma) from the province's own documents: it analyses existing policy against the environmental vision, works up provincial interests, proposes measures that staff keep, adapt or drop, compares interests, writes chapters with page-level citations, records provenance and an audit pack, and publishes a fixed version for public consultation.",
    "Staff decide at every step; Agora reads, proposes and backs up. It only uses the documents linked to the programme.",
    "Answer questions from the room briefly: two to four spoken sentences. Be concrete and honest. If you do not know, say so and suggest asking the presenter afterwards. Never invent numbers, budgets, dates or legal claims.",
    LANGUAGE_RULE[language],
    body.step ? `The demo is currently at: ${body.step}.` : "",
    "What is in this programme right now:",
    await programmeContext(body.workspaceId),
  ]
    .filter(Boolean)
    .join("\n\n")

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions,
        audio: { output: { voice: NARRATION_VOICE } },
      },
    }),
  })
  const data = (await response.json().catch(() => null)) as { value?: string; error?: { message?: string } } | null
  if (!response.ok || !data?.value) {
    return NextResponse.json({ error: data?.error?.message || `Voice session failed (${response.status})` }, { status: 502 })
  }
  return NextResponse.json({ value: data.value, model: REALTIME_MODEL })
}
