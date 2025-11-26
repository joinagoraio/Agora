"use client"

import Link from "next/link"

import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Layers, Plus } from "lucide-react"
import { useI18n } from "@/lib/i18n/use-i18n"

export type SpaceWorkspace = {
  id: string
  name: string
  description?: string | null
  created_at: string
}

interface SpaceWorkspaceListProps {
  spaceId: string
  workspaces: SpaceWorkspace[]
  canCreate: boolean
  spaceName: string
}

export function SpaceWorkspaceList({ spaceId, workspaces, canCreate, spaceName }: SpaceWorkspaceListProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-foreground">{t("space.workspaces.title")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("space.workspaces.subtitle", undefined, { space: spaceName })}
          </p>
        </div>
        {canCreate && (
          <CreateWorkspaceDialog
            spaceId={spaceId}
            trigger={
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("space.workspaces.newWorkspace")}
              </Button>
            }
          />
        )}
      </div>

      {workspaces.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Layers className="h-10 w-10 text-muted-foreground" />
            <div>
              <h4 className="text-base font-semibold text-foreground">{t("space.workspaces.emptyTitle")}</h4>
              <p className="text-sm text-muted-foreground">
                {t("space.workspaces.emptyDescription")}
              </p>
            </div>
            {canCreate && (
              <CreateWorkspaceDialog
                spaceId={spaceId}
                trigger={
                  <Button variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("space.workspaces.newWorkspace")}
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((workspace) => (
            <Card key={workspace.id} className="flex h-full flex-col transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  <Link href={`/workspaces/${workspace.id}`} className="hover:underline">
                    {workspace.name}
                  </Link>
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  {t("space.workspaces.createdLabel", undefined, {
                    date: new Date(workspace.created_at).toLocaleDateString(),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <p className="text-sm text-muted-foreground line-clamp-4">
                  {workspace.description || t("space.workspaces.descriptionFallback")}
                </p>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{t("space.workspaces.inheritsScope")}</Badge>
                  <Button variant="ghost" size="sm" asChild className="px-2 text-primary hover:text-primary">
                    <Link href={`/workspaces/${workspace.id}`}>{t("space.workspaces.goToWorkspace")}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
