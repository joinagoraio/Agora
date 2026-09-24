import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PlatformDemoPacks } from "@/components/platform-demo-packs"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { getServerTranslator } from "@/lib/i18n/server"

export default async function DemoPacksPage() {
  const { t } = await getServerTranslator()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  if (!(await isSuperAdmin(user.id))) redirect("/dashboard")

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <Button variant="ghost" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-3 w-3" />
              {t("admin.platform.back")}
            </Link>
          </Button>
          <UserMenu />
        </div>
      </header>
      <main className="flex-1 bg-white">
        <div className="container mx-auto max-w-5xl px-8 py-8">
          <PlatformDemoPacks />
        </div>
      </main>
    </div>
  )
}
