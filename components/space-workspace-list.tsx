"use client"

import Link from "next/link"

import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Layers, Plus } from "lucide-react"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  isEnvironmentalProgrammeWorkspace,
  workspaceHomeHref,
} from "@/lib/programme/domain"

export type SpaceWorkspace = {
  id: string
  name: string
  description?: string | null
  created_at: string
  kind?: string | null
  metadata?: Record<string, unknown> | null
  publicationId?: string | null
}

interface SpaceWorkspaceListProps {
  spaceId: string
  workspaces: SpaceWorkspace[]
  canCreate: boolean
  spaceName: string
}

export function SpaceWorkspaceList({ spaceId, workspaces, canCreate, spaceName }: SpaceWorkspaceListProps) {
  const { t } = useI18n()
  const programmes = workspaces.filter((workspace) => isEnvironmentalProgrammeWorkspace(workspace))
  const legacyResearch = workspaces.filter((workspace) => !isEnvironmentalProgrammeWorkspace(workspace))

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

      {programmes.length === 0 ? (
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
          {programmes.map((workspace) => {
            const href = workspaceHomeHref(workspace)
            return (
            <Card key={workspace.id} className="flex h-full flex-col transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  <Link href={href} className="hover:underline">
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
                <p className="text-xs text-muted-foreground">{t("space.workspaces.kindProgrammeHint")}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t("space.workspaces.kindProgramme")}</Badge>
                    {workspace.publicationId ? (
                      <Badge variant="outline" asChild>
                        <Link href={`/published/${workspace.publicationId}`}>
                          {t("space.workspaces.publishedBadge")}
                        </Link>
                      </Badge>
                    ) : null}
                  </span>
                  <Button variant="ghost" size="sm" asChild className="px-2 text-primary hover:text-primary">
                    <Link href={href}>{t("space.workspaces.goToWorkspace")}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}
      {legacyResearch.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("space.workspaces.legacyResearch", undefined, { count: String(legacyResearch.length) })}{" "}
          {legacyResearch.map((workspace, index) => (
            <span key={workspace.id}>
              {index > 0 ? ", " : ""}
              <Link href={workspaceHomeHref(workspace)} className="underline">
                {workspace.name}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
