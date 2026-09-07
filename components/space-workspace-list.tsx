"use client"

import Link from "next/link"
import { Layers, Plus } from "lucide-react"

import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog"
import { ProgrammeListMenu } from "@/components/programme-list-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useI18n } from "@/lib/i18n/use-i18n"
import { SectionOpenToggle, useSectionOpen } from "@/components/section-open-toggle"
import { ViewModeToggle, useCollectionViewMode } from "@/components/view-mode-toggle"
import { cn } from "@/lib/utils"
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
  created_by?: string | null
  canManageAccess?: boolean
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
  const { viewMode, setViewMode } = useCollectionViewMode(programmes.length, `space.${spaceId}.programmes`)
  const { open, toggle } = useSectionOpen(`space.${spaceId}.programmes`, true)

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden", open ? "flex-1" : "shrink-0")}>
      <div className={cn("flex shrink-0 flex-wrap items-center justify-between gap-3", open && "mb-4")}>
        <div>
          <div className="flex items-center gap-1">
            <SectionOpenToggle open={open} onToggle={toggle} label={t("space.workspaces.title")} />
            <div className="flex items-baseline gap-2">
              <h3 className="text-xl font-semibold text-foreground">{t("space.workspaces.title")}</h3>
              <span className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
                ({programmes.length})
              </span>
            </div>
          </div>
          {open ? (
            <p className="text-sm text-muted-foreground">
              {t("space.workspaces.subtitle", undefined, { space: spaceName })}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {open && programmes.length > 0 && (
            <ViewModeToggle
              viewMode={viewMode}
              onChange={setViewMode}
              listLabel={t("space.workspaces.viewList")}
              gridLabel={t("space.workspaces.viewGrid")}
            />
          )}
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
      </div>

      {open ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
      ) : viewMode === "grid" ? (
        <div className="scrollbar-on-hover min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {programmes.map((workspace) => {
            const href = workspaceHomeHref(workspace)
            return (
            <Card key={workspace.id} className="group relative flex h-full flex-col transition-shadow hover:shadow-md">
              <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100 max-md:opacity-100">
                <ProgrammeListMenu workspace={workspace} canManage={workspace.canManageAccess ?? canCreate} />
              </div>
              <Link href={href} className="flex min-h-0 flex-1 flex-col pr-10">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg font-semibold">{workspace.name}</CardTitle>
                    {workspace.publicationId ? (
                      <Badge variant="outline">{t("space.workspaces.publishedBadge")}</Badge>
                    ) : null}
                  </div>
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
                </CardContent>
              </Link>
            </Card>
            )
          })}
        </div>
        </div>
      ) : (
        <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow">
          <CardContent className="relative min-h-0 flex-1 overflow-hidden p-0">
            <ScrollArea type="hover" scrollHideDelay={0} className="h-full">
            <div className="divide-y divide-border">
              {programmes.map((workspace) => {
                const href = workspaceHomeHref(workspace)
                return (
                  <div
                    key={workspace.id}
                    className="group relative flex items-stretch transition-colors hover:bg-muted/50"
                  >
                    <Link
                      href={href}
                      className="grid min-w-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-4 px-4 py-3 text-sm"
                    >
                      <div className="min-w-0 font-medium text-foreground">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{workspace.name}</span>
                          {workspace.publicationId ? (
                            <Badge variant="outline" className="shrink-0">
                              {t("space.workspaces.publishedBadge")}
                            </Badge>
                          ) : null}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {t("space.workspaces.createdLabel", undefined, {
                            date: new Date(workspace.created_at).toLocaleDateString(),
                          })}
                        </div>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {workspace.description || t("space.workspaces.descriptionFallback")}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100 max-md:opacity-100">
                      <ProgrammeListMenu workspace={workspace} canManage={workspace.canManageAccess ?? canCreate} />
                    </div>
                  </div>
                )
              })}
            </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
      {legacyResearch.length > 0 && (
        <p className="mt-3 shrink-0 text-xs text-muted-foreground">
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
      ) : null}
    </div>
  )
}
