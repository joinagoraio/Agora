import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserSpaces } from "@/lib/actions/space"
import { CreateSpaceDialog } from "@/components/create-space-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Building2, Users } from "lucide-react"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: spaces } = await getUserSpaces()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            <h1 className="text-xl font-bold">AGORA</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <form action="/auth/sign-out" method="post">
              <Button variant="outline" type="submit">
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 bg-muted/20">
        <div className="container py-8 px-4">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold">Your Spaces</h2>
              <p className="text-muted-foreground">Select a space to get started or create a new one</p>
            </div>
            <CreateSpaceDialog />
          </div>

          {spaces && spaces.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {spaces.map((space: any) => (
                <Link key={space.id} href={`/spaces/${space.id}`}>
                  <Card className="transition-all hover:border-primary hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <Building2 className="h-8 w-8 text-primary" />
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                          {space.role}
                        </span>
                      </div>
                      <CardTitle className="mt-4">{space.name}</CardTitle>
                      <CardDescription>/{space.slug}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>Team space</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">No spaces yet</h3>
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  Create your first space to start organizing your documents and conversations.
                </p>
                <CreateSpaceDialog />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
