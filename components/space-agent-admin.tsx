"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  createAgent,
  deleteAgent,
  deleteAgentVersion,
  listAgentVersions,
  listSpaceAgents,
  publishAgentVersion,
  rollbackAgentVersion,
  seedDefaultSpaceAgents,
  setAgentPermitted,
  updateAgentMeta,
} from "@/lib/actions/agent"
import { listAuthorityModels } from "@/lib/actions/tenant-llm"
import { notify, notifyResult } from "@/lib/notify"
import { cn } from "@/lib/utils"
import {
  AGENT_STAGES,
  agentHistoryVersionDeleteReason,
  hasAllDefaultSpaceAgents,
  isLatestAgentHistoryVersion,
  matchingAgentVersionNumber,
  type AgentRecord,
  type AgentStage,
  type AgentVersionRecord,
} from "@/lib/programme/domain"

type AgentRow = AgentRecord & { latestVersion: AgentVersionRecord | null }

type CatalogModel = {
  id: string
  providerId: string
  modelId: string
  label: string
}

type Props = {
  spaceId: string
  tenantId: string
  canManage?: boolean
  variant?: "page" | "dialog"
  agentId?: string | null
  onSaved?: (options?: { close?: boolean }) => void
}

export function SpaceAgentAdmin({
  spaceId,
  tenantId,
  canManage = true,
  variant = "page",
  agentId = null,
  onSaved,
}: Props) {
  const { t, language } = useI18n()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [versions, setVersions] = useState<AgentVersionRecord[]>([])
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingDeleteAgent, setConfirmingDeleteAgent] = useState(false)
  const [name, setName] = useState("")
  const [role, setRole] = useState("")
  const [stage, setStage] = useState<AgentStage>("draft")
  const [instructions, setInstructions] = useState("")
  const [qualityRules, setQualityRules] = useState("")
  const [catalogModelId, setCatalogModelId] = useState("")
  const [changelog, setChangelog] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const selectedModel = useMemo(
    () => catalogModels.find((model) => model.id === catalogModelId) ?? null,
    [catalogModelId, catalogModels],
  )
  const preview = useMemo(
    () => versions.find((version) => version.id === previewId) ?? null,
    [previewId, versions],
  )
  const dateLocale = language === "nl" ? "nl-NL" : "en-US"

  const refresh = () => {
    startTransition(async () => {
      const [listed, models] = await Promise.all([listSpaceAgents(spaceId), listAuthorityModels(spaceId)])
      if (listed.error) {
        setMessage(listed.error)
        return
      }
      setAgents(listed.data)
      if (models.error) {
        setMessage(models.error)
      }
      const mapped = (models.data || [])
        .map((row) => {
          const model = Array.isArray(row.llm_models) ? row.llm_models[0] : row.llm_models
          if (!model || typeof model !== "object") return null
          const record = model as { id: string; provider_id: string; model_id: string; label: string }
          return {
            id: record.id,
            providerId: record.provider_id,
            modelId: record.model_id,
            label: record.label,
          }
        })
        .filter((row): row is CatalogModel => Boolean(row))
      setCatalogModels(mapped)
      if (!catalogModelId && mapped[0]) setCatalogModelId(mapped[0].id)
      if (variant === "dialog" && agentId) {
        const current = listed.data.find((row) => row.id === agentId)
        if (current) {
          setName(current.name)
          setRole(current.role)
          setStage(current.stage)
        }
      }
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, tenantId])

  useEffect(() => {
    if (variant === "dialog" && agentId) {
      loadVersions(agentId)
    }
    if (variant === "dialog" && !agentId) {
      setSelectedId(null)
      setName("")
      setRole("")
      setStage("draft")
      setInstructions("")
      setQualityRules("")
      setChangelog("")
      setVersions([])
      setPreviewId(null)
      setConfirmingDelete(false)
      setConfirmingDeleteAgent(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, variant])

  const loadVersions = (nextAgentId: string) => {
    startTransition(async () => {
      setSelectedId(nextAgentId)
      const result = await listAgentVersions(nextAgentId)
      setVersions(result.data)
      setPreviewId((current) => (current && result.data.some((version) => version.id === current) ? current : null))
      setConfirmingDelete(false)
      setConfirmingDeleteAgent(false)
      const latest = result.data[0]
      const current = agents.find((row) => row.id === nextAgentId)
      if (current) {
        setName(current.name)
        setRole(current.role)
        setStage(current.stage)
      }
      if (latest) {
        setInstructions(latest.instructions)
        setQualityRules(latest.qualityRules)
        if (latest.catalogModelId) setCatalogModelId(latest.catalogModelId)
      }
    })
  }

  const buildVersionPayload = () => {
    if (!selectedModel) return null
    const provider = selectedModel.providerId === "anthropic" ? "anthropic" : "openai-compatible"
    return {
      instructions,
      qualityRules,
      provider,
      endpoint: null,
      model: selectedModel.modelId,
      catalogModelId: selectedModel.id,
      changelog: changelog || "Updated from authority agents",
    }
  }

  const duplicateVersion = useMemo(
    () => matchingAgentVersionNumber(versions, { instructions, qualityRules }),
    [instructions, qualityRules, versions],
  )
  const duplicateVersionText = (versionNumber: number) => {
    const which = t("space.agents.duplicateVersion", "This is a duplicate of version {{version}}.", {
      version: String(versionNumber),
    })
    const hint = t(
      "space.agents.duplicateVersionHint",
      "The method and instructions match that version exactly. Change the text to publish a new version.",
    )
    return `${which} ${hint}`
  }
  const openVersionNumber = (versionNumber: number) => {
    const match = versions.find((version) => version.version === versionNumber)
    if (!match) return
    setPreviewId(match.id)
    setConfirmingDelete(false)
  }

  const isDialog = variant === "dialog"

  return (
    <div className="space-y-4">
      {isDialog ? null : (
        <div>
          <h2 className="text-lg font-medium">{t("space.agents.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("space.agents.hint")}</p>
        </div>
      )}
      {message && <p className="text-sm">{message}</p>}
      {canManage && !isDialog && !hasAllDefaultSpaceAgents(agents) ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending || catalogModels.length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await seedDefaultSpaceAgents(spaceId)
                setMessage(
                  result.error ||
                    t("space.agents.seeded", undefined, { count: String(result.data?.createdCount ?? 0) }),
                )
                refresh()
              })
            }
          >
            {t("space.agents.seedDefaults")}
          </Button>
        </div>
      ) : null}
      {catalogModels.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {pending ? t("admin.agents.loading") : t("space.agents.noModels")}
        </p>
      ) : canManage ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("space.agents.name")} />
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t("space.agents.role")} />
            <Select value={stage} onValueChange={(value) => setStage(value as AgentStage)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`space.agents.stages.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={catalogModelId} onValueChange={setCatalogModelId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("space.agents.model")} />
              </SelectTrigger>
              <SelectContent>
                {catalogModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label} ({model.modelId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            placeholder={t("space.agents.instructions")}
          />
          <Textarea
            value={qualityRules}
            onChange={(e) => setQualityRules(e.target.value)}
            rows={2}
            placeholder={t("space.agents.quality")}
          />
          <Textarea
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            rows={2}
            placeholder={t("space.agents.changelog")}
          />
          <div className="flex flex-wrap gap-2">
            {selectedId ? null : (
            <Button
              disabled={pending || name.trim().length < 2 || instructions.trim().length < 3 || !selectedModel}
              onClick={() =>
                startTransition(async () => {
                  const version = buildVersionPayload()
                  if (!version) return
                  const created = await createAgent({
                    spaceId,
                    name,
                    role: role || stage,
                    stage,
                    version,
                  })
                  setMessage(created.error || t("space.agents.created"))
                  if (!created.error) {
                    refresh()
                    onSaved?.()
                  }
                })
              }
            >
              {t("space.agents.create")}
            </Button>
            )}
            {selectedId ? (
              <Button
                variant={isDialog ? "default" : "outline"}
                disabled={pending || !selectedModel}
                onClick={() =>
                  startTransition(async () => {
                    const version = buildVersionPayload()
                    if (!version) return
                    const duplicate = matchingAgentVersionNumber(versions, {
                      instructions: version.instructions,
                      qualityRules: version.qualityRules,
                    })
                    if (duplicate != null) {
                      const text = duplicateVersionText(duplicate)
                      setMessage(text)
                      notify(text, "warning")
                      openVersionNumber(duplicate)
                      return
                    }
                    const meta = await updateAgentMeta({
                      spaceId,
                      agentId: selectedId,
                      name,
                      role: role || stage,
                      stage,
                    })
                    if (meta.error) {
                      setMessage(meta.error)
                      return
                    }
                    const published = await publishAgentVersion({
                      spaceId,
                      agentId: selectedId,
                      payload: version,
                    })
                    setMessage(
                      published.error ||
                        t("space.agents.published", undefined, { version: String(published.data?.version ?? "") }),
                    )
                    if (!published.error) {
                      loadVersions(selectedId)
                      onSaved?.({ close: false })
                    }
                  })
                }
              >
                {t("space.agents.publish")}
              </Button>
            ) : null}
            {selectedId && confirmingDeleteAgent ? (
              <>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const deleted = await deleteAgent(spaceId, selectedId)
                      notifyResult(deleted.error, t("space.agents.deleted"))
                      if (!deleted.error) {
                        setConfirmingDeleteAgent(false)
                        setSelectedId(null)
                        setVersions([])
                        setPreviewId(null)
                        refresh()
                        onSaved?.()
                      }
                    })
                  }
                >
                  {t("space.agents.deleteConfirm")}
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setConfirmingDeleteAgent(false)}>
                  {t("common.actions.cancel")}
                </Button>
              </>
            ) : selectedId ? (
              <Button variant="ghost" disabled={pending} onClick={() => setConfirmingDeleteAgent(true)}>
                {t("space.agents.delete")}
              </Button>
            ) : null}
          </div>
          {selectedId && confirmingDeleteAgent ? (
            <p className="text-xs text-muted-foreground">{t("space.agents.deleteHint")}</p>
          ) : selectedId && duplicateVersion != null ? (
            <div className="space-y-1 text-sm leading-relaxed">
              <p>
                {t("space.agents.duplicateVersion", "This is a duplicate of version {{version}}.", {
                  version: String(duplicateVersion),
                })
                  .split(String(duplicateVersion))
                  .flatMap((part, index, parts) =>
                    index < parts.length - 1
                      ? [
                          part,
                          <button
                            key={`duplicate-version-${duplicateVersion}`}
                            type="button"
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                            onClick={() => openVersionNumber(duplicateVersion)}
                          >
                            {duplicateVersion}
                          </button>,
                        ]
                      : [part],
                  )}
              </p>
              <p className="text-muted-foreground">
                {t(
                  "space.agents.duplicateVersionHint",
                  "The method and instructions match that version exactly. Change the text to publish a new version.",
                )}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
      {isDialog ? null : (
      <ul className="space-y-2 text-sm">
        {agents.map((agent) => (
          <li key={agent.id} className="rounded-md border p-2">
            <div className="flex items-start justify-between gap-3">
              <button type="button" className="text-left font-medium" onClick={() => loadVersions(agent.id)}>
                {agent.name} — {agent.role} ({t(`space.agents.stages.${agent.stage}`)})
              </button>
              {canManage ? (
                <div className="flex items-center gap-2">
                  <Label htmlFor={`permitted-${agent.id}`} className="text-xs text-muted-foreground">
                    {t("space.agents.permitted")}
                  </Label>
                  <Switch
                    id={`permitted-${agent.id}`}
                    checked={agent.permitted}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      startTransition(async () => {
                        const result = await setAgentPermitted(spaceId, agent.id, checked)
                        setMessage(result.error || t("space.agents.permittedSaved"))
                        refresh()
                      })
                    }
                  />
                </div>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("space.agents.latest", undefined, {
                version: String(agent.latestVersion?.version ?? "—"),
                provider: agent.latestVersion?.provider || "—",
                model: agent.latestVersion?.model || "—",
              })}
            </p>
          </li>
        ))}
        {agents.length === 0 && <li className="text-muted-foreground">{t("space.agents.empty")}</li>}
      </ul>
      )}
      {selectedId && versions.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">{t("space.agents.history")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("space.agents.historyHint", "Open a version to read it before you roll back or delete it.")}
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {versions.map((version) => {
              const isCurrent = isLatestAgentHistoryVersion(versions, version.id)
              const isPreviewed = previewId === version.id
              return (
                <li key={version.id}>
                  <button
                    type="button"
                    aria-pressed={isPreviewed}
                    aria-label={t("space.agents.previewTitle", "Version {{version}}", {
                      version: String(version.version),
                    })}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
                      isPreviewed && "border-foreground/20 bg-muted",
                    )}
                    onClick={() => {
                      setPreviewId(isPreviewed ? null : version.id)
                      setConfirmingDelete(false)
                    }}
                  >
                    <span className="min-w-0 truncate">
                      v{version.version} · {version.provider} · {version.model}
                      {version.changelog ? ` — ${version.changelog}` : ""}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {isCurrent
                        ? t("space.agents.previewCurrent", "Current")
                        : t("space.agents.preview", "Preview")}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {preview ? (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-medium">
                    {t("space.agents.previewTitle", "Version {{version}}", { version: String(preview.version) })}
                    {isLatestAgentHistoryVersion(versions, preview.id)
                      ? ` · ${t("space.agents.previewCurrent", "Current")}`
                      : ""}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {preview.provider} · {preview.model}
                    {preview.createdAt
                      ? ` · ${new Date(preview.createdAt).toLocaleString(dateLocale)}`
                      : ""}
                  </p>
                </div>
              </div>
              {preview.changelog ? <p className="text-sm">{preview.changelog}</p> : null}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t("space.agents.instructions")}</p>
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background p-2 text-sm">
                  {preview.instructions}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t("space.agents.quality")}</p>
                <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background p-2 text-sm">
                  {preview.qualityRules.trim() || t("space.agents.previewEmpty", "Quality criteria were empty in this version.")}
                </div>
              </div>
              {canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || isLatestAgentHistoryVersion(versions, preview.id)}
                    title={
                      isLatestAgentHistoryVersion(versions, preview.id)
                        ? t("space.agents.rollbackDisabled", "This is already the current version.")
                        : undefined
                    }
                    onClick={() =>
                      startTransition(async () => {
                        const rolled = await rollbackAgentVersion(spaceId, selectedId, preview.id)
                        setMessage(rolled.error || t("space.agents.rolledBack"))
                        if (!rolled.error) {
                          setPreviewId(null)
                          setConfirmingDelete(false)
                          loadVersions(selectedId)
                        }
                      })
                    }
                  >
                    {t("space.agents.rollbackThis", "Roll back to this version")}
                  </Button>
                  {confirmingDelete ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const deleted = await deleteAgentVersion(spaceId, selectedId, preview.id)
                            setMessage(deleted.error || t("space.agents.deletedVersion", "Version deleted"))
                            if (!deleted.error) {
                              setPreviewId(null)
                              setConfirmingDelete(false)
                              loadVersions(selectedId)
                            }
                          })
                        }
                      >
                        {t("space.agents.deleteVersionConfirm", "Delete this version?")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmingDelete(false)}>
                        {t("common.actions.cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending || agentHistoryVersionDeleteReason(versions, preview.id) === "only"}
                      title={
                        agentHistoryVersionDeleteReason(versions, preview.id) === "only"
                          ? t("space.agents.deleteOnlyVersion", "Keep at least one version.")
                          : isLatestAgentHistoryVersion(versions, preview.id)
                            ? t("space.agents.deleteCurrentHint", "This is the current version. The previous one will become current.")
                            : t("space.agents.deleteVersionHint", "This removes the version from history. It cannot be undone.")
                      }
                      onClick={() => setConfirmingDelete(true)}
                    >
                      {t("space.agents.deleteVersion", "Delete version")}
                    </Button>
                  )}
                </div>
              ) : null}
              {confirmingDelete ? (
                <p className="text-xs text-muted-foreground">
                  {isLatestAgentHistoryVersion(versions, preview.id)
                    ? t("space.agents.deleteCurrentHint", "This is the current version. The previous one will become current.")
                    : t("space.agents.deleteVersionHint", "This removes the version from history. It cannot be undone.")}
                </p>
              ) : isLatestAgentHistoryVersion(versions, preview.id) && versions.length === 1 ? (
                <p className="text-xs text-muted-foreground">
                  {t("space.agents.deleteOnlyVersion", "Keep at least one version.")}
                </p>
              ) : isLatestAgentHistoryVersion(versions, preview.id) ? (
                <p className="text-xs text-muted-foreground">
                  {t("space.agents.rollbackDisabled", "This is already the current version.")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
