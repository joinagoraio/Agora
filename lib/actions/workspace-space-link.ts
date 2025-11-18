"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  syncAllScopeDocumentsToWorkspace,
  removeScopeDocumentsFromWorkspace,
} from "@/lib/services/scope-documents"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { z } from "zod"

const workspaceLinkInputSchema = z.object({
  workspaceId: z.string().uuid("Invalid workspace ID"),
  spaceId: z.string().uuid("Invalid space ID"),
})

const workspaceIdSchema = z.object({
  workspaceId: z.string().uuid("Invalid workspace ID"),
})

export async function attachParentSpace(workspaceId: string, spaceId: string) {
  const supabase = await createClient()
  const validation = workspaceLinkInputSchema.safeParse({ workspaceId, spaceId })
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message || "Invalid input" }
  }
  const { workspaceId: validatedWorkspaceId, spaceId: validatedSpaceId } = validation.data

  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: validatedWorkspaceId })
  } catch (authError) {
    return { error: authError instanceof Error ? authError.message : "Unauthorized" }
  }

  // Verify workspace exists and user has access
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("space_id")
    .eq("id", validatedWorkspaceId)
    .maybeSingle()

  if (workspaceError) {
    return { error: workspaceError.message }
  }

  if (!workspace) {
    return { error: "Workspace not found" }
  }

  // Verify space exists and is accessible
  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("id, visibility")
    .eq("id", validatedSpaceId)
    .maybeSingle()

  if (spaceError) {
    return { error: spaceError.message }
  }

  if (!space) {
    return { error: "Space not found" }
  }

  // Create reference link
  const { data, error } = await supabase
    .from("workspace_space_links")
    .insert({
      workspace_id: validatedWorkspaceId,
      space_id: validatedSpaceId,
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
    await syncAllScopeDocumentsToWorkspace(validatedSpaceId, validatedWorkspaceId)
  } catch (syncError) {
    console.error("[WorkspaceSpaceLink] Failed to sync scope documents after attach:", syncError)
    if (data?.id) {
      await supabase.from("workspace_space_links").delete().eq("id", data.id)
    }
    const errorMessage =
      syncError instanceof Error ? syncError.message : "Failed to sync inherited documents for workspace"
    return { error: `Attached space but failed to sync documents: ${errorMessage}` }
  }

  revalidatePath(`/workspaces/${validatedWorkspaceId}`)
  return { data }
}

export async function detachParentSpace(workspaceId: string, spaceId: string) {
  const supabase = await createClient()
  const validation = workspaceLinkInputSchema.safeParse({ workspaceId, spaceId })
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message || "Invalid input" }
  }
  const { workspaceId: validatedWorkspaceId, spaceId: validatedSpaceId } = validation.data

  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: validatedWorkspaceId })
  } catch (authError) {
    return { error: authError instanceof Error ? authError.message : "Unauthorized" }
  }

  const { error } = await supabase
    .from("workspace_space_links")
    .delete()
    .eq("workspace_id", validatedWorkspaceId)
    .eq("space_id", validatedSpaceId)

  if (error) {
    return { error: error.message }
  }

  try {
    await removeScopeDocumentsFromWorkspace(validatedSpaceId, validatedWorkspaceId)
  } catch (cleanupError) {
    console.error("[WorkspaceSpaceLink] Failed to remove scope documents after detach:", cleanupError)
  }

  revalidatePath(`/workspaces/${validatedWorkspaceId}`)
  return { success: true }
}

export async function getWorkspaceParentSpaces(workspaceId: string) {
  const supabase = await createClient()
  const validation = workspaceIdSchema.safeParse({ workspaceId })
  if (!validation.success) {
    return { data: [], error: validation.error.issues[0]?.message || "Invalid workspace ID" }
  }
  const { workspaceId: validatedWorkspaceId } = validation.data

  try {
    await requireAuthAndPermission("conversation:view", { workspaceId: validatedWorkspaceId })
  } catch (authError) {
    return { data: [], error: authError instanceof Error ? authError.message : "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("workspace_space_links")
    .select("space_id, relationship, spaces(id, name, space_type, visibility)")
    .eq("workspace_id", validatedWorkspaceId)

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data || [] }
}

export async function getInheritedItems(workspaceId: string) {
  const supabase = await createClient()
  const validation = workspaceIdSchema.safeParse({ workspaceId })
  if (!validation.success) {
    return { data: [], error: validation.error.issues[0]?.message || "Invalid workspace ID" }
  }
  const { workspaceId: validatedWorkspaceId } = validation.data

  try {
    await requireAuthAndPermission("conversation:view", { workspaceId: validatedWorkspaceId })
  } catch (authError) {
    return { data: [], error: authError instanceof Error ? authError.message : "Unauthorized" }
  }

  // Get parent spaces for this workspace
  const { data: parentSpaces } = await supabase
    .from("workspace_space_links")
    .select("space_id")
    .eq("workspace_id", validatedWorkspaceId)

  if (!parentSpaces || parentSpaces.length === 0) {
    return { data: [] }
  }

  const spaceIds = parentSpaces.map((ps) => ps.space_id)

  // Get public space_items from parent spaces
  // Only include items with visibility='public' or classification='public'
  const { data: inheritedItems, error } = await supabase
    .from("space_items")
    .select(
      "*, created_by:profiles(id, email, full_name), source_doc:documents(id, title, url), spaces!inner(id, name, space_type, visibility)",
    )
    .in("space_id", spaceIds)
    .or("visibility.eq.public,classification.eq.public")
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: inheritedItems || [] }
}
