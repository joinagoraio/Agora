"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { demoContextForWorkspace } from "@/lib/demo/feedback"
import { addDemoColleagues, DEMO_COLLEAGUES, DEMO_RESIDENTS, ensureDemoPeople } from "@/lib/demo/people"
import {
  colleagueNotesMessages,
  parseDemoNotes,
  parseDemoResponses,
  publishedPassages,
  residentResponsesMessages,
  type DemoParagraph,
} from "@/lib/demo/people-prompts"
import { paragraphArtefactId } from "@/lib/programme/comment-anchor"
import { workspaceWritingLanguage } from "@/lib/programme/meaning-groups-llm"

async function requireDemoAdmin(workspaceId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await isSuperAdmin(user.id))) return { error: "Unauthorized" as const }
  const context = await demoContextForWorkspace(workspaceId)
  if (!context) return { error: "This programme is not part of a loaded demo." as const }
  return { user, context }
}

/**
 * Demo only: the demo colleagues read the chapters written so far and leave notes on real paragraphs,
 * several making the same point in their own words, so grouping and answering once can be shown.
 */
export async function seedDemoColleagueNotes(workspaceId: string, paragraphs: DemoParagraph[]): Promise<{ error?: string; data?: { notes: number } }> {
  const auth = await requireDemoAdmin(workspaceId)
  if ("error" in auth) return { error: auth.error }
  const usable = paragraphs.filter((paragraph) => paragraph.text.trim().length >= 60).slice(0, 60)
  if (usable.length < 4) return { error: "Let Agora write a few chapters first; the colleagues need text to read." }

  const ids = await addDemoColleagues(workspaceId, auth.context.spaceId)
  const language = await workspaceWritingLanguage(workspaceId)
  const { completePlatformTask } = await import("@/lib/llm/resolve")
  const result = await completePlatformTask("summarize", {
    messages: colleagueNotesMessages(language, DEMO_COLLEAGUES, usable),
    maxTokens: 4000,
    json: true,
    usage: { workspaceId, kind: "demo_people" },
  })
  const plan = parseDemoNotes(result.text, usable.length, DEMO_COLLEAGUES.map((person) => person.slug))
  if (plan.notes.length === 0) return { error: "The colleagues could not write their notes. Try once more." }

  const admin = createAdminClient()
  const inserted: string[] = []
  for (const note of plan.notes) {
    const paragraph = usable[note.paragraph]!
    const { data, error } = await admin
      .from("programme_comments")
      .insert({
        workspace_id: workspaceId,
        artefact_type: "section",
        artefact_id: paragraphArtefactId(paragraph.documentId, paragraph.blockId),
        body: note.body,
        created_by: ids.get(note.author) ?? null,
      })
      .select("id, artefact_id")
      .single()
    if (error || !data) return { error: error?.message || "Could not save a note" }
    inserted.push(String(data.id))
  }
  for (const reply of plan.replies) {
    const parentId = inserted[reply.to]
    const parent = plan.notes[reply.to]
    if (!parentId || !parent) continue
    const paragraph = usable[parent.paragraph]!
    await admin.from("programme_comments").insert({
      workspace_id: workspaceId,
      artefact_type: "section",
      artefact_id: paragraphArtefactId(paragraph.documentId, paragraph.blockId),
      body: reply.body,
      parent_id: parentId,
      created_by: ids.get(reply.author) ?? null,
    })
  }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { notes: inserted.length } }
}

/**
 * Demo only: residents and partners respond to the published version during the open consultation,
 * several of them on the same passage, so the responses can be grouped by topic and decided together.
 */
export async function seedDemoConsultationResponses(workspaceId: string): Promise<{ error?: string; data?: { responses: number } }> {
  const auth = await requireDemoAdmin(workspaceId)
  if ("error" in auth) return { error: auth.error }
  const admin = createAdminClient()
  const { data: consultation } = await admin
    .from("programme_consultations")
    .select("id, publication_id, closed_at")
    .eq("workspace_id", workspaceId)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!consultation) return { error: "Open the consultation first." }
  const { data: publication } = await admin
    .from("programme_publications")
    .select("body_markdown")
    .eq("id", consultation.publication_id)
    .maybeSingle()
  const passages = publishedPassages(String(publication?.body_markdown || ""))
  if (passages.length < 4) return { error: "The published version has too little text to respond to." }

  const { data: earlier } = await admin
    .from("consultation_comments")
    .select("quote_text")
    .eq("consultation_id", consultation.id)
    .limit(5)
  const ids = await ensureDemoPeople(DEMO_RESIDENTS)
  const language = await workspaceWritingLanguage(workspaceId)
  const { completePlatformTask } = await import("@/lib/llm/resolve")
  const result = await completePlatformTask("summarize", {
    messages: residentResponsesMessages(
      language,
      DEMO_RESIDENTS,
      passages,
      (earlier || []).map((row) => String(row.quote_text || "")).filter(Boolean),
    ),
    maxTokens: 5000,
    json: true,
    usage: { workspaceId, kind: "demo_people" },
  })
  const responses = parseDemoResponses(result.text, passages, DEMO_RESIDENTS.map((person) => person.slug))
  if (responses.length === 0) return { error: "The residents could not write their responses. Try once more." }

  let saved = 0
  for (const response of responses) {
    const authorId = ids.get(response.author)
    if (!authorId) continue
    const { data, error } = await admin
      .from("consultation_comments")
      .insert({
        consultation_id: consultation.id,
        workspace_id: workspaceId,
        publication_id: consultation.publication_id,
        author_id: authorId,
        body: response.body,
        quote_text: response.quote,
        status: "open",
      })
      .select("id")
      .single()
    if (error || !data) return { error: error?.message || "Could not save a response" }
    await admin.from("consultation_comment_events").insert({
      comment_id: data.id,
      workspace_id: workspaceId,
      actor_id: authorId,
      from_status: null,
      to_status: "open",
      reason: null,
      source: "system",
    })
    saved += 1
  }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  revalidatePath(`/published/${consultation.publication_id}`)
  return { data: { responses: saved } }
}
