"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import {
  fallbackColleagueThemeDraft,
  parseColleagueThemeDraft,
  proposeColleagueCommentThemes,
  rootColleagueCommentId,
  type ClusterableColleagueComment,
  type ColleagueCommentThemeRecord,
  type ColleagueThemeDraft,
} from "@/lib/programme/colleague-comments"

const COMMENT_SELECT =
  "id, artefact_type, artefact_id, body, resolved, created_at, created_by, parent_id, theme_id, programme_comment_themes ( id, label, addressed )"
const COMMENT_SELECT_BASIC = "id, artefact_type, artefact_id, body, resolved, created_at, created_by"

function missingRelation(error: { message?: string } | null | undefined): boolean {
  const message = error?.message || ""
  return /does not exist|schema cache|column/i.test(message)
}

function themeFromJoin(value: unknown): { id: string; label: string; addressed: boolean } | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object") return null
  const record = row as { id?: unknown; label?: unknown; addressed?: unknown }
  if (typeof record.id !== "string") return null
  return {
    id: record.id,
    label: typeof record.label === "string" ? record.label : "",
    addressed: Boolean(record.addressed),
  }
}

function mapCommentRow(row: Record<string, unknown>) {
  const theme = themeFromJoin(row.programme_comment_themes)
  return {
    id: String(row.id),
    artefact_type: String(row.artefact_type),
    artefact_id: String(row.artefact_id),
    body: String(row.body),
    resolved: Boolean(row.resolved),
    created_at: row.created_at ? String(row.created_at) : null,
    created_by: typeof row.created_by === "string" ? row.created_by : null,
    parentId: typeof row.parent_id === "string" ? row.parent_id : null,
    themeId: typeof row.theme_id === "string" ? row.theme_id : theme?.id || null,
    themeLabel: theme?.label || null,
    themeAddressed: theme?.addressed ?? false,
  }
}

async function attachAuthors<T extends { created_by: string | null }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: T[],
) {
  const ids = [...new Set(rows.map((row) => row.created_by).filter((id): id is string => Boolean(id)))]
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, email, full_name, avatar_url").in("id", ids)
    : { data: [] as Array<{ id: string; email: string; full_name: string | null; avatar_url: string | null }> }
  return rows.map((row) => {
    const profile = (profiles || []).find((item) => item.id === row.created_by)
    return {
      ...row,
      authorName: profile?.full_name || profile?.email || null,
      authorAvatarUrl: profile?.avatar_url || null,
    }
  })
}

export async function listProgrammeComments(
  workspaceId: string,
  artefactType?: string,
  artefactId?: string,
) {
  const supabase = await createClient()
  const run = async (columns: string) => {
    let query = supabase
      .from("programme_comments")
      .select(columns)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
    if (artefactType) query = query.eq("artefact_type", artefactType)
    if (artefactId) query = query.eq("artefact_id", artefactId)
    return query
  }
  let { data, error } = await run(COMMENT_SELECT)
  if (error && missingRelation(error)) {
    ;({ data, error } = await run(COMMENT_SELECT_BASIC))
  }
  if (error) return { error: error.message, data: [] }
  const rows = ((data || []) as unknown as Record<string, unknown>[]).map((row) => mapCommentRow(row))
  return { data: await attachAuthors(supabase, rows) }
}

export async function listProgrammeCommentThemes(workspaceId: string) {
  const supabase = await createClient()
  const { data: themes, error } = await supabase
    .from("programme_comment_themes")
    .select("id, label, summary, suggested_reply, addressed, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
  if (error) {
    if (missingRelation(error)) return { data: [] as ColleagueCommentThemeRecord[] }
    return { error: error.message, data: [] as ColleagueCommentThemeRecord[] }
  }
  const { data: comments } = await supabase
    .from("programme_comments")
    .select("id, theme_id, parent_id")
    .eq("workspace_id", workspaceId)
    .is("parent_id", null)
  const counts = new Map<string, number>()
  for (const comment of comments || []) {
    if (typeof comment.theme_id !== "string") continue
    counts.set(comment.theme_id, (counts.get(comment.theme_id) || 0) + 1)
  }
  return {
    data: (themes || []).map((row) => ({
      id: String(row.id),
      label: String(row.label),
      summary: typeof row.summary === "string" ? row.summary : null,
      suggestedReply: typeof row.suggested_reply === "string" ? row.suggested_reply : null,
      addressed: Boolean(row.addressed),
      commentCount: counts.get(String(row.id)) || 0,
    })),
  }
}

export async function addProgrammeComment(input: {
  workspaceId: string
  artefactType: "measure" | "outline_node" | "document" | "section"
  artefactId: string
  body: string
  parentId?: string | null
}) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: input.workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  if (!input.body.trim()) return { error: "Comment cannot be empty" }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let artefactType = input.artefactType
  let artefactId = input.artefactId
  let parentId: string | null = null
  let themeId: string | null = null

  if (input.parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("programme_comments")
      .select("id, parent_id, artefact_type, artefact_id, theme_id, workspace_id")
      .eq("id", input.parentId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle()
    if (parentError || !parent) return { error: parentError?.message || "Comment not found" }
    const byId = new Map([
      [
        String(parent.id),
        { id: String(parent.id), parentId: typeof parent.parent_id === "string" ? parent.parent_id : null },
      ],
    ])
    parentId = rootColleagueCommentId(
      { id: String(parent.id), parentId: typeof parent.parent_id === "string" ? parent.parent_id : null },
      byId,
    )
    artefactType = parent.artefact_type as typeof artefactType
    artefactId = String(parent.artefact_id)
    themeId = typeof parent.theme_id === "string" ? parent.theme_id : null
  }

  const payload: Record<string, unknown> = {
    workspace_id: input.workspaceId,
    artefact_type: artefactType,
    artefact_id: artefactId,
    body: input.body.trim(),
    created_by: user?.id ?? null,
  }
  if (parentId) payload.parent_id = parentId
  if (themeId) payload.theme_id = themeId

  const { data, error } = await supabase.from("programme_comments").insert(payload).select().single()
  if (error) return { error: error.message }
  revalidatePath(`/workspaces/${input.workspaceId}/programme`)
  return { data }
}

export async function setProgrammeCommentResolved(workspaceId: string, commentId: string, resolved: boolean) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_comments")
    .update({ resolved, updated_at: new Date().toISOString() })
    .eq("id", commentId)
    .eq("workspace_id", workspaceId)
    .select()
    .single()
  if (error) return { error: error.message }
  return { data }
}

async function draftColleagueTheme(input: {
  label: string
  comments: ClusterableColleagueComment[]
}): Promise<ColleagueThemeDraft> {
  const fallback = fallbackColleagueThemeDraft(input)
  try {
    const { completePlatformTask } = await import("@/lib/llm/resolve")
    const result = await completePlatformTask("summarize", {
      messages: [
        {
          role: "system",
          content:
            "You group colleague notes on a live programme draft. These notes prepare the text for a later public consultation. They are not consultation comments and you must not invent consultation decisions or statuses. Return JSON only: {label, summary, suggestedReply}. suggestedReply is a draft answer the author can post as a colleague reply on the live draft.",
        },
        {
          role: "user",
          content: JSON.stringify({
            label: input.label,
            comments: input.comments.map((comment) => ({ quote: comment.quote || "", body: comment.body })),
          }),
        },
      ],
      maxTokens: 500,
      json: true,
    })
    return parseColleagueThemeDraft(result.text) || fallback
  } catch {
    return fallback
  }
}

export async function clusterColleagueComments(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { data: comments, error } = await supabase
    .from("programme_comments")
    .select("id, body, artefact_id, parent_id, theme_id, resolved")
    .eq("workspace_id", workspaceId)
    .is("parent_id", null)
    .eq("resolved", false)
  if (error) {
    if (missingRelation(error)) return { error: "Colleague comment themes are not available yet" }
    return { error: error.message }
  }
  const { data: themes, error: themeError } = await supabase
    .from("programme_comment_themes")
    .select("id, addressed")
    .eq("workspace_id", workspaceId)
  if (themeError) {
    if (missingRelation(themeError)) return { error: "Colleague comment themes are not available yet" }
    return { error: themeError.message }
  }
  const addressed = new Set((themes || []).filter((row) => row.addressed).map((row) => String(row.id)))
  const clusterable: ClusterableColleagueComment[] = (comments || []).map((row) => ({
    id: String(row.id),
    body: String(row.body),
    themeId: typeof row.theme_id === "string" ? row.theme_id : null,
    locked: typeof row.theme_id === "string" && addressed.has(row.theme_id),
  }))
  const proposed = proposeColleagueCommentThemes(clusterable)
  if (!proposed.length) {
    return { data: { themes: 0 } }
  }

  const staleIds = (themes || [])
    .filter((row) => !row.addressed)
    .map((row) => String(row.id))
  if (staleIds.length) {
    await supabase.from("programme_comments").update({ theme_id: null }).in("theme_id", staleIds).eq("workspace_id", workspaceId)
    await supabase.from("programme_comment_themes").delete().in("id", staleIds).eq("workspace_id", workspaceId)
  }

  let created = 0
  for (const group of proposed) {
    const members = clusterable.filter((comment) => group.memberIds.includes(comment.id))
    const draft = await draftColleagueTheme({ label: group.label, comments: members })
    let themeId = group.reuseThemeId
    if (themeId && addressed.has(themeId)) {
      await supabase
        .from("programme_comment_themes")
        .update({
          label: draft.label,
          summary: draft.summary,
          suggested_reply: draft.suggestedReply,
          updated_at: new Date().toISOString(),
        })
        .eq("id", themeId)
        .eq("workspace_id", workspaceId)
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("programme_comment_themes")
        .insert({
          workspace_id: workspaceId,
          label: draft.label,
          summary: draft.summary,
          suggested_reply: draft.suggestedReply,
        })
        .select("id")
        .single()
      if (insertError || !inserted) return { error: insertError?.message || "Could not group colleague notes" }
      themeId = String(inserted.id)
      created += 1
    }
    await supabase
      .from("programme_comments")
      .update({ theme_id: themeId, updated_at: new Date().toISOString() })
      .in("id", group.memberIds)
      .eq("workspace_id", workspaceId)
  }

  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { themes: created || proposed.length } }
}

export async function setProgrammeCommentThemeAddressed(
  workspaceId: string,
  themeId: string,
  addressed: boolean,
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from("programme_comment_themes")
    .update({ addressed, updated_at: new Date().toISOString() })
    .eq("id", themeId)
    .eq("workspace_id", workspaceId)
  if (error) return { error: error.message }
  const { data: members } = await supabase
    .from("programme_comments")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("theme_id", themeId)
    .is("parent_id", null)
  const ids = (members || []).map((row) => String(row.id))
  if (ids.length) {
    await supabase
      .from("programme_comments")
      .update({ resolved: addressed, updated_at: new Date().toISOString() })
      .in("id", ids)
      .eq("workspace_id", workspaceId)
  }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { addressed, resolved: ids.length } }
}
