import { redirect } from "next/navigation"
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { getSourcesByWorkspace } from "@/lib/actions/source"
import { getWorkspaceDocuments } from "@/lib/actions/document"
import {
  DocumentsList,
  MyDocumentsList,
  UploadDocumentDialog,
  AddFromSourceDialog,
  WorkspaceEvidenceBoard,
  WorkspaceInheritedItems,
  WorkspaceNotesPanel,
} from "@/components/workspace-page-client"
import { WorkspaceChatWrapper } from "@/components/workspace-chat-wrapper"
import { WelcomeWorkspaceWrapper } from "@/components/welcome-workspace-wrapper"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { FileText, Plug, Upload, Plus, MessageSquare, Settings, Info, ArrowLeft } from "lucide-react"
import { getWorkspaceItems } from "@/lib/actions/workspace-item"
import { getInheritedItems } from "@/lib/actions/workspace-space-link"

function titleCase(value: string | null | undefined) {
  if (!value) {
    return ""
  }

  return value
    .toString()
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((word) => (word ? word[0]?.toUpperCase() + word.slice(1) : ""))
    .join(" ")
}

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

  // Create workspace object with space attached for compatibility
  const workspaceWithSpace = {
    ...workspace,
    spaces: space,
  }

  // Get sources
  const { data: sources } = await getSourcesByWorkspace(workspaceId)

  // Filter out direct_upload sources to get available sources for adding documents
  const availableSources = (sources || []).filter((source) => source.type !== "direct_upload")

  // Get documents
  const { data: documents } = await getWorkspaceDocuments(workspaceId)
  const documentsList = documents || []
  const createdDocuments = documentsList.filter((doc: any) => doc?.sources?.type === "workspace_generated")
  const uploadedDocuments = documentsList.filter((doc: any) => doc?.sources?.type !== "workspace_generated")

  // Get document count (excluding archived and deleted)
  const { count: documentCount } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted")
    .neq("status", "archived")

  const uploadedDocumentCount = uploadedDocuments.length
  const createdDocumentCount = createdDocuments.length
  const totalDocumentsCount =
    typeof documentCount === "number" ? documentCount : uploadedDocumentCount + createdDocumentCount

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

  const [workspaceItemsResult, inheritedItemsResult] = await Promise.all([
    getWorkspaceItems(workspaceId, { inheritance: "local" }),
    getInheritedItems(workspaceId),
  ])

  const localWorkspaceItems = workspaceItemsResult.data ?? []
  const inheritedItems = inheritedItemsResult.data ?? []
  const { data: notesData, error: notesError } = await supabase
    .from("workspace_notes")
    .select("id, workspace_id, content, created_at, updated_at, created_by, author:profiles(id, full_name, email)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (notesError) {
    console.error("[workspace-notes] Failed to load notes:", notesError)
  }

  const workspaceNotes = notesData ?? []
  const { data: commentsData, error: commentsError } = await supabase
    .from("workspace_comments")
    .select("id, workspace_id, workspace_item_id, content, created_at, created_by, author:profiles(id, full_name, email)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (commentsError) {
    console.error("[workspace-comments] Failed to load comments:", commentsError)
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
    <WorkspaceChatWrapper workspaceId={workspaceId} workspaceName={workspace.name}>
      <Suspense fallback={null}>
        <WelcomeWorkspaceWrapper workspace={workspace} />
      </Suspense>
      <div className="flex min-h-screen flex-col overflow-x-hidden">
        <header className="sticky top-0 z-40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" asChild>
                <Link href={`/spaces/${workspaceWithSpace.spaces.id}`}>
                  <ArrowLeft className="mr-2 h-3 w-3" />
                  <span className="text-xs font-normal">Back to {workspaceWithSpace.spaces.name}</span>
                </Link>
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild title="Properties">
                <Link href={`/workspaces/${workspaceId}/properties`}>
                  <Info className="h-5 w-5" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild title="Sources">
                <Link href={`/workspaces/${workspaceId}/sources`}>
                  <Plug className="h-5 w-5" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild title="Settings">
                <Link href={`/workspaces/${workspaceId}/settings`}>
                  <Settings className="h-5 w-5" />
                </Link>
              </Button>
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="flex-1 bg-white">
          <div className="container mx-auto py-8 px-4">
            <div className="mb-8">
              <h1 className="text-2xl font-semibold">{workspace.name}</h1>
              {parentSpaces.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {parentSpaces.map((parent) => (
                    <Badge key={parent.id} variant="outline">
                      {parent.name}
                      {parent.space_type ? ` · ${titleCase(parent.space_type)}` : ""}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="mb-8 grid gap-6 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Documents</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                <div className="text-2xl font-bold">{totalDocumentsCount}</div>
                <p className="text-xs text-muted-foreground">
                  Uploaded {uploadedDocumentCount} • Created {createdDocumentCount}
                </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Sources</CardTitle>
                  <Plug className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{sources?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">Active connections</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Conversations</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{conversationCount || 0}</div>
                  <p className="text-xs text-muted-foreground">Your chats</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-10">
              <MyDocumentsList workspaceId={workspaceId} initialDocuments={createdDocuments} />
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Uploaded Documents</h2>
                    <p className="text-sm text-muted-foreground">
                      View and search all files and sources synced into this workspace
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {availableSources.length === 0 ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/workspaces/${workspaceId}/sources`}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add Source
                        </Link>
                      </Button>
                    ) : (
                      <AddFromSourceDialog
                        workspaceId={workspaceId}
                        sources={sources || []}
                        trigger={
                          <Button variant="outline" size="sm">
                            <Plus className="mr-2 h-4 w-4" />
                            Add from Source
                          </Button>
                        }
                      />
                    )}
                    <UploadDocumentDialog
                      workspaceId={workspaceId}
                      trigger={
                        <Button size="sm">
                          <Upload className="mr-2 h-4 w-4" />
                          Upload
                        </Button>
                      }
                    />
                  </div>
                </div>
                <DocumentsList workspaceId={workspaceId} initialDocuments={uploadedDocuments} sources={sources || []} />
              </div>
              <section className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold">Workspace Intelligence</h2>
                  <p className="text-sm text-muted-foreground">
                    Review saved evidence and public material inherited from parent spaces.
                  </p>
                </div>
                <Tabs defaultValue="evidence" className="w-full">
                  <TabsList className="grid w-full max-w-2xl grid-cols-3">
                    <TabsTrigger value="evidence">Workspace Evidence</TabsTrigger>
                    <TabsTrigger value="inherited">Inherited Items</TabsTrigger>
                    <TabsTrigger value="notes">Notes</TabsTrigger>
                  </TabsList>
                  <TabsContent value="evidence" className="mt-6">
                    <WorkspaceEvidenceBoard
                      workspaceId={workspaceId}
                      currentUserId={user.id}
                      initialItems={localWorkspaceItems}
                      initialComments={workspaceCommentsByItem}
                      parentSpaces={parentSpaces}
                    />
                  </TabsContent>
                  <TabsContent value="inherited" className="mt-6">
                    <WorkspaceInheritedItems items={inheritedItems} />
                  </TabsContent>
                  <TabsContent value="notes" className="mt-6">
                    <WorkspaceNotesPanel
                      workspaceId={workspaceId}
                      currentUserId={user.id}
                      initialNotes={workspaceNotes}
                    />
                  </TabsContent>
                </Tabs>
              </section>
            </div>
          </div>
        </main>
      </div>
    </WorkspaceChatWrapper>
  )
}
