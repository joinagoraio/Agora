"use server"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Checks whether the given user has access to the workspace either directly
 * (workspace membership) or implicitly (space owner/admin).
 */
export async function userHasWorkspaceAccess(
  supabase: SupabaseClient,
  workspaceId: string,
  spaceId: string,
  userId: string,
) {
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle()

  if (workspaceMember) {
    return true
  }

  const { data: spaceMembership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .maybeSingle()

  // Members have full access to workspaces, same as admin
  return Boolean(spaceMembership && ["owner", "admin", "member"].includes(spaceMembership.role))
}

