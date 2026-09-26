import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { TOUR_ASK_QUESTION } from "@/lib/programme/flevoland-tour"

/** Questions the autopilot asks itself; they are not the room's. */
const SCRIPTED_QUESTIONS = new Set(Object.values(TOUR_ASK_QUESTION).map((question) => question.trim()))

export type DemoContext = { spaceId: string; workspaceIds: string[]; packId: string | null; demoName: string; loadedAt: string }

/** The loaded demo a programme belongs to, or null when it is not a demo. */
export async function demoContextForWorkspace(workspaceId: string): Promise<DemoContext | null> {
  const admin = createAdminClient()
  const { data: workspace } = await admin.from("workspaces").select("space_id").eq("id", workspaceId).maybeSingle()
  if (!workspace?.space_id) return null
  const { data: space } = await admin.from("spaces").select("id, name, metadata, created_at").eq("id", workspace.space_id).maybeSingle()
  const metadata = ((space?.metadata as Record<string, unknown> | null) || {}) as Record<string, unknown>
  if (!space || metadata.demo !== true) return null
  const { data: workspaces } = await admin.from("workspaces").select("id").eq("space_id", space.id)
  return {
    spaceId: space.id as string,
    workspaceIds: (workspaces || []).map((row) => row.id as string),
    packId: typeof metadata.demoPackId === "string" ? metadata.demoPackId : null,
    demoName: space.name as string,
    loadedAt: typeof metadata.demoLoadedAt === "string" ? metadata.demoLoadedAt : (space.created_at as string),
  }
}

export type FeedbackEntry = { source: "ask" | "questions"; stepId: string | null; question: string; answer: string | null; createdAt: string }

/** Copies the demo's Ask conversations into the feedback log, which outlives the demo, and returns every entry. */
export async function collectDemoFeedback(context: DemoContext): Promise<FeedbackEntry[]> {
  const admin = createAdminClient()
  const { data: conversations } = await admin
    .from("conversations")
    .select("id")
    .or(`space_id.eq.${context.spaceId}${context.workspaceIds.length ? `,workspace_id.in.(${context.workspaceIds.join(",")})` : ""}`)
  const ids = (conversations || []).map((row) => row.id as string)
  if (ids.length) {
    const { data: messages } = await admin
      .from("messages")
      .select("id, conversation_id, role, content, created_at")
      .in("conversation_id", ids)
      .gte("created_at", context.loadedAt)
      .order("created_at", { ascending: true })
    const rows: Array<Record<string, unknown>> = []
    const byConversation = new Map<string, Array<{ id: string; role: string; content: string; created_at: string }>>()
    for (const message of messages || []) {
      const list = byConversation.get(message.conversation_id as string) ?? []
      list.push(message as { id: string; role: string; content: string; created_at: string })
      byConversation.set(message.conversation_id as string, list)
    }
    for (const list of byConversation.values()) {
      list.forEach((message, index) => {
        if (message.role !== "user" || !message.content.trim() || SCRIPTED_QUESTIONS.has(message.content.trim())) return
        const answer = list.slice(index + 1).find((next) => next.role === "assistant")
        rows.push({
          pack_id: context.packId,
          space_id: context.spaceId,
          workspace_id: context.workspaceIds[0] ?? null,
          demo_name: context.demoName,
          source: "ask",
          source_id: message.id,
          question: message.content.slice(0, 4000),
          answer: answer?.content.slice(0, 8000) ?? null,
          created_at: message.created_at,
        })
      })
    }
    if (rows.length) await admin.from("demo_feedback_log").upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: false })
  }
  const { data: entries } = await admin
    .from("demo_feedback_log")
    .select("source, step_id, question, answer, created_at")
    .eq("space_id", context.spaceId)
    .order("created_at", { ascending: true })
  return (entries || []).map((row) => ({
    source: row.source as "ask" | "questions",
    stepId: (row.step_id as string | null) ?? null,
    question: row.question as string,
    answer: (row.answer as string | null) ?? null,
    createdAt: row.created_at as string,
  }))
}
