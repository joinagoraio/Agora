"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  syncAllScopeDocumentsToWorkspace,
  removeScopeDocumentsFromWorkspace,
} from "@/lib/services/scope-documents"

export async function attachParentSpace(workspaceId: string, spaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Verify workspace exists and user has access
  const { data: workspace } = await supabase.from("workspaces").select("space_id").eq("id", workspaceId).single()

  if (!workspace) {
    return { error: "Workspace not found" }
  }

  // Verify space exists and is accessible
  const { data: space } = await supabase.from("spaces").select("id, visibility").eq("id", spaceId).single()

  if (!space) {
    return { error: "Space not found" }
  }

  // Create reference link
  const { data, error } = await supabase
    .from("workspace_space_links")
    .insert({
      workspace_id: workspaceId,
      space_id: spaceId,
      relationship: "reference",
    })
    .select()
    .single()

  if (error) {
    // Check if link already exists
    if (error.code === "23505") {
      return { error: "Space is already attached to this workspace" }
    }
    return { error: error.message }
  }

  try {
    await syncAllScopeDocumentsToWorkspace(spaceId, workspaceId)
  } catch (syncError) {
    console.error("[WorkspaceSpaceLink] Failed to sync scope documents after attach:", syncError)
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { data }
}

export async function detachParentSpace(workspaceId: string, spaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { error } = await supabase
    .from("workspace_space_links")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("space_id", spaceId)

  if (error) {
    return { error: error.message }
  }

  try {
    await removeScopeDocumentsFromWorkspace(spaceId, workspaceId)
  } catch (cleanupError) {
    console.error("[WorkspaceSpaceLink] Failed to remove scope documents after detach:", cleanupError)
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { success: true }
}

export async function getWorkspaceParentSpaces(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("workspace_space_links")
    .select("space_id, relationship, spaces(id, name, space_type, visibility)")
    .eq("workspace_id", workspaceId)

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data || [] }
}

export async function getInheritedItems(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  // Get parent spaces for this workspace
  const { data: parentSpaces } = await supabase
    .from("workspace_space_links")
    .select("space_id")
    .eq("workspace_id", workspaceId)

  if (!parentSpaces || parentSpaces.length === 0) {
    return { data: [] }
  }

  const spaceIds = parentSpaces.map((ps) => ps.space_id)

  // Get public space_items from parent spaces
  // Only include items with visibility='public' or classification='public'
  const { data: inheritedItems, error } = await supabase
    .from("space_items")
    .select(
      "*, created_by:profiles(id, email, full_name), source_doc:documents(id, title, url), spaces(id, name, space_type)",
    )
    .in("space_id", spaceIds)
    .eq("classification", "public")
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: inheritedItems || [] }
}
