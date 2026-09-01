"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  wouldLeaveLastAdministrator,
  type SpaceJob,
  type WorkspaceJob,
} from "@/lib/guidance/jobs"

async function countSpaceAdministrators(spaceId: string) {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from("space_members")
    .select("id", { count: "exact", head: true })
    .eq("space_id", spaceId)
    .eq("job", "administrator")
  if (error) return 0
  return count ?? 0
}

export async function recordJobAudit(input: {
  spaceId?: string | null
  workspaceId?: string | null
  userId: string
  fromJob: string | null
  toJob: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from("membership_job_audit").insert({
    space_id: input.spaceId ?? null,
    workspace_id: input.workspaceId ?? null,
    user_id: input.userId,
    actor_id: user.id,
    from_job: input.fromJob,
    to_job: input.toJob,
  })
}

export async function updateSpaceMemberJob(spaceId: string, memberUserId: string, nextJob: SpaceJob) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const { data: actor } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!actor || !["owner", "admin"].includes(actor.role)) {
    return { error: "You don't have permission to change jobs" }
  }

  const { data: target } = await supabase
    .from("space_members")
    .select("job")
    .eq("space_id", spaceId)
    .eq("user_id", memberUserId)
    .maybeSingle()
  if (!target) return { error: "Member not found" }

  const administratorCount = await countSpaceAdministrators(spaceId)
  if (
    wouldLeaveLastAdministrator({
      currentJob: target.job,
      nextJob,
      administratorCount,
    })
  ) {
    return { error: "This organisation needs at least one administrator." }
  }

  const { error } = await supabase
    .from("space_members")
    .update({ job: nextJob })
    .eq("space_id", spaceId)
    .eq("user_id", memberUserId)
  if (error) return { error: error.message }

  await recordJobAudit({
    spaceId,
    userId: memberUserId,
    fromJob: target.job,
    toJob: nextJob,
  })
  revalidatePath(`/spaces/${spaceId}/settings`)
  return { success: true }
}

export async function updateWorkspaceMemberJob(workspaceId: string, memberUserId: string, nextJob: WorkspaceJob) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const { data: target } = await supabase
    .from("workspace_members")
    .select("job")
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberUserId)
    .maybeSingle()

  const { error } = target
    ? await supabase
        .from("workspace_members")
        .update({ job: nextJob })
        .eq("workspace_id", workspaceId)
        .eq("user_id", memberUserId)
    : await supabase.from("workspace_members").upsert(
        {
          workspace_id: workspaceId,
          user_id: memberUserId,
          role: "member",
          job: nextJob,
        },
        { onConflict: "workspace_id,user_id" },
      )
  if (error) return { error: error.message }

  const { data: workspace } = await supabase.from("workspaces").select("space_id").eq("id", workspaceId).single()
  await recordJobAudit({
    spaceId: workspace?.space_id,
    workspaceId,
    userId: memberUserId,
    fromJob: target?.job ?? null,
    toJob: nextJob,
  })
  revalidatePath(`/workspaces/${workspaceId}`)
  return { success: true }
}
