"use server"

import type { SupabaseClient } from "@supabase/supabase-js"

import { canAccessProgramme } from "@/lib/programme/membership"

/**
 * Checks whether the given user can open a programme: they are on that
 * programme, they created it, or they administer the authority.
 */
export async function userHasWorkspaceAccess(
  supabase: SupabaseClient,
  workspaceId: string,
  spaceId: string,
  userId: string,
) {
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("created_by")
    .eq("id", workspaceId)
    .maybeSingle()

  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle()

  const { data: spaceMembership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .maybeSingle()

  return canAccessProgramme({
    isWorkspaceMember: Boolean(workspaceMember),
    isCreator: workspace?.created_by === userId,
    spaceRole: spaceMembership?.role ?? null,
  })
}

