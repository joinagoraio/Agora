"use client"

import { useEffect, useState, useTransition } from "react"
import { Bot, PencilLine, Plus, Settings } from "lucide-react"

import { SpaceAgentAdmin } from "@/components/space-agent-admin"
import { SpaceLlmSettings } from "@/components/space-llm-settings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SectionOpenToggle, useSectionOpen } from "@/components/section-open-toggle"
import { ViewModeToggle, useCollectionViewMode } from "@/components/view-mode-toggle"
import { cn, matchesTextSearch } from "@/lib/utils"
import { listSpaceAgents, seedDefaultSpaceAgents } from "@/lib/actions/agent"
import { useI18n } from "@/lib/i18n/use-i18n"
import { notify, notifyResult } from "@/lib/notify"
import { hasAllDefaultSpaceAgents, type AgentRecord, type AgentVersionRecord } from "@/lib/programme/domain"

type AgentRow = AgentRecord & { latestVersion: AgentVersionRecord | null }

type Props = {
  spaceId: string
  tenantId: string
  compact?: boolean
  initialAgents?: AgentRow[]
  searchQuery?: string
}

export function SpaceAgentsPanel({
  spaceId,
  tenantId,
  compact = false,
  initialAgents = [],
  searchQuery = "",
}: Props) {
  const { t } = useI18n()
  const [agents, setAgents] = useState<AgentRow[]>(initialAgents)
  const [pending, startTransition] = useTransition()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [modelsOpen, setModelsOpen] = useState(false)
  const searching = searchQuery.trim().length > 0
  const visibleAgents = agents.filter((agent) =>
    matchesTextSearch(
      searchQuery,
      agent.name,
      agent.role,
      agent.latestVersion?.instructions,
      agent.latestVersion?.model,
      agent.latestVersion?.provider,
    ),
  )
  const { viewMode, setViewMode } = useCollectionViewMode(visibleAgents.length, `space.${spaceId}.agents`)
  const { open, toggle } = useSectionOpen(`space.${spaceId}.agents`, false)
  const listOpen = compact || searching || open

  const refresh = () => {
    startTransition(async () => {
      const listed = await listSpaceAgents(spaceId)
      if (listed.error) {
        notify(listed.error, "error")
        return
      }
      setAgents(listed.data)
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId])

  const openCreate = () => {
    setEditingId(null)
    setEditorOpen(true)
  }

  const openEdit = (agentId: string) => {
    setEditingId(agentId)
    setEditorOpen(true)
  }

  const purposeOf = (agent: AgentRow) =>
    agent.role?.trim() || agent.latestVersion?.instructions?.trim() || t("space.agents.purposeFallback")

  const modelOf = (agent: AgentRow) => agent.latestVersion?.model || t("space.agents.modelUnknown")

  return (
    <div className={compact ? "space-y-4" : cn("flex min-h-0 flex-col overflow-hidden", listOpen ? "flex-1" : "shrink-0")}>
      <div className={cn("flex shrink-0 flex-wrap items-center justify-between gap-3", listOpen && "mb-4")}>
        <div>
          <div className="flex items-center gap-1">
            {compact ? null : (
              <SectionOpenToggle open={listOpen} onToggle={toggle} label={t("space.agents.sectionTitle")} />
            )}
            <div className="flex items-baseline gap-2">
              <h3 className="text-xl font-semibold text-foreground">{t("space.agents.sectionTitle")}</h3>
              <span className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
                ({searching ? visibleAgents.length : agents.length})
              </span>
            </div>
          </div>
          {listOpen ? (
            <p className="text-sm text-muted-foreground">{t("space.agents.sectionHint")}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!compact && listOpen && visibleAgents.length > 0 ? (
            <ViewModeToggle
              viewMode={viewMode}
              onChange={setViewMode}
              listLabel={t("space.workspaces.viewList")}
              gridLabel={t("space.workspaces.viewGrid")}
            />
          ) : null}
          {hasAllDefaultSpaceAgents(agents) ? null : (
            <Button variant="outline" disabled={pending} onClick={() =>
              startTransition(async () => {
                const result = await seedDefaultSpaceAgents(spaceId)
                notifyResult(
                  result.error,
                  t("space.agents.seeded", undefined, { count: String(result.data?.createdCount ?? 0) }),
                )
                refresh()
              })
            }>
              {t("space.agents.seedDefaults")}
            </Button>
          )}
          {compact ? null : (
            <Button variant="outline" onClick={() => setModelsOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              {t("space.agents.modelsTitle")}
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t("space.agents.add")}
          </Button>
        </div>
      </div>

      {listOpen ? visibleAgents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Bot className="h-10 w-10 text-muted-foreground" />
            <div>
              <h4 className="text-base font-semibold text-foreground">
                {searching ? t("space.search.noResults") : t("space.agents.emptyTitle")}
              </h4>
              {searching ? null : (
                <p className="text-sm text-muted-foreground">{t("space.agents.emptyDescription")}</p>
              )}
            </div>
            {searching ? null : (
              <Button variant="outline" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                {t("space.agents.add")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : compact || viewMode === "grid" ? (
        <div className={compact ? "" : "scrollbar-on-hover min-h-0 max-h-full overflow-y-auto"}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleAgents.map((agent) => (
              <Card key={agent.id} className="group flex h-full flex-col transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg font-semibold">{agent.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
                      onClick={() => openEdit(agent.id)}
                    >
                      <PencilLine className="h-4 w-4" />
                      <span className="sr-only">{t("space.agents.edit")}</span>
                    </Button>
                  </div>
                  <CardDescription>{modelOf(agent)}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-3">
                  <p className="line-clamp-4 text-sm text-muted-foreground">{purposeOf(agent)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("space.agents.latest", undefined, {
                      version: String(agent.latestVersion?.version ?? "—"),
                      provider: agent.latestVersion?.provider || "—",
                      model: agent.latestVersion?.model || "—",
                    })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Card className="scrollbar-on-hover min-h-0 max-h-full overflow-y-auto py-0 shadow">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {visibleAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,2fr)] items-center gap-4 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50"
                  onClick={() => openEdit(agent.id)}
                >
                  <span className="truncate font-medium">{agent.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{modelOf(agent)}</span>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{purposeOf(agent)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {compact ? (
        <div className="pt-2">
          <SpaceLlmSettings spaceId={spaceId} compact />
        </div>
      ) : (
        <Dialog open={modelsOpen} onOpenChange={setModelsOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("space.agents.modelsTitle")}</DialogTitle>
              <DialogDescription>{t("space.agents.sectionHint")}</DialogDescription>
            </DialogHeader>
            <SpaceLlmSettings spaceId={spaceId} hideHeading />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? t("space.agents.editTitle") : t("space.agents.add")}</DialogTitle>
            <DialogDescription>{t("space.agents.editDescription")}</DialogDescription>
          </DialogHeader>
          <SpaceAgentAdmin
            spaceId={spaceId}
            tenantId={tenantId}
            canManage
            variant="dialog"
            agentId={editingId}
            onSaved={(options) => {
              if (options?.close !== false) setEditorOpen(false)
              refresh()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
