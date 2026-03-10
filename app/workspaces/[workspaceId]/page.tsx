import { redirect } from "next/navigation"
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { getServerTranslator } from "@/lib/i18n/server"
import { getSourcesByWorkspace } from "@/lib/actions/source"
import { getWorkspaceDocuments, getArchivedDocumentCount } from "@/lib/actions/document"
import {
  DocumentsList,
  MyDocumentsList,
  UploadDocumentDialog,
  AddFromSourceDialog,
  WorkspaceEvidenceBoard,
  WorkspaceInheritedItems,
  WorkspaceNotesPanel,
  WorkspaceNotesCount,
} from "@/components/workspace-page-client"
import type { WorkspaceNote } from "@/components/workspace-notes-panel"
import { WorkspaceChatWrapper } from "@/components/workspace-chat-wrapper"
import { WelcomeWorkspaceWrapper } from "@/components/welcome-workspace-wrapper"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { FileText, Plug, Upload, Plus, MessageSquare, ArrowLeft } from "lucide-react"
import { getWorkspaceItems } from "@/lib/actions/workspace-item"
import { getInheritedItems } from "@/lib/actions/workspace-space-link"
import { CreateWorkspaceDocumentDialog } from "@/components/create-workspace-document-dialog"
import { WorkspaceOverview } from "@/components/workspace-overview"
import { ManageSourcesDialog } from "@/components/manage-sources-dialog"
import { CreateSourceDialog } from "@/components/create-source-dialog"
import { EvidenceRefreshListener } from "@/components/evidence-refresh-listener"

type WorkspaceCommentRecord = {
  id: string
  workspace_id: string
  workspace_item_id: string
  content: string
  created_at: string
  created_by: string
  author?: {
    id: string
    full_name?: string | null
    email?: string | null
  } | null
}

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createClient()
  const { t } = await getServerTranslator()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get workspace details
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single()

  if (workspaceError || !workspace) {
    console.error("Error fetching workspace:", workspaceError)
    redirect("/dashboard")
  }

  // Get space details separately to avoid RLS issues with joins
  const { data: space } = await supabase
    .from("spaces")
    .select("*")
    .eq("id", workspace.space_id)
    .single()

  if (!space) {
    console.error("Error fetching space for workspace")
    redirect("/dashboard")
  }

  // Get user's space role (if they're a space member)
  const { data: spaceMembership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", workspace.space_id)
    .eq("user_id", user.id)
    .maybeSingle()

  // Check if user is a direct workspace member (not via space)
  const { data: workspaceMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle()

  // Determine if user is workspace-only (invited directly to workspace, not via space)
  const isWorkspaceOnlyMember = !spaceMembership && !!workspaceMembership
  const userSpaceRole = spaceMembership?.role ?? null
  const userWorkspaceRole = workspaceMembership?.role ?? null
  
  // Members can do everything except Settings
  // Space members (owner/admin/member) OR workspace members (admin/member) can manage
  const canManage = 
    userSpaceRole === "owner" || 
    userSpaceRole === "admin" || 
    userSpaceRole === "member" ||
    userWorkspaceRole === "admin" ||
    userWorkspaceRole === "member"
  
  const isViewer = userSpaceRole === "viewer" || userWorkspaceRole === "viewer"
  
  // Only owners and admins can access Settings (not members)
  const canAccessSettings = 
    userSpaceRole === "owner" || 
    userSpaceRole === "admin" ||
    userWorkspaceRole === "admin" || userWorkspaceRole === "viewer"

  // Create workspace object with space attached for compatibility
  const workspaceWithSpace = {
    ...workspace,
    spaces: space,
  }

  // Get sources
  const { data: sources } = await getSourcesByWorkspace(workspaceId)
  const sourcesArray = sources || []

  // Filter out direct_upload sources to get available sources for adding documents
  // Filter out workspace_generated sources since they're for internal workspace documents, not external sources
  const availableSources = sourcesArray.filter((source) => source.type !== "direct_upload" && source.type !== "workspace_generated")

  // Get documents and archived count
  const [documentsResult, archivedCountResult] = await Promise.all([
    getWorkspaceDocuments(workspaceId),
    getArchivedDocumentCount(workspaceId)
  ])
  const documentsList = documentsResult.data || []
  const archivedDocCount = archivedCountResult.count || 0
  const getDocumentOrigin = (doc: any): string | null => {
    const metadata = doc?.metadata
    if (!metadata || typeof metadata !== "object") {
      return null
    }
    const originValue = (metadata as Record<string, any>).origin
    return typeof originValue === "string" ? originValue : null
  }

  const createdDocuments = documentsList.filter((doc: any) => getDocumentOrigin(doc) === "workspace_generated")
  const inheritedDocuments = documentsList.filter((doc: any) => getDocumentOrigin(doc) === "space_scope")
  const uploadedDocuments = documentsList.filter((doc: any) => {
    const origin = getDocumentOrigin(doc)
    return origin !== "workspace_generated" && origin !== "space_scope"
  })

  // Get document count (excluding archived and deleted)
  const { count: documentCount } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted")
    .neq("status", "archived")

  const uploadedDocumentCount = uploadedDocuments.length
  const createdDocumentCount = createdDocuments.length
  const inheritedDocumentCount = inheritedDocuments.length
  const totalDocumentsCount =
    typeof documentCount === "number"
      ? documentCount
      : uploadedDocumentCount + createdDocumentCount + inheritedDocumentCount

  // Get conversation count
  const { count: conversationCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("context_type", "workspace")
    .is("context_id", null)

  const { data: parentSpaceLinks } = await supabase
    .from("workspace_space_links")
    .select("spaces(id, name, space_type)")
    .eq("workspace_id", workspaceId)
  const parentSpaces =
    parentSpaceLinks
      ?.map((link: any) => link.spaces)
      .filter(
        (space: any): space is { id: string; name: string; space_type?: string | null } => space !== null && space !== undefined,
      ) ?? []

  const parentSpaceById = new Map(parentSpaces.map((space) => [space.id, space]))

  const [workspaceItemsResult, inheritedItemsResult] = await Promise.all([
    getWorkspaceItems(workspaceId, { inheritance: "local" }),
    getInheritedItems(workspaceId),
  ])

  const localWorkspaceItems = workspaceItemsResult.data ?? []
  const inheritedItems = inheritedItemsResult.data ?? []

  const isPlaceholderSummary = (text?: string | null) => {
    if (!text) return false
    return text.trimStart().toLowerCase().startsWith("see original file:")
  }

  const inheritedDocumentsNormalized = inheritedDocuments.map((doc: any) => {
    const metadata = (doc.metadata ?? {}) as Record<string, any>
    const originSpaceId = typeof metadata.sourceSpaceId === "string" ? metadata.sourceSpaceId : undefined
    const originSpace = originSpaceId ? parentSpaceById.get(originSpaceId) : undefined
    const summaryFromMetadata = typeof metadata.summary === "string" ? metadata.summary : undefined
    const summaryFromContent = typeof doc.content === "string" ? doc.content.slice(0, 280) : undefined
    const summary =
      !isPlaceholderSummary(summaryFromMetadata ?? undefined) && summaryFromMetadata
        ? summaryFromMetadata
        : !isPlaceholderSummary(summaryFromContent ?? undefined)
          ? summaryFromContent
          : undefined

    const metadataTypeRaw = typeof metadata.type === "string" ? metadata.type : undefined
    const metadataType = metadataTypeRaw?.toLowerCase() ?? ""
    const metadataSourceUrl =
      typeof metadata.sourceUrl === "string"
        ? metadata.sourceUrl
        : typeof metadata.source_url === "string"
          ? metadata.source_url
          : undefined
    const fallbackExternalUrl =
      typeof doc.url === "string" && !doc.url.startsWith("/") ? (doc.url as string) : undefined
    const sourcePageUrl = metadataSourceUrl || fallbackExternalUrl
    const isExternalHtmlDoc = metadataType.includes("html") && !!sourcePageUrl
    const sourceFileUrl =
      typeof metadata.sourceFileUrl === "string" && metadata.sourceFileUrl.length > 0
        ? (metadata.sourceFileUrl as string)
        : typeof doc.url === "string"
          ? (doc.url as string)
          : undefined
    const viewerUrl = isExternalHtmlDoc && sourcePageUrl ? sourcePageUrl : `/workspaces/${workspaceId}/documents/${doc.id}`

    return {
      id: doc.id,
      item_type: "document",
      classification: doc.classification ?? "public",
      created_at: doc.created_at,
      source_url: sourcePageUrl,
      payload: {
        title: doc.title || (metadata.sourceFileUrl as string | undefined) || "Inherited document",
        summary,
        file_url: isExternalHtmlDoc ? undefined : sourceFileUrl,
        source_url: sourcePageUrl,
        mime_type: metadataTypeRaw,
      },
      spaces: originSpace
        ? {
            id: originSpace.id,
            name: originSpace.name,
            space_type: originSpace.space_type ?? null,
          }
        : null,
      source_doc: {
        id: doc.id,
        title: doc.title || t("workspace.documents.list.viewDocument"),
        url: viewerUrl,
      },
    }
  })

  const inheritedNonDocumentItems = inheritedItems.filter((item: any) => item.item_type !== "document")

  const combinedInheritedItems = [...inheritedDocumentsNormalized, ...inheritedNonDocumentItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  // Fetch notes - handle gracefully if query fails due to RLS or other issues
  const { data: notesData, error: notesError } = await supabase
    .from("workspace_notes")
    .select(
      "id, workspace_id, content, include_in_ai_context, created_at, updated_at, created_by, author:profiles(id, full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (notesError) {
    console.error("[workspace-notes] Failed to load notes:", notesError)
    // Notes failure is less critical - log and continue with empty notes
    console.warn("[workspace-notes] Continuing with empty notes due to load failure")
  }

  const workspaceNotes: WorkspaceNote[] =
    notesData?.map((note: Record<string, any>) => {
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
  // Fetch comments - handle gracefully if query fails due to RLS or other issues
  const { data: commentsData, error: commentsError } = await supabase
    .from("workspace_comments")
    .select("id, workspace_id, workspace_item_id, content, created_at, created_by, author:profiles(id, full_name, email)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (commentsError) {
    console.error("[workspace-comments] Failed to load comments:", commentsError)
    // Check if this is due to workspace/space being deleted or access being revoked
    const { data: workspaceCheck } = await supabase
      .from("workspaces")
      .select("id, space_id")
      .eq("id", workspaceId)
      .single()
    
    if (!workspaceCheck) {
      // Workspace no longer exists - redirect to dashboard
      console.error("[workspace-comments] Workspace no longer exists, redirecting to dashboard")
      redirect("/dashboard")
    }

    // Verify space still exists and user has access
    const { data: spaceCheck } = await supabase
      .from("spaces")
      .select("id")
      .eq("id", workspaceCheck.space_id)
      .single()
    
    if (!spaceCheck) {
      // Parent space was deleted - redirect to dashboard
      console.error("[workspace-comments] Parent space was deleted, redirecting to dashboard")
      redirect("/dashboard")
    }

    // If we get here, comments just failed to load but workspace exists - continue with empty comments
    console.warn("[workspace-comments] Comments failed to load but workspace exists - continuing with empty comments")
  }

  const workspaceCommentsByItem =
    (commentsData as WorkspaceCommentRecord[] | null | undefined)?.reduce<Record<string, WorkspaceCommentRecord[]>>(
      (acc, comment) => {
        const list = acc[comment.workspace_item_id] ?? []
        list.push(comment)
        acc[comment.workspace_item_id] = list
        return acc
      },
      {},
    ) ?? {}

  return (
    <WorkspaceChatWrapper workspaceId={workspaceId} workspaceName={workspace.name} canManage={canManage}>
      <EvidenceRefreshListener />
      <Suspense fallback={null}>
        <WelcomeWorkspaceWrapper workspace={workspace} />
      </Suspense>
      <div className="flex min-h-screen flex-col overflow-x-hidden">
        <header className="sticky top-0 z-40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-4">
              {!isWorkspaceOnlyMember && (
                <Button variant="ghost" asChild>
                  <Link href={`/spaces/${workspaceWithSpace.spaces.id}`}>
                    <ArrowLeft className="mr-2 h-3 w-3" />
                    <span className="text-xs font-normal">
                      {t("workspace.navigation.backToSpace")} {workspaceWithSpace.spaces.name}
                    </span>
                  </Link>
                </Button>
              )}
              {isWorkspaceOnlyMember && (
                <Button variant="ghost" asChild>
                  <Link href="/dashboard">
                    <ArrowLeft className="mr-2 h-3 w-3" />
                    <span className="text-xs font-normal">{t("workspace.navigation.backToDashboard")}</span>
                  </Link>
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {userSpaceRole && (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
                  {userSpaceRole}
                </span>
              )}
              {isWorkspaceOnlyMember && workspaceMembership && (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
                  {workspaceMembership.role}
                </span>
              )}
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="flex-1 bg-white">
          <div className="container mx-auto py-8 px-8">
            <div className="mb-8">
              <WorkspaceOverview
                workspaceId={workspaceId}
                initialName={workspace.name}
                initialSummary={workspace.summary}
                initialDescription={workspace.description}
                initialContext={workspace.context}
                initialLocation={workspace.location}
                parentSpaces={parentSpaces}
                canManage={canManage}
                canAccessSettings={canAccessSettings}
              />
            </div>

            <div className="mb-8 grid gap-6 sm:grid-cols-3">
              <Card className="shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{t("workspace.metrics.documents.title")}</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalDocumentsCount}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("workspace.metrics.documents.uploaded")} {uploadedDocumentCount} •{" "}
                    {t("workspace.metrics.documents.created")} {createdDocumentCount} •{" "}
                    {t("workspace.metrics.documents.inherited")} {inheritedDocumentCount}
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{t("workspace.metrics.sources.title")}</CardTitle>
                  <Plug className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{sourcesArray.length}</div>
                  <p className="text-xs text-muted-foreground">{t("workspace.metrics.sources.subtitle")}</p>
                </CardContent>
              </Card>
              <Card className="shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{t("workspace.metrics.conversations.title")}</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{conversationCount || 0}</div>
                  <p className="text-xs text-muted-foreground">{t("workspace.metrics.conversations.subtitle")}</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-8">
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-xl font-semibold text-foreground">{t("workspace.sections.myDocuments.title")}</h2>
                    <span className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
                      ({createdDocuments.length})
                    </span>
                  </div>
                  {canManage && (
                    <CreateWorkspaceDocumentDialog
                      workspaceId={workspaceId}
                      trigger={
                        <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          {t("workspace.sections.myDocuments.create")}
                        </Button>
                      }
                    />
                  )}
                </div>
                <MyDocumentsList 
                  workspaceId={workspaceId} 
                  initialDocuments={createdDocuments} 
                  showHeader={false}
                  canManage={canManage}
                />
              </div>

              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-foreground">{t("workspace.sections.knowledge.title")}</h2>
                <Tabs defaultValue="sources" className="space-y-8">
                  <TabsList className="grid w-full max-w-2xl grid-cols-4">
                    <TabsTrigger value="sources">
                      {t("workspace.tabs.sources")} <span className="font-normal">({uploadedDocuments.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="inherited">
                      {t("workspace.tabs.inherited")} <span className="font-normal">({combinedInheritedItems.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="evidence">
                      {t("workspace.tabs.evidence")} <span className="font-normal">({localWorkspaceItems.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="notes">
                      {t("workspace.tabs.notes")}{" "}
                      <WorkspaceNotesCount
                        workspaceId={workspaceId}
                        initialCount={workspaceNotes.length}
                        className="font-normal"
                      />
                    </TabsTrigger>
                  </TabsList>

                <TabsContent value="sources" className="space-y-5">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-lg font-semibold">{t("workspace.sections.sources.title")}</h3>
                      <span className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
                        ({uploadedDocuments.length})
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("workspace.sections.sources.description")}
                    </p>
                  </div>
                  <DocumentsList 
                    workspaceId={workspaceId} 
                    initialDocuments={uploadedDocuments} 
                    initialArchivedCount={archivedDocCount}
                    sources={sourcesArray}
                    canManage={canManage}
                  />
                </TabsContent>

                <TabsContent value="inherited" className="space-y-5">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">{t("workspace.sections.inherited.title")}</h3>
                      <p className="text-sm text-muted-foreground">{t("workspace.sections.inherited.description")}</p>
                    </div>
                    <WorkspaceInheritedItems items={combinedInheritedItems} />
                  </div>
                </TabsContent>

                <TabsContent value="evidence" className="space-y-8">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">{t("workspace.sections.evidence.title")}</h3>
                      <p className="text-sm text-muted-foreground">{t("workspace.sections.evidence.description")}</p>
                    </div>
                    <WorkspaceEvidenceBoard
                      workspaceId={workspaceId}
                      currentUserId={user.id}
                      initialItems={localWorkspaceItems}
                      initialComments={workspaceCommentsByItem}
                      parentSpaces={parentSpaces}
                      canManage={canManage}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="space-y-5">
                  <WorkspaceNotesPanel
                    workspaceId={workspaceId}
                    currentUserId={user.id}
                    initialNotes={workspaceNotes}
                    canManage={canManage}
                  />
                </TabsContent>
              </Tabs>
              </div>
            </div>
          </div>
        </main>
      </div>
    </WorkspaceChatWrapper>
  )
}
