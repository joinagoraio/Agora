import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getWorkspacesBySpace } from "@/lib/actions/workspace"
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Layers, Settings, ArrowLeft } from "lucide-react"

export default async function SpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get space details
  const { data: space } = await supabase.from("spaces").select("*").eq("id", spaceId).single()

  if (!space) {
    redirect("/dashboard")
  }

  // Get user's role in this space
  const { data: membership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .single()

  // Get workspaces
  const { data: workspaces } = await getWorkspacesBySpace(spaceId)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                <span className="text-sm font-normal">Back to Dashboard</span>
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {membership?.role}
            </span>
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/spaces/${spaceId}/settings`}>
                <Settings className="h-5 w-5" />
              </Link>
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto py-8 px-4">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">{space.name} Workspaces</h2>
              <p className="text-sm text-muted-foreground">Organize your documents and conversations by topic</p>
            </div>
            <CreateWorkspaceDialog spaceId={spaceId} />
          </div>

          {workspaces && workspaces.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {workspaces.map((workspace) => (
                <Link key={workspace.id} href={`/workspaces/${workspace.id}`}>
                  <Card className="transition-all hover:shadow-md">
                    <CardHeader>
                      <Layers className="h-8 w-8 text-primary" />
                      <CardTitle className="mt-4">{workspace.name}</CardTitle>
                      {workspace.description && <CardDescription>{workspace.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(workspace.created_at).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">No workspaces yet</h3>
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  Create your first workspace to start adding documents and having conversations.
                </p>
                <CreateWorkspaceDialog spaceId={spaceId} />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
