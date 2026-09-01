import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { UserMenu } from "@/components/user-menu"
import { ProfileEditor } from "@/components/profile-editor"
import { createClient } from "@/lib/supabase/server"
import { getServerTranslator } from "@/lib/i18n/server"
import { getOwnProfile } from "@/lib/actions/profile"

export default async function ProfilePage() {
  const { t, language } = await getServerTranslator()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await getOwnProfile()
  const userName =
    profile?.fullName ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    ""

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
          <Button variant="ghost" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-3 w-3" />
              <span className="text-xs font-normal">{t("profile.backToDashboard")}</span>
            </Link>
          </Button>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto max-w-2xl py-8 px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">{t("profile.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("profile.subtitle")}</p>
          </div>
          <ProfileEditor
            initialName={userName}
            email={user.email ?? null}
            avatarUrl={profile?.avatarUrl ?? user.user_metadata?.avatar_url ?? null}
            memberSince={localizedCreatedDate}
          />
        </div>
      </main>
    </div>
  )
}
