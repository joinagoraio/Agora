"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  cloneProgrammeTemplate,
  createProgrammeTemplate,
  deleteOutlineNode,
  getTemplateWithNodes,
  listSpaceTemplates,
  seedHandbookTemplateIfNone,
  updateProgrammeTemplate,
  upsertOutlineNode,
} from "@/lib/actions/template"
import type { ProgrammeOutlineNode, ProgrammeTemplate } from "@/lib/programme/domain"

type Props = { spaceId: string }

export function SpaceTemplateLibrary({ spaceId }: Props) {
  const { t } = useI18n()
  const [templates, setTemplates] = useState<ProgrammeTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<ProgrammeOutlineNode[]>([])
  const [name, setName] = useState("")
  const [qualityRules, setQualityRules] = useState("")
  const [outputForm, setOutputForm] = useState("")
  const [nodeTitle, setNodeTitle] = useState("")
  const [nodeInstructions, setNodeInstructions] = useState("")
  const [nodeRequired, setNodeRequired] = useState(true)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = () => {
    startTransition(async () => {
      const listed = await listSpaceTemplates(spaceId)
      if (listed.error) {
        setMessage(listed.error)
        return
      }
      setTemplates(listed.data)
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId])

  const loadTemplate = (id: string) => {
    startTransition(async () => {
      const result = await getTemplateWithNodes(id)
      if (result.error || !result.data) {
        setMessage(result.error || t("space.settings.templates.loadError"))
        return
      }
      setSelectedId(id)
      setNodes(result.data.nodes)
      setName(result.data.template.name)
      setQualityRules(result.data.template.qualityRules || "")
      setOutputForm(result.data.template.outputForm || "")
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">{t("space.settings.templates.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("space.settings.templates.hint")}</p>
      </div>
      {message && <p className="text-sm">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const created = await createProgrammeTemplate({ spaceId, name: t("space.settings.templates.newName") })
              if (created.error || !created.data) {
                setMessage(created.error || t("space.settings.templates.saveError"))
                return
              }
              refresh()
              loadTemplate(created.data.id)
            })
          }
        >
          {t("space.settings.templates.create")}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const seeded = await seedHandbookTemplateIfNone(spaceId)
              if (seeded.error || !seeded.data) {
                setMessage(seeded.error || t("space.settings.templates.saveError"))
                return
              }
              refresh()
              loadTemplate(seeded.data.template.id)
              setMessage(
                seeded.data.created
                  ? t("space.settings.templates.seeded")
                  : t("space.settings.templates.seedExists"),
              )
            })
          }
        >
          {t("space.settings.templates.seedHandbook")}
        </Button>
        {selectedId && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const cloned = await cloneProgrammeTemplate(spaceId, selectedId)
                if (cloned.error || !cloned.data) {
                  setMessage(cloned.error || t("space.settings.templates.saveError"))
                  return
                }
                refresh()
                loadTemplate(cloned.data.template.id)
              })
            }
          >
            {t("space.settings.templates.clone")}
          </Button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <ul className="space-y-1">
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className={`w-full rounded-md border px-2 py-1.5 text-left text-sm ${
                  selectedId === template.id ? "border-foreground bg-muted" : "hover:bg-muted/60"
                }`}
                onClick={() => loadTemplate(template.id)}
              >
                {template.name}
              </button>
            </li>
          ))}
          {templates.length === 0 && <li className="text-sm text-muted-foreground">{t("space.settings.templates.empty")}</li>}
        </ul>
        {selectedId && (
          <div className="space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea
              value={qualityRules}
              onChange={(e) => setQualityRules(e.target.value)}
              rows={2}
              placeholder={t("space.settings.templates.qualityPlaceholder")}
            />
            <Textarea
              value={outputForm}
              onChange={(e) => setOutputForm(e.target.value)}
              rows={2}
              placeholder={t("space.settings.templates.outputPlaceholder")}
            />
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const saved = await updateProgrammeTemplate({
                    spaceId,
                    templateId: selectedId,
                    name,
                    qualityRules,
                    outputForm,
                  })
                  setMessage(saved.error || t("space.settings.templates.saved"))
                  refresh()
                })
              }
            >
              {t("space.settings.templates.saveMeta")}
            </Button>
            <ul className="space-y-2 text-sm">
              {nodes.map((node) => (
                <li key={node.id} className="rounded-md border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {node.title}
                      {node.required ? ` · ${t("space.settings.templates.required")}` : ` · ${t("space.settings.templates.optional")}`}
                    </span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditingNodeId(node.id)
                        setNodeTitle(node.title)
                        setNodeInstructions(node.instructions || "")
                        setNodeRequired(node.required)
                      }}>
                        {t("space.settings.templates.editNode")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await deleteOutlineNode(spaceId, selectedId, node.id)
                            loadTemplate(selectedId)
                          })
                        }
                      >
                        {t("space.settings.templates.deleteNode")}
                      </Button>
                    </div>
                  </div>
                  {node.instructions && <p className="mt-1 text-xs text-muted-foreground">{node.instructions}</p>}
                </li>
              ))}
            </ul>
            <div className="space-y-2 rounded-md border p-3">
              <Input
                value={nodeTitle}
                onChange={(e) => setNodeTitle(e.target.value)}
                placeholder={t("space.settings.templates.nodeTitle")}
              />
              <Textarea
                value={nodeInstructions}
                onChange={(e) => setNodeInstructions(e.target.value)}
                rows={3}
                placeholder={t("space.settings.templates.nodeInstructions")}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={nodeRequired} onChange={(e) => setNodeRequired(e.target.checked)} />
                {t("space.settings.templates.required")}
              </label>
              <Button
                disabled={pending || !nodeTitle.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const result = await upsertOutlineNode({
                      spaceId,
                      templateId: selectedId,
                      nodeId: editingNodeId || undefined,
                      title: nodeTitle,
                      instructions: nodeInstructions,
                      required: nodeRequired,
                      sortOrder: editingNodeId ? undefined : nodes.length + 1,
                    })
                    if (result.error) {
                      setMessage(result.error)
                      return
                    }
                    setNodeTitle("")
                    setNodeInstructions("")
                    setEditingNodeId(null)
                    loadTemplate(selectedId)
                  })
                }
              >
                {editingNodeId ? t("space.settings.templates.updateNode") : t("space.settings.templates.addNode")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
