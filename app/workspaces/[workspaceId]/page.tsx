import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getConnectorsByWorkspace } from "@/lib/actions/connector"
import { CreateConnectorDialog } from "@/components/create-connector-dialog"
import { ConnectorCard } from "@/components/connector-card"
import { DocumentSearch } from "@/components/document-search"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ArrowLeft, MessageSquare, FileText, Plug } from "lucide-react"

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

  // Get connectors
  const { data: connectors } = await getConnectorsByWorkspace(workspaceId)

  // Get document count
  const { count: documentCount } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)

  // Get conversation count
  const { count: conversationCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/spaces/${workspace.spaces.id}`}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold">{workspace.name}</h1>
              <p className="text-xs text-muted-foreground">{workspace.spaces.name}</p>
            </div>
          </div>
          <Button asChild>
            <Link href={`/workspaces/${workspaceId}/chat`}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Start Chat
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 bg-muted/20">
        <div className="container py-8 px-4">
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
                <CardTitle className="text-sm font-medium">Connectors</CardTitle>
                <Plug className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{connectors?.length || 0}</div>
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

          <Tabs defaultValue="connectors" className="space-y-6">
            <TabsList>
              <TabsTrigger value="connectors">Connectors</TabsTrigger>
              <TabsTrigger value="search">Search</TabsTrigger>
            </TabsList>

            <TabsContent value="connectors" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Document Connectors</h2>
                  <p className="text-muted-foreground">Connect external sources to sync documents</p>
                </div>
                <CreateConnectorDialog workspaceId={workspaceId} />
              </div>

              {connectors && connectors.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {connectors.map((connector) => (
                    <ConnectorCard key={connector.id} connector={connector} onUpdate={() => {}} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Plug className="mb-4 h-12 w-12 text-muted-foreground" />
                    <h3 className="mb-2 text-lg font-semibold">No connectors yet</h3>
                    <p className="mb-4 text-center text-sm text-muted-foreground">
                      Add your first connector to start syncing documents
                    </p>
                    <CreateConnectorDialog workspaceId={workspaceId} />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="search" className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Search Documents</h2>
                <p className="text-muted-foreground">Find documents across all your connected sources</p>
              </div>
              <DocumentSearch workspaceId={workspaceId} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
