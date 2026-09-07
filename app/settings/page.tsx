import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { UserMenu } from "@/components/user-menu"
import { OrganizationSettings } from "@/components/organization-settings"
import { getPrimaryTenantForUser } from "@/lib/actions/tenant"
import { isTenantAdminRole } from "@/lib/tenant/domain"
import { getServerTranslator } from "@/lib/i18n/server"

export default async function SettingsPage() {
  const { t } = await getServerTranslator()
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const membership = await getPrimaryTenantForUser()
  if (!membership.data || !isTenantAdminRole(membership.data.role)) {
    redirect("/dashboard")
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">{t("admin.settings.title")}</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto max-w-4xl px-8 py-8">
          <OrganizationSettings
            tenant={{
              id: membership.data.tenantId,
              name: membership.data.tenant?.name ?? "Organisation",
            }}
          />
        </div>
      </main>
    </div>
  )
}
