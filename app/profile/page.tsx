import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, User, Mail, Calendar } from "lucide-react"

import { Button } from "@/components/ui/button"
import { UserMenu } from "@/components/user-menu"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { getServerTranslator } from "@/lib/i18n/server"

export default async function ProfilePage() {
  const { t, language } = await getServerTranslator()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get user name from metadata or email
  const userName = user.user_metadata?.full_name || 
                   user.user_metadata?.name || 
                   user.email?.split("@")[0] || 
                   "User"

  const dateLocale = language === "nl" ? "nl-NL" : "en-US"
  const localizedCreatedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString(dateLocale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—"

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-3 w-3" />
                <span className="text-xs font-normal">{t("profile.backToDashboard")}</span>
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto max-w-4xl py-8 px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">{t("profile.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("profile.subtitle")}</p>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("profile.account.title")}</CardTitle>
                <CardDescription>{t("profile.account.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t("profile.account.nameLabel")}</p>
                    <p className="text-sm text-muted-foreground">{userName}</p>
                  </div>
                </div>
                {user.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{t("profile.account.emailLabel")}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t("profile.account.memberSinceLabel")}</p>
                    <p className="text-sm text-muted-foreground">{localizedCreatedDate}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("profile.accountId.title")}</CardTitle>
                <CardDescription>{t("profile.accountId.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-mono text-muted-foreground break-all">{user.id}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
