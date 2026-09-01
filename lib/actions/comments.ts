"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"

export async function listProgrammeComments(
  workspaceId: string,
  artefactType?: string,
  artefactId?: string,
) {
  const supabase = await createClient()
  let query = supabase
    .from("programme_comments")
    .select("id, artefact_type, artefact_id, body, resolved, created_at, created_by")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
  if (artefactType) query = query.eq("artefact_type", artefactType)
  if (artefactId) query = query.eq("artefact_id", artefactId)
  const { data, error } = await query
  if (error) return { error: error.message, data: [] }
  const rows = data || []
  const ids = [...new Set(rows.map((row) => row.created_by).filter((id): id is string => Boolean(id)))]
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, email, full_name, avatar_url").in("id", ids)
    : { data: [] as Array<{ id: string; email: string; full_name: string | null; avatar_url: string | null }> }
  return {
    data: rows.map((row) => {
      const profile = (profiles || []).find((item) => item.id === row.created_by)
      return {
        ...row,
        authorName: profile?.full_name || profile?.email || null,
        authorAvatarUrl: profile?.avatar_url || null,
      }
    }),
  }
}

export async function addProgrammeComment(input: {
  workspaceId: string
  artefactType: "measure" | "outline_node" | "document" | "section"
  artefactId: string
  body: string
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
  const { data, error } = await supabase
    .from("programme_comments")
    .insert({
      workspace_id: input.workspaceId,
      artefact_type: input.artefactType,
      artefact_id: input.artefactId,
      body: input.body.trim(),
      created_by: user?.id ?? null,
    })
    .select()
    .single()
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
