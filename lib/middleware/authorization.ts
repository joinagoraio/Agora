"use server"

import { createClient } from "@/lib/supabase/server"
import { hasPermission, type Role, type Permission } from "@/lib/rbac/permissions"

export type AuthorizationContext = {
  userId: string
  spaceId?: string
  workspaceId?: string
}

/**
 * Get user's role in a space
 */
export async function getUserSpaceRole(userId: string, spaceId: string): Promise<Role | null> {
  const supabase = await createClient()
  const { data: membership } = await supabase
    .from("space_members")
    .select("role")
    .eq("user_id", userId)
    .eq("space_id", spaceId)
    .maybeSingle()

  return (membership?.role as Role) || null
}

/**
 * Get user's role in a workspace (via parent space)
 */
export async function getUserWorkspaceRole(userId: string, workspaceId: string): Promise<Role | null> {
  const supabase = await createClient()
  
  // Get workspace to find parent space
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("space_id")
    .eq("id", workspaceId)
    .maybeSingle()

  if (!workspace?.space_id) {
    return null
  }

  return getUserSpaceRole(userId, workspace.space_id)
}

/**
 * Check if user has permission for an operation
 */
export async function checkPermission(
  userId: string,
  permission: Permission,
  context: { spaceId?: string; workspaceId?: string },
): Promise<{ allowed: boolean; role: Role | null; error?: string }> {
  if (!context.spaceId && !context.workspaceId) {
    return { allowed: false, role: null, error: "Either spaceId or workspaceId must be provided" }
  }

  let role: Role | null = null

  if (context.spaceId) {
    role = await getUserSpaceRole(userId, context.spaceId)
  } else if (context.workspaceId) {
    role = await getUserWorkspaceRole(userId, context.workspaceId)
  }

  if (!role) {
    return { allowed: false, role: null, error: "User is not a member of the space/workspace" }
  }

  const allowed = hasPermission(role, permission)
  return { allowed, role, error: allowed ? undefined : "Insufficient permissions" }
}

/**
 * Require permission - throws error if not allowed
 */
export async function requirePermission(
  userId: string,
  permission: Permission,
  context: { spaceId?: string; workspaceId?: string },
): Promise<Role> {
  const result = await checkPermission(userId, permission, context)
  
  if (!result.allowed) {
    throw new Error(result.error || "Permission denied")
  }

  return result.role!
}

/**
 * Verify user is authenticated and get user ID
 */
export async function requireAuth(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  return user.id
}

/**
 * Verify user has permission for an operation (combines auth + permission check)
 */
export async function requireAuthAndPermission(
  permission: Permission,
  context: { spaceId?: string; workspaceId?: string },
): Promise<{ userId: string; role: Role }> {
  const userId = await requireAuth()
  const role = await requirePermission(userId, permission, context)
  return { userId, role }
}

