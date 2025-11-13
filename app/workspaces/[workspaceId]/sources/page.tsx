import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getSourcesByWorkspace } from "@/lib/actions/source"
import { CreateSourceDialog } from "@/components/create-source-dialog"
import { SourceCard } from "@/components/source-card"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { Plug, ArrowLeft } from "lucide-react"

export default async function SourcesPage({
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

  // Get sources
  const { data: sources } = await getSourcesByWorkspace(workspaceId)

  // Filter out direct_upload sources - they shouldn't be displayed on the sources page
  const displaySources = (sources || []).filter((source) => source.type !== "direct_upload")

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href={`/workspaces/${workspaceId}`}>
                <ArrowLeft className="mr-2 h-3 w-3" />
                <span className="text-xs font-normal">Back to {workspace.name}</span>
              </Link>
            </Button>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto py-8 px-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold">{workspace.name} Sources</h2>
              <p className="text-sm text-muted-foreground">Connect external sources to sync documents</p>
            </div>
            <CreateSourceDialog workspaceId={workspaceId} existingSources={displaySources} />
          </div>

          {displaySources && displaySources.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {displaySources.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Plug className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">No sources yet</h3>
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  Add your first source to start syncing documents
                </p>
                <CreateSourceDialog workspaceId={workspaceId} existingSources={displaySources} />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}

