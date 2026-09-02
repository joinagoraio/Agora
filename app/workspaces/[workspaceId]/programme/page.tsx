import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { ProgrammeWorkbench } from "@/components/programme-workbench"
import { WorkspaceChatWrapper } from "@/components/workspace-chat-wrapper"
import { isEnvironmentalProgrammeWorkspace, resolveWorkspaceKind } from "@/lib/programme/domain"
import { isSpaceHelpAiDisabled, resolveHelpAiEnabled } from "@/lib/guidance/help-flag"
import type { GuidanceMode } from "@/lib/guidance/jobs"

export default async function ProgrammeWorkbenchPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: workspace } = await supabase
    .from("workspaces")
        .select("id, name, summary, description, kind, metadata, space_id")
    .eq("id", workspaceId)
    .single()

  if (!workspace) notFound()

  if (
    !isEnvironmentalProgrammeWorkspace({
      kind: workspace.kind,
      metadata: workspace.metadata as Record<string, unknown>,
    })
  ) {
    redirect(`/workspaces/${workspaceId}`)
  }

  const kind = resolveWorkspaceKind({
    kind: workspace.kind,
    metadata: workspace.metadata as Record<string, unknown>,
  })

  const [{ data: space }, { data: spaceMembership }, { data: workspaceMembership }, { data: profile }] =
    await Promise.all([
      supabase.from("spaces").select("name, metadata").eq("id", workspace.space_id).maybeSingle(),
      supabase
        .from("space_members")
        .select("job, role")
        .eq("space_id", workspace.space_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("workspace_members")
        .select("job, role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("profiles").select("guidance_mode, expert_prompt_dismissed_at").eq("id", user.id).maybeSingle(),
    ])

  const guidanceMode: GuidanceMode = profile?.guidance_mode === "expert" ? "expert" : "guided"
  const canAccessSettings = spaceMembership?.role === "owner" || spaceMembership?.role === "admin"
  const canManage =
    spaceMembership?.role === "owner" ||
    spaceMembership?.role === "admin" ||
    spaceMembership?.role === "member" ||
    workspaceMembership?.role === "admin" ||
    workspaceMembership?.role === "member"

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <WorkspaceChatWrapper workspaceId={workspace.id} workspaceName={workspace.name} canManage={canManage}>
      <ProgrammeWorkbench
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        workspaceSummary={workspace.summary ?? ""}
        workspaceDescription={workspace.description ?? ""}
        spaceId={workspace.space_id}
        spaceName={space?.name || ""}
        kind={kind}
        metadata={(workspace.metadata as Record<string, unknown>) || {}}
        spaceJob={spaceMembership?.job ?? "none"}
        workspaceJob={workspaceMembership?.job ?? "author"}
        guidanceMode={guidanceMode}
        expertPromptDismissed={Boolean(profile?.expert_prompt_dismissed_at)}
        helpAiEnabled={resolveHelpAiEnabled({
          spaceHelpAiDisabled: isSpaceHelpAiDisabled(space?.metadata),
        })}
        canAccessSettings={canAccessSettings}
      />
      </WorkspaceChatWrapper>
    </Suspense>
  )
}
