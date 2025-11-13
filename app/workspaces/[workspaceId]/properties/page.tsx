import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { WorkspaceProperties } from "@/components/workspace-properties"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function WorkspacePropertiesPage({
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
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">{workspace.name} Properties</h2>
            <p className="text-sm text-muted-foreground">
              Configure workspace context and location to improve AI search and understanding
            </p>
          </div>
          <WorkspaceProperties workspace={workspace} />
        </div>
      </main>
    </div>
  )
}
