"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin, resolvePlatformTaskLlm } from "@/lib/llm/resolve"
import { completeLlm } from "@/lib/llm/complete"
import { collectDemoFeedback, demoContextForWorkspace, type FeedbackEntry } from "@/lib/demo/feedback"
import { digestPrompt } from "@/lib/demo/digest-prompt"

export type DemoDigest = { id: string; createdAt: string; demoName: string | null; entries: number; bodyMarkdown: string; language: string | null }

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return Boolean(user && (await isSuperAdmin(user.id)))
}

function mapDigest(row: Record<string, unknown>): DemoDigest {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    demoName: (row.demo_name as string | null) ?? null,
    entries: Number(row.entries ?? 0),
    bodyMarkdown: row.body_markdown as string,
    language: (row.language as string | null) ?? null,
  }
}

/**
 * Summarises what the room asked during the demo, through Ask and the Questions button, as topics and
 * improvement points for the team. Without names and without quoting questions, so it can be shown to the room.
 */
export async function makeDemoDigest(workspaceId: string, language: "nl" | "en"): Promise<{ error?: string; data?: DemoDigest | null }> {
  if (!(await requireSuperAdmin())) return { error: "Unauthorized" }
  const context = await demoContextForWorkspace(workspaceId)
  if (!context) return { error: "This programme is not part of a loaded demo." }
  const entries: FeedbackEntry[] = await collectDemoFeedback(context)
  if (entries.length === 0) return { data: null }

  const llm = await resolvePlatformTaskLlm("summarize")
  const prompt = digestPrompt(entries, language)
  const completion = await completeLlm({
    provider: llm.provider,
    endpoint: llm.endpoint,
    apiKey: llm.apiKey,
    model: llm.model,
    maxTokens: 6000,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    usage: { workspaceId, kind: "digest" },
  })
  const { data, error } = await createAdminClient()
    .from("demo_digests")
    .insert({
      pack_id: context.packId,
      space_id: context.spaceId,
      workspace_id: workspaceId,
      demo_name: context.demoName,
      language,
      entries: entries.length,
      body_markdown: completion.text.trim(),
    })
    .select("*")
    .single()
  if (error || !data) return { error: error?.message || "Could not save the summary" }
  return { data: mapDigest(data) }
}

/** The latest summary for a demo programme, if one was made. */
export async function getLatestDemoDigest(workspaceId: string): Promise<{ data: DemoDigest | null }> {
  if (!(await requireSuperAdmin())) return { data: null }
  const { data } = await createAdminClient()
    .from("demo_digests")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return { data: data ? mapDigest(data) : null }
}

/** Every summary made from a pack's demos, also of demos that have since been ended. */
export async function listDemoDigests(packId: string): Promise<{ data: DemoDigest[] }> {
  if (!(await requireSuperAdmin())) return { data: [] }
  const { data } = await createAdminClient()
    .from("demo_digests")
    .select("*")
    .eq("pack_id", packId)
    .order("created_at", { ascending: false })
    .limit(50)
  return { data: (data || []).map(mapDigest) }
}
