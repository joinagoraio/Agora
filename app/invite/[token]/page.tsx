import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { acceptInvitation } from "@/lib/actions/invitation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If not logged in, redirect to signup with return URL
  if (!user) {
    redirect(`/auth/sign-up?redirect=/invite/${token}`)
  }

  // Get invitation details
  const { data: invitation } = await supabase
    .from("invitations")
    .select("*, spaces(name)")
    .eq("token", token)
    .eq("status", "pending")
    .single()

  if (!invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>This invitation link is invalid or has expired.</CardDescription>
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

  // Auto-accept invitation
  const result = await acceptInvitation(token)

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

  // Redirect to space
  redirect(`/spaces/${result.spaceId}`)
}
