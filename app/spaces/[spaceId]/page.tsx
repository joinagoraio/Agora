import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getWorkspacesBySpace } from "@/lib/actions/workspace"
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Building2, FolderOpen, ArrowLeft } from "lucide-react"

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
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              <div>
                <h1 className="text-xl font-bold">{space.name}</h1>
                <p className="text-xs text-muted-foreground">/{space.slug}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {membership?.role}
            </span>
            <Button variant="outline" asChild>
              <Link href={`/spaces/${spaceId}/settings`}>Settings</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 bg-muted/20">
        <div className="container py-8 px-4">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold">Workspaces</h2>
              <p className="text-muted-foreground">Organize your documents and conversations by topic</p>
            </div>
            <CreateWorkspaceDialog spaceId={spaceId} />
          </div>

          {workspaces && workspaces.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {workspaces.map((workspace) => (
                <Link key={workspace.id} href={`/workspaces/${workspace.id}`}>
                  <Card className="transition-all hover:border-primary hover:shadow-md">
                    <CardHeader>
                      <FolderOpen className="h-8 w-8 text-primary" />
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
                <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
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
