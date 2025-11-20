import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { acceptWorkspaceInvitation } from "@/lib/actions/workspace-invitation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default async function WorkspaceInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/sign-up?redirect=/workspace-invite/${token}`)
  }

  const { data: invitation } = await supabase
    .from("workspace_invitations")
    .select("*, workspaces(name, id)")
    .eq("token", token)
    .eq("status", "pending")
    .single()

  if (!invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>This workspace invitation link is invalid or has expired.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const result = await acceptWorkspaceInvitation(token)

  if (result.error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{result.error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  redirect(`/workspaces/${result.workspaceId}`)
}

