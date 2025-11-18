"use server"

import { createClient } from "@/lib/supabase/server"
import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { env } from "@/lib/env"

export async function createWorkspaceShareLink(workspaceId: string, expiresInDays?: number) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Verify user has permission to share workspace
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, space_id, spaces(id, name)")
    .eq("id", workspaceId)
    .maybeSingle()

  if (workspaceError) {
    return { error: workspaceError.message }
  }

  if (!workspace) {
    return { error: "Workspace not found" }
  }

  // Generate unique token
  const token = randomBytes(32).toString("hex")
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null

  // Store share link in workspace metadata or create a new table
  // For now, we'll use a simple approach: store in workspace metadata
  const { data: existingShare, error: shareMetadataError } = await supabase
    .from("workspaces")
    .select("metadata")
    .eq("id", workspaceId)
    .maybeSingle()

  if (shareMetadataError) {
    return { error: shareMetadataError.message }
  }

  const metadata = existingShare?.metadata || {}
  const shareLinks = metadata.shareLinks || []
  
  shareLinks.push({
    token,
    expiresAt: expiresAt?.toISOString(),
    createdBy: user.id,
    createdAt: new Date().toISOString(),
  })

  const { error } = await supabase
    .from("workspaces")
    .update({
      metadata: {
        ...metadata,
        shareLinks,
      },
    })
    .eq("id", workspaceId)

  if (error) {
    return { error: error.message }
  }

  const shareUrl = `${env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/workspaces/${workspaceId}/share/${token}`

  return { data: { token, expiresAt }, shareUrl }
}

export async function getWorkspaceShareData(workspaceId: string, token: string) {
  const supabase = await createClient()

  // Get workspace with share link info
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("*, spaces(id, name, space_type)")
    .eq("id", workspaceId)
    .maybeSingle()

  if (error) {
    return { data: null, error: error.message }
  }

  if (!workspace) {
    return { data: null, error: "Workspace not found" }
  }

  // Verify token exists in metadata
  const shareLinks = workspace.metadata?.shareLinks || []
  const shareLink = shareLinks.find((sl: any) => sl.token === token)

  if (!shareLink) {
    return { data: null, error: "Invalid share token" }
  }

  // Check if expired
  if (shareLink.expiresAt && new Date(shareLink.expiresAt) < new Date()) {
    return { data: null, error: "This share link has expired" }
  }

  // Get public-only workspace items
  const { data: publicItems } = await supabase
    .from("workspace_items")
    .select("*, created_by:profiles(id, email, full_name)")
    .eq("workspace_id", workspaceId)
    .eq("classification", "public")
    .order("created_at", { ascending: false })

  // Get inherited public items from parent spaces
  const { data: parentSpaces } = await supabase
    .from("workspace_space_links")
    .select("space_id, spaces(id, name, space_type, visibility)")
    .eq("workspace_id", workspaceId)

  const inheritedItems: any[] = []
  type ParentSpaceRecord = {
    space_id: string
    id: string
    name: string
    space_type?: string | null
    visibility?: string | null
  }

  const normalizedParentSpaces = (parentSpaces ?? []).reduce<ParentSpaceRecord[]>((acc, ps) => {
    const spaceRecord = Array.isArray(ps.spaces) ? ps.spaces[0] : ps.spaces
    if (spaceRecord) {
      acc.push({
        space_id: ps.space_id,
        id: spaceRecord.id,
        name: spaceRecord.name,
        space_type: spaceRecord.space_type,
        visibility: spaceRecord.visibility,
      })
    }
    return acc
  }, [])

  if (normalizedParentSpaces.length > 0) {
    const spaceIds = normalizedParentSpaces.filter((space) => space.visibility === "public").map((space) => space.space_id)

    if (spaceIds.length > 0) {
      const { data: items } = await supabase
        .from("space_items")
        .select("*, spaces(id, name, space_type)")
        .in("space_id", spaceIds)
        .eq("classification", "public")

      if (items) {
        inheritedItems.push(...items)
      }
    }
  }

  return {
    data: {
      workspace,
      items: publicItems || [],
      inheritedItems,
      parentSpaces: normalizedParentSpaces.map(({ space_id, ...space }) => space),
    },
  }
}

export async function revokeWorkspaceShareLink(workspaceId: string, token: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: workspace, error: workspaceLookupError } = await supabase
    .from("workspaces")
    .select("metadata")
    .eq("id", workspaceId)
    .maybeSingle()

  if (workspaceLookupError) {
    return { error: workspaceLookupError.message }
  }

  if (!workspace) {
    return { error: "Workspace not found" }
  }

  const metadata = workspace.metadata || {}
  const shareLinks = (metadata.shareLinks || []).filter((sl: any) => sl.token !== token)

  const { error } = await supabase
    .from("workspaces")
    .update({
      metadata: {
        ...metadata,
        shareLinks,
      },
    })
    .eq("id", workspaceId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { success: true }
}
