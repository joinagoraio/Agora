"use server"

import { createClient } from "@/lib/supabase/server"

export interface WorkspaceNoteForContext {
  id: string
  workspace_id: string
  content: string
  include_in_ai_context: boolean
  created_at: string
  updated_at: string
  created_by: string
  author?: {
    id: string
    full_name?: string | null
    email?: string | null
  } | null
}

export async function getWorkspaceNotesForContext(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("workspace_notes")
    .select(
      "id, workspace_id, content, include_in_ai_context, created_at, updated_at, created_by, author:profiles(id, full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .eq("include_in_ai_context", true)
    .order("updated_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  const normalizedNotes: WorkspaceNoteForContext[] =
    data?.map((note: Record<string, any>) => {
      const authorValue = Array.isArray(note.author) ? note.author[0] : note.author
      return {
        id: String(note.id),
        workspace_id: String(note.workspace_id),
        content: note.content ?? "",
        include_in_ai_context: Boolean(note.include_in_ai_context),
        created_at: note.created_at,
        updated_at: note.updated_at,
        created_by: String(note.created_by),
        author: authorValue
          ? {
              id: String(authorValue.id),
              full_name: authorValue.full_name ?? null,
              email: authorValue.email ?? null,
            }
          : null,
      }
    }) ?? []

  return { data: normalizedNotes }
}

export async function getWorkspaceNotes(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("workspace_notes")
    .select(
      "id, workspace_id, content, include_in_ai_context, created_at, updated_at, created_by, author:profiles(id, full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  const notes: WorkspaceNoteForContext[] =
    data?.map((note: Record<string, any>) => {
      const authorValue = Array.isArray(note.author) ? note.author[0] : note.author
      return {
        id: String(note.id),
        workspace_id: String(note.workspace_id),
        content: note.content ?? "",
        include_in_ai_context: Boolean(note.include_in_ai_context),
        created_at: note.created_at,
        updated_at: note.updated_at,
        created_by: String(note.created_by),
        author: authorValue
          ? {
              id: String(authorValue.id),
              full_name: authorValue.full_name ?? null,
              email: authorValue.email ?? null,
            }
          : null,
      }
    }) ?? []

  return { data: notes }
}

