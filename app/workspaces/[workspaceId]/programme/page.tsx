import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"

export const dynamic = "force-dynamic"
import { ProgrammeWorkbench } from "@/components/programme-workbench"
import { WorkspaceChatWrapper } from "@/components/workspace-chat-wrapper"
import { ProgrammeJobsProvider } from "@/components/programme-jobs-provider"
import { DemoStrip } from "@/components/demo-strip"
import { getLoadedDemo } from "@/lib/actions/demo-pack"
import { getTourNarration } from "@/lib/programme/demo-narration"
import { DemoTourProvider } from "@/components/demo-tour"
import { parseDocumentOwnerId } from "@/lib/programme/ownership"
import { isEnvironmentalProgrammeWorkspace, resolveWorkspaceKind } from "@/lib/programme/domain"
import { canAccessProgramme, canManageProgrammeAccess, isAuthorityAdministrator } from "@/lib/programme/membership"
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
        .select("id, name, summary, description, kind, metadata, space_id, created_by")
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
      supabase.from("profiles").select("guidance_mode, guidance_sidebar, guidance_strip, expert_prompt_dismissed_at").eq("id", user.id).maybeSingle(),
    ])

  const guidanceMode: GuidanceMode = profile?.guidance_mode === "expert" ? "expert" : "guided"
  const guidanceSidebar = Boolean(profile?.guidance_sidebar)
  const guidanceStrip = Boolean(profile?.guidance_strip)
  const isCreator = workspace.created_by === user.id
  if (
    !canAccessProgramme({
      isWorkspaceMember: Boolean(workspaceMembership),
      isCreator,
      spaceRole: spaceMembership?.role ?? null,
    })
  ) {
    redirect(`/spaces/${workspace.space_id}`)
  }

  const canAccessSettings = canManageProgrammeAccess({
    workspaceRole: workspaceMembership?.role ?? null,
    isCreator,
    spaceRole: spaceMembership?.role ?? null,
  })
  const accessRole =
    isCreator
      ? spaceMembership?.role === "owner"
        ? "owner"
        : "admin"
      : spaceMembership?.role === "owner" || spaceMembership?.role === "admin"
        ? spaceMembership.role
        : workspaceMembership?.role || "viewer"
  const { data: loadedDemo } = await getLoadedDemo(workspace.space_id)
  const canManage =
    canAccessSettings ||
    workspaceMembership?.role === "member" ||
    isAuthorityAdministrator(spaceMembership?.role)

  const tour = loadedDemo?.tour ?? null
  const narration = tour && loadedDemo ? await getTourNarration(loadedDemo.packId, tour) : null

  const content = (
      <WorkspaceChatWrapper
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        canManage={canManage}
        defaultOpen={Boolean(tour)}
        defaultPanelTab={tour ? "guidance" : "ask"}
      >
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
        guidanceSidebar={guidanceSidebar}
        guidanceStrip={guidanceStrip}
        expertPromptDismissed={Boolean(profile?.expert_prompt_dismissed_at)}
        helpAiEnabled={resolveHelpAiEnabled({
          spaceHelpAiDisabled: isSpaceHelpAiDisabled(space?.metadata),
        })}
        canAccessSettings={canAccessSettings}
        topBanner={loadedDemo ? <DemoStrip demo={loadedDemo} /> : null}
        demo={Boolean(loadedDemo)}
        currentUserId={user.id}
        accessRole={accessRole}
        initialDocumentOwnerId={
          parseDocumentOwnerId(workspace.metadata) || workspace.created_by || null
        }
      />
      </WorkspaceChatWrapper>
  )

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ProgrammeJobsProvider workspaceId={workspace.id}>
        {tour ? (
          <DemoTourProvider tour={tour} workspaceId={workspace.id} spaceId={workspace.space_id} narration={narration}>
            {content}
          </DemoTourProvider>
        ) : (
          content
        )}
      </ProgrammeJobsProvider>
    </Suspense>
  )
}
