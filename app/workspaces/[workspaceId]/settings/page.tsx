import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { WorkspaceSettings } from "@/components/workspace-settings"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { getServerTranslator } from "@/lib/i18n/server"
import { getWorkspaceAccessSettings } from "@/lib/actions/workspace"

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const { t } = await getServerTranslator()
  const { data, error } = await getWorkspaceAccessSettings(workspaceId)

  if (error || !data) {
    redirect("/dashboard")
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href={`/workspaces/${workspaceId}/programme`}>
                <ArrowLeft className="mr-2 h-3 w-3" />
                <span className="text-xs font-normal">
                  {t("workspace.navigation.backToWorkspace", undefined, { name: data.workspace.name })}
                </span>
              </Link>
            </Button>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto max-w-4xl py-8 px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">{data.workspace.name} Settings</h1>
          </div>
          <WorkspaceSettings
            workspace={data.workspace}
            members={data.members}
            invitations={data.invitations}
            authorityCandidates={data.authorityCandidates}
            currentUserId={data.currentUserId}
          />
        </div>
      </main>
    </div>
  )
}
