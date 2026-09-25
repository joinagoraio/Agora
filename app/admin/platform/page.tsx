import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PlatformLlmAdmin } from "@/components/platform-llm-admin"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { getServerTranslator } from "@/lib/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getLoadedDemo } from "@/lib/actions/demo-pack"
import { DemoTourMount } from "@/components/demo-tour-mount"

export default async function PlatformAdminPage({ searchParams }: { searchParams: Promise<{ tourProgramme?: string }> }) {
  const { tourProgramme } = await searchParams
  const { t } = await getServerTranslator()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  if (!(await isSuperAdmin(user.id))) redirect("/dashboard")

  const admin = createAdminClient()
  const { data: tourWorkspace } = tourProgramme
    ? await admin.from("workspaces").select("space_id").eq("id", tourProgramme).maybeSingle()
    : { data: null }
  const { data: loadedDemo } = tourWorkspace?.space_id ? await getLoadedDemo(tourWorkspace.space_id as string) : { data: null }

  return (
    <DemoTourMount demo={loadedDemo} tourProgramme={tourProgramme}>
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
        <div className="container mx-auto max-w-6xl px-8 py-8">
          <PlatformLlmAdmin />
        </div>
      </main>
    </div>
    </DemoTourMount>
  )
}
