"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  listAgentVersions,
  listSpaceAgents,
  publishAgentVersion,
  rollbackAgentVersion,
  seedDefaultSpaceAgents,
} from "@/lib/actions/agent"
import { AGENT_STAGES, type AgentRecord, type AgentStage, type AgentVersionRecord } from "@/lib/programme/domain"

type AgentRow = AgentRecord & { latestVersion: AgentVersionRecord | null }

type Props = { spaceId: string }

export function SpaceAgentAdmin({ spaceId }: Props) {
  const { t } = useI18n()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [versions, setVersions] = useState<AgentVersionRecord[]>([])
  const [name, setName] = useState("")
  const [role, setRole] = useState("")
  const [stage, setStage] = useState<AgentStage>("measures")
  const [instructions, setInstructions] = useState("")
  const [qualityRules, setQualityRules] = useState("")
  const [provider, setProvider] = useState("openai-compatible")
  const [endpoint, setEndpoint] = useState("")
  const [model, setModel] = useState("gpt-4o-mini")
  const [changelog, setChangelog] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = () => {
    startTransition(async () => {
      const listed = await listSpaceAgents(spaceId)
      if (listed.error) {
        setMessage(listed.error)
        return
      }
      setAgents(listed.data)
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId])

  const loadVersions = (agentId: string) => {
    startTransition(async () => {
      setSelectedId(agentId)
      const result = await listAgentVersions(agentId)
      setVersions(result.data)
      const latest = result.data[0]
      if (latest) {
        setInstructions(latest.instructions)
        setQualityRules(latest.qualityRules)
        setProvider(latest.provider)
        setEndpoint(latest.endpoint || "")
        setModel(latest.model)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">{t("space.settings.agents.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("space.settings.agents.hint")}</p>
      </div>
      {message && <p className="text-sm">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await seedDefaultSpaceAgents(spaceId)
              setMessage(
                result.error ||
                  t("space.settings.agents.seeded", undefined, { count: String(result.data?.createdCount ?? 0) }),
              )
              refresh()
            })
          }
        >
          {t("space.settings.agents.seedDefaults")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("space.settings.agents.name")} />
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t("space.settings.agents.role")} />
        <Select value={stage} onValueChange={(value) => setStage(value as AgentStage)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGENT_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai-compatible">{t("space.settings.agents.providerOpenai")}</SelectItem>
            <SelectItem value="anthropic">{t("space.settings.agents.providerAnthropic")}</SelectItem>
          </SelectContent>
        </Select>
        <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("space.settings.agents.model")} />
        <Input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder={t("space.settings.agents.endpoint")}
        />
      </div>
      <Textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={4}
        placeholder={t("space.settings.agents.instructions")}
      />
      <Textarea
        value={qualityRules}
        onChange={(e) => setQualityRules(e.target.value)}
        rows={2}
        placeholder={t("space.settings.agents.quality")}
      />
      <Textarea
        value={changelog}
        onChange={(e) => setChangelog(e.target.value)}
        rows={2}
        placeholder={t("space.settings.agents.changelog")}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || name.trim().length < 2 || instructions.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              const created = await createAgent({
                spaceId,
                name,
                role: role || stage,
                stage,
                version: {
                  instructions,
                  qualityRules,
                  provider,
                  endpoint: endpoint || null,
                  model,
                  changelog: changelog || "Created from admin",
                },
              })
              setMessage(created.error || t("space.settings.agents.created"))
              refresh()
            })
          }
        >
          {t("space.settings.agents.create")}
        </Button>
        {selectedId && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const published = await publishAgentVersion({
                  spaceId,
                  agentId: selectedId,
                  payload: {
                    instructions,
                    qualityRules,
                    provider,
                    endpoint: endpoint || null,
                    model,
                    changelog: changelog || "Published from admin",
                  },
                })
                setMessage(published.error || t("space.settings.agents.published", undefined, { version: String(published.data?.version ?? "") }))
                loadVersions(selectedId)
              })
            }
          >
            {t("space.settings.agents.publish")}
          </Button>
        )}
      </div>
      <ul className="space-y-2 text-sm">
        {agents.map((agent) => (
          <li key={agent.id} className="rounded-md border p-2">
            <button type="button" className="text-left font-medium" onClick={() => loadVersions(agent.id)}>
              {agent.name} — {agent.role} ({agent.stage})
            </button>
            <p className="text-xs text-muted-foreground">
              {t("space.settings.agents.latest", undefined, {
                version: String(agent.latestVersion?.version ?? "—"),
                provider: agent.latestVersion?.provider || "—",
                model: agent.latestVersion?.model || "—",
              })}
            </p>
          </li>
        ))}
        {agents.length === 0 && <li className="text-muted-foreground">{t("space.settings.agents.empty")}</li>}
      </ul>
      {selectedId && versions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("space.settings.agents.history")}</h3>
          <ul className="space-y-1 text-sm">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
                <span>
                  v{version.version} · {version.provider} · {version.model}
                  {version.changelog ? ` — ${version.changelog}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const rolled = await rollbackAgentVersion(spaceId, selectedId, version.id)
                      setMessage(rolled.error || t("space.settings.agents.rolledBack"))
                      loadVersions(selectedId)
                    })
                  }
                >
                  {t("space.settings.agents.rollback")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
