import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserSpaces } from "@/lib/actions/space"
import { CreateSpaceDialog } from "@/components/create-space-dialog"
import { UserMenu } from "@/components/user-menu"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Layers2, FolderKanban } from "lucide-react"
import { WelcomeUserDialog } from "@/components/welcome-user-dialog"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: spaces } = await getUserSpaces()
  
  // Get user's space memberships to filter out workspaces where user is also a space member
  const { data: spaceMemberships } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("user_id", user.id)
  
  const userSpaceIds = new Set(spaceMemberships?.map(sm => sm.space_id) ?? [])
  
  // Fetch workspaces where user is a direct member
  const { data: allWorkspaceMemberships, error: workspaceError } = await supabase
    .from("workspace_members")
    .select(`
      role,
      workspace:workspaces(
        id,
        name,
        description,
        space_id
      )
    `)
    .eq("user_id", user.id)
  
  if (workspaceError) {
    console.error("[Dashboard] Error fetching workspace memberships:", workspaceError)
  }
  
  // Filter to only show workspaces where user is NOT a member of the parent space
  const directWorkspaces = allWorkspaceMemberships?.filter((membership: any) => {
    const workspace = Array.isArray(membership.workspace) 
      ? membership.workspace[0] 
      : membership.workspace
    return workspace && !userSpaceIds.has(workspace.space_id)
  }) ?? []
  
  const hasSpaces = Boolean(spaces && spaces.length > 0)
  const hasDirectWorkspaces = Boolean(directWorkspaces && directWorkspaces.length > 0)
  const displayName =
    (user.user_metadata as Record<string, any> | null | undefined)?.full_name ??
    (user.user_metadata as Record<string, any> | null | undefined)?.name ??
    user.email?.split("@")[0] ??
    null

  return (
    <div className="flex min-h-screen flex-col">
      <WelcomeUserDialog userId={user.id} userName={displayName} hasSpaces={hasSpaces} hasWorkspaces={hasDirectWorkspaces} />
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div></div>
          <div className="flex items-center gap-4">
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto py-8 px-4">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Spaces</h2>
              <p className="text-sm text-muted-foreground">Define the initiative that your workspaces execute within</p>
            </div>
            <CreateSpaceDialog />
          </div>

          {spaces && spaces.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {spaces.map((space: any) => (
                <Link key={space.id} href={`/spaces/${space.id}`}>
                  <Card className="transition-all hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Layers2 className="h-5 w-5 text-primary" />
                          <div>
                            <CardTitle className="mt-0">{space.name}</CardTitle>
                          </div>
                        </div>
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                          {space.role}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {space.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {space.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers2 className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">No spaces yet</h3>
                <p className="mb-4 text-center text-sm text-muted-foreground">
                Create your first space to define and organize the scope of your initiative.
                </p>
                <CreateSpaceDialog />
              </CardContent>
            </Card>
          )}
          
          {/* Direct Workspace Memberships Section */}
          {hasDirectWorkspaces && (
            <div className="mt-12">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold">My Workspaces</h2>
                <p className="text-sm text-muted-foreground">
                  Workspaces you've been invited to directly
                </p>
              </div>
              
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {directWorkspaces?.map((membership: any) => {
                  const workspace = Array.isArray(membership.workspace) 
                    ? membership.workspace[0] 
                    : membership.workspace
                  
                  if (!workspace) return null
                  
                  return (
                    <Link key={workspace.id} href={`/workspaces/${workspace.id}`}>
                      <Card className="transition-all hover:shadow-md">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <FolderKanban className="h-5 w-5 text-primary" />
                              <div>
                                <CardTitle className="mt-0">{workspace.name}</CardTitle>
                              </div>
                            </div>
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                              {membership.role}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {workspace.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {workspace.description}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
