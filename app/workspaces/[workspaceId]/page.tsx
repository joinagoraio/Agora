import { redirect } from "next/navigation"
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { getSourcesByWorkspace } from "@/lib/actions/source"
import { getWorkspaceDocuments } from "@/lib/actions/document"
import { DocumentsList } from "@/components/documents-list"
import { UploadDocumentDialog } from "@/components/upload-document-dialog"
import { AddFromSourceDialog } from "@/components/add-from-source-dialog"
import { WorkspaceChatWrapper } from "@/components/workspace-chat-wrapper"
import { WelcomeWorkspaceWrapper } from "@/components/welcome-workspace-wrapper"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { FileText, Plug, Upload, Plus, MessageSquare, Settings, Info, ArrowLeft } from "lucide-react"

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
  const { data: workspace } = await supabase.from("workspaces").select("*, spaces(*)").eq("id", workspaceId).single()

  if (!workspace) {
    redirect("/dashboard")
  }

  // Get sources
  const { data: sources } = await getSourcesByWorkspace(workspaceId)

  // Filter out direct_upload sources to get available sources for adding documents
  const availableSources = (sources || []).filter((source) => source.type !== "direct_upload")

  // Get documents
  const { data: documents } = await getWorkspaceDocuments(workspaceId)

  // Get document count (excluding archived and deleted)
  const { count: documentCount } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted")
    .neq("status", "archived")

  // Get conversation count
  const { count: conversationCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)

  return (
    <WorkspaceChatWrapper workspaceId={workspaceId} workspaceName={workspace.name}>
      <Suspense fallback={null}>
        <WelcomeWorkspaceWrapper workspace={workspace} />
      </Suspense>
      <div className="flex min-h-screen flex-col">
        <header className="bg-card">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" asChild>
                <Link href={`/spaces/${workspace.spaces.id}`}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  <span className="text-sm font-normal">Back to {workspace.spaces.name}</span>
                </Link>
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild>
                <Link href={`/workspaces/${workspaceId}/properties`}>
                  <Info className="h-5 w-5" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild>
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
            </div>
            <div className="mb-8 grid gap-6 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Documents</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{documentCount || 0}</div>
                  <p className="text-xs text-muted-foreground">Synced documents</p>
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

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">Documents</h2>
                  <p className="text-sm text-muted-foreground">View and search all documents in this workspace</p>
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
              <DocumentsList workspaceId={workspaceId} initialDocuments={documents || []} />
            </div>
          </div>
        </main>
      </div>
    </WorkspaceChatWrapper>
  )
}
