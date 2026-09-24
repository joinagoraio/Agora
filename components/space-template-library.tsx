"use client"

import { useEffect, useState, useTransition } from "react"
import { ArrowDown, ArrowUp, MoreVertical, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { IconTooltip } from "@/components/icon-tooltip"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n/use-i18n"
import { notify, notifyResult } from "@/lib/notify"
import {
  cloneProgrammeTemplate,
  createProgrammeTemplate,
  deleteOutlineNode,
  deleteProgrammeTemplate,
  getTemplateWithNodes,
  listSpaceTemplates,
  reorderOutlineNodes,
  updateProgrammeTemplate,
  upsertOutlineNode,
} from "@/lib/actions/template"
import { listTemplateWorkupHeadings, saveTemplateWorkupHeadings } from "@/lib/actions/interests"
import type { ProgrammeOutlineNode, ProgrammeTemplateSummary } from "@/lib/programme/domain"

type Props = { spaceId: string; hideIntro?: boolean }

function ChapterFields({
  titleId,
  title,
  purpose,
  instructions,
  required,
  onTitle,
  onPurpose,
  onInstructions,
  onRequired,
  pending,
}: {
  titleId: string
  title: string
  purpose: string
  instructions: string
  required: boolean
  onTitle: (value: string) => void
  onPurpose: (value: string) => void
  onInstructions: (value: string) => void
  onRequired: (value: boolean) => void
  pending: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={titleId}>{t("space.settings.templates.nodeTitle")}</Label>
        <Input
          id={titleId}
          value={title}
          onChange={(event) => onTitle(event.target.value)}
          placeholder={t("space.settings.templates.nodeTitle")}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${titleId}-purpose`}>{t("space.settings.templates.nodePurpose")}</Label>
        <Textarea
          id={`${titleId}-purpose`}
          value={purpose}
          onChange={(event) => onPurpose(event.target.value)}
          rows={2}
          placeholder={t("space.settings.templates.nodePurposePlaceholder")}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${titleId}-instructions`}>{t("space.settings.templates.nodeInstructions")}</Label>
        <Textarea
          id={`${titleId}-instructions`}
          value={instructions}
          onChange={(event) => onInstructions(event.target.value)}
          rows={3}
          placeholder={t("space.settings.templates.nodeInstructions")}
          disabled={pending}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${titleId}-required`} className="font-normal">
          {t("space.settings.templates.required")}
        </Label>
        <Switch
          id={`${titleId}-required`}
          checked={required}
          onCheckedChange={onRequired}
          disabled={pending}
        />
      </div>
    </div>
  )
}

export function SpaceTemplateLibrary({ spaceId, hideIntro = false }: Props) {
  const { t } = useI18n()
  const [templates, setTemplates] = useState<ProgrammeTemplateSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<ProgrammeOutlineNode[]>([])
  const [name, setName] = useState("")
  const [qualityRules, setQualityRules] = useState("")
  const [outputForm, setOutputForm] = useState("")
  const [workupHeadings, setWorkupHeadings] = useState("")
  const [savedWorkupHeadings, setSavedWorkupHeadings] = useState("")
  const [savedMeta, setSavedMeta] = useState({ name: "", qualityRules: "", outputForm: "" })
  const [nodeTitle, setNodeTitle] = useState("")
  const [nodePurpose, setNodePurpose] = useState("")
  const [nodeInstructions, setNodeInstructions] = useState("")
  const [nodeRequired, setNodeRequired] = useState(true)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(false)
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [pending, startTransition] = useTransition()

  const resetNodeForm = () => {
    setEditingNodeId(null)
    setAdding(false)
    setNodeTitle("")
    setNodePurpose("")
    setNodeInstructions("")
    setNodeRequired(true)
  }

  const applyLoaded = (template: { name: string; qualityRules?: string | null; outputForm?: string | null }, nextNodes: ProgrammeOutlineNode[]) => {
    const nextMeta = {
      name: template.name,
      qualityRules: template.qualityRules || "",
      outputForm: template.outputForm || "",
    }
    setNodes([...nextNodes].sort((a, b) => a.sortOrder - b.sortOrder))
    setName(nextMeta.name)
    setQualityRules(nextMeta.qualityRules)
    setOutputForm(nextMeta.outputForm)
    setSavedMeta(nextMeta)
  }

  const refreshList = (preferId?: string | null) => {
    startTransition(async () => {
      const listed = await listSpaceTemplates(spaceId)
      if (listed.error) {
        notify(listed.error, "error")
        setLoaded(true)
        return
      }
      setTemplates(listed.data)
      setLoaded(true)
      setSelectedId((current) => {
        const next = preferId ?? current
        if (next && listed.data.some((template) => template.id === next)) return next
        return listed.data[0]?.id ?? null
      })
    })
  }

  useEffect(() => {
    refreshList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId])

  useEffect(() => {
    if (!selectedId) {
      setNodes([])
      setName("")
      setQualityRules("")
      setOutputForm("")
      setSavedMeta({ name: "", qualityRules: "", outputForm: "" })
      resetNodeForm()
      return
    }
    startTransition(async () => {
      const [result, headings] = await Promise.all([getTemplateWithNodes(selectedId), listTemplateWorkupHeadings(selectedId)])
      if (result.error || !result.data) {
        notify(result.error || t("space.settings.templates.loadError"), "error")
        return
      }
      applyLoaded(result.data.template, result.data.nodes)
      const lines = headings.data.map((heading) => heading.label).join("\n")
      setWorkupHeadings(lines)
      setSavedWorkupHeadings(lines)
      resetNodeForm()
    })
  }, [selectedId, t])

  const editingNode = nodes.find((node) => node.id === editingNodeId) ?? null
  const metaDirty =
    name.trim() !== savedMeta.name ||
    qualityRules !== savedMeta.qualityRules ||
    outputForm !== savedMeta.outputForm ||
    workupHeadings.trim() !== savedWorkupHeadings.trim()

  const openAdd = () => {
    setEditingNodeId(null)
    setNodeTitle("")
    setNodePurpose("")
    setNodeInstructions("")
    setNodeRequired(true)
    setAdding(true)
  }

  const openEdit = (node: ProgrammeOutlineNode) => {
    setAdding(false)
    setEditingNodeId(node.id)
    setNodeTitle(node.title)
    setNodePurpose(node.purpose || "")
    setNodeInstructions(node.instructions || "")
    setNodeRequired(node.required)
  }

  const saveNode = () => {
    if (!selectedId) return
    startTransition(async () => {
      const result = await upsertOutlineNode({
        spaceId,
        templateId: selectedId,
        nodeId: editingNodeId || undefined,
        title: nodeTitle,
        purpose: nodePurpose,
        instructions: nodeInstructions,
        required: nodeRequired,
        fieldSpecs: editingNode?.fieldSpecs,
        qualityRules: editingNode?.qualityRules,
        outputForm: editingNode?.outputForm,
        relationHints: editingNode?.relationHints,
        sortOrder: editingNode ? editingNode.sortOrder : nodes.length + 1,
      })
      if (result.error) {
        notify(result.error, "error")
        return
      }
      resetNodeForm()
      const loadedTemplate = await getTemplateWithNodes(selectedId)
      if (loadedTemplate.data) applyLoaded(loadedTemplate.data.template, loadedTemplate.data.nodes)
      refreshList(selectedId)
    })
  }

  const moveNode = (index: number, direction: -1 | 1) => {
    if (!selectedId) return
    startTransition(async () => {
      const ids = nodes.map((item) => item.id)
      const swap = index + direction
      ;[ids[index], ids[swap]] = [ids[swap], ids[index]]
      const result = await reorderOutlineNodes(spaceId, selectedId, ids)
      if (result.error) {
        notify(result.error, "error")
        return
      }
      setNodes(result.data || [])
      refreshList(selectedId)
    })
  }

  const askDeleteTemplate = (templateId: string) => {
    setDeletingTemplateId(templateId)
    setConfirmDeleteTemplate(true)
  }

  const createBlank = () => {
    startTransition(async () => {
      const created = await createProgrammeTemplate({ spaceId, name: t("space.settings.templates.newName") })
      notifyResult(created.error, t("space.settings.templates.saved"))
      if (created.data) refreshList(created.data.id)
    })
  }

  const nodeForm = (
    <ChapterFields
      titleId={editingNodeId ? `chapter-title-${editingNodeId}` : "chapter-title-new"}
      title={nodeTitle}
      purpose={nodePurpose}
      instructions={nodeInstructions}
      required={nodeRequired}
      onTitle={setNodeTitle}
      onPurpose={setNodePurpose}
      onInstructions={setNodeInstructions}
      onRequired={setNodeRequired}
      pending={pending}
    />
  )

  const nodeFormActions = (
    <div className="flex flex-wrap gap-2">
      <Button disabled={pending || !nodeTitle.trim()} onClick={saveNode}>
        {editingNodeId ? t("space.settings.templates.updateNode") : t("space.settings.templates.addNode")}
      </Button>
      <Button type="button" variant="outline" onClick={resetNodeForm}>
        {t("space.settings.templates.cancelEdit")}
      </Button>
    </div>
  )

  return (
    <div className={cn("flex min-h-0 flex-col", hideIntro ? "h-full" : "min-h-[32rem] rounded-lg border")}>
      {hideIntro ? null : (
        <div className="shrink-0 border-b px-4 py-3">
          <h2 className="text-lg font-medium">{t("space.settings.templates.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("space.settings.templates.hint")}</p>
        </div>
      )}

      {!loaded ? (
        <p className="p-6 text-sm text-muted-foreground">{t("space.overview.menu.accessLoading")}</p>
      ) : templates.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <p className="text-sm font-medium">{t("space.settings.templates.empty")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("space.settings.templates.emptyHint")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button disabled={pending} onClick={createBlank}>
              {t("space.settings.templates.create")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex max-h-48 shrink-0 flex-col border-b md:max-h-none md:w-72 md:border-b-0 md:border-r">
            <div className="flex shrink-0 px-3 py-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" className="w-full" disabled={pending}>
                    <Plus className="h-4 w-4" />
                    {t("space.settings.templates.newTemplate")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem disabled={pending} onSelect={createBlank}>
                    {t("space.settings.templates.create")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
              {templates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-left",
                      selectedId === template.id ? "bg-muted" : "hover:bg-muted/60",
                    )}
                    onClick={() => setSelectedId(template.id)}
                  >
                    <span className="block line-clamp-2 text-sm font-medium">{template.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t("space.settings.templates.chapterCount", undefined, { count: template.chapterCount })}
                      {template.requiredCount > 0
                        ? ` · ${t("space.settings.templates.requiredCount", undefined, { count: template.requiredCount })}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {selectedId ? (
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-start gap-2 border-b px-4 py-3">
                <Input
                  aria-label={t("space.settings.templates.nameLabel")}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                  disabled={pending}
                />
                <Button
                  size="sm"
                  disabled={pending || !name.trim() || !metaDirty}
                  onClick={() =>
                    startTransition(async () => {
                      const saved = await updateProgrammeTemplate({
                        spaceId,
                        templateId: selectedId,
                        name: name.trim(),
                        qualityRules,
                        outputForm,
                      })
                      const headingLines = workupHeadings
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                      const headingsSaved = saved.error
                        ? { error: saved.error }
                        : await saveTemplateWorkupHeadings(
                            spaceId,
                            selectedId,
                            headingLines.map((label, index) => ({ key: `h${index + 1}`, label })),
                          )
                      notifyResult(headingsSaved.error, t("space.settings.templates.saved"))
                      if (!headingsSaved.error) {
                        setSavedMeta({ name: name.trim(), qualityRules, outputForm })
                        setSavedWorkupHeadings(headingLines.join("\n"))
                        refreshList(selectedId)
                      }
                    })
                  }
                  >
                    {t("space.settings.templates.saveMeta")}
                  </Button>
                  <DropdownMenu>
                  <IconTooltip label={t("common.tooltips.moreActions")}>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={pending}>
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">{t("common.tooltips.moreActions")}</span>
                      </Button>
                    </DropdownMenuTrigger>
                  </IconTooltip>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={pending}
                      onSelect={() =>
                        startTransition(async () => {
                          const cloned = await cloneProgrammeTemplate(spaceId, selectedId)
                          notifyResult(cloned.error, t("space.settings.templates.cloned"))
                          if (cloned.data) refreshList(cloned.data.template.id)
                        })
                      }
                    >
                      {t("space.settings.templates.clone")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={pending}
                      onSelect={() => askDeleteTemplate(selectedId)}
                    >
                      {t("common.actions.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <p className="mb-3 text-xs text-muted-foreground">{t("space.settings.templates.sharedWarning")}</p>
                <Accordion type="single" collapsible className="mb-4">
                  <AccordionItem value="rules" className="border-none">
                    <AccordionTrigger className="py-1 text-sm hover:no-underline">
                      {t("space.settings.templates.rulesTitle")}
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-1 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="template-quality">{t("space.settings.templates.qualityLabel")}</Label>
                        <Textarea
                          id="template-quality"
                          value={qualityRules}
                          onChange={(event) => setQualityRules(event.target.value)}
                          rows={2}
                          placeholder={t("space.settings.templates.qualityPlaceholder")}
                          disabled={pending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="template-output">{t("space.settings.templates.outputLabel")}</Label>
                        <Textarea
                          id="template-output"
                          value={outputForm}
                          onChange={(event) => setOutputForm(event.target.value)}
                          rows={2}
                          placeholder={t("space.settings.templates.outputPlaceholder")}
                          disabled={pending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="template-workup">{t("space.settings.templates.workupLabel")}</Label>
                        <Textarea
                          id="template-workup"
                          value={workupHeadings}
                          onChange={(event) => setWorkupHeadings(event.target.value)}
                          rows={5}
                          placeholder={t("space.settings.templates.workupPlaceholder")}
                          disabled={pending}
                        />
                        <p className="text-xs text-muted-foreground">{t("space.settings.templates.workupHelp")}</p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{t("space.settings.templates.chaptersTitle")}</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending || Boolean(editingNodeId) || adding}
                    onClick={openAdd}
                  >
                    <Plus className="h-4 w-4" />
                    {t("space.settings.templates.addNode")}
                  </Button>
                </div>

                {nodes.length === 0 && !adding ? (
                  <p className="py-6 text-sm text-muted-foreground">{t("space.settings.templates.chaptersEmpty")}</p>
                ) : (
                  <ul className="space-y-2">
                    {nodes.map((node, index) => {
                      const isEditing = editingNodeId === node.id
                      const isInactive = (Boolean(editingNodeId) || adding) && !isEditing
                      return (
                      <li
                        key={node.id}
                        className={cn(
                          "rounded-md border transition-opacity",
                          isEditing && "border-foreground/25 bg-background shadow-sm",
                          isInactive && "border-transparent bg-muted/40 opacity-40",
                        )}
                        aria-disabled={isInactive}
                      >
                        <div className="flex items-start gap-2 px-3 py-2.5">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            disabled={pending || isInactive}
                            onClick={() => (isEditing ? resetNodeForm() : openEdit(node))}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{node.title}</span>
                              <Badge variant="secondary">
                                {node.required
                                  ? t("space.settings.templates.required")
                                  : t("space.settings.templates.optional")}
                              </Badge>
                            </div>
                            {node.purpose ? (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{node.purpose}</p>
                            ) : null}
                          </button>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              disabled={pending || isInactive || index === 0}
                              aria-label={t("space.settings.templates.moveUp")}
                              onClick={() => moveNode(index, -1)}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              disabled={pending || isInactive || index === nodes.length - 1}
                              aria-label={t("space.settings.templates.moveDown")}
                              onClick={() => moveNode(index, 1)}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              disabled={pending || isInactive}
                              onClick={() => setDeletingNodeId(node.id)}
                            >
                              {t("space.settings.templates.deleteNode")}
                            </Button>
                          </div>
                        </div>
                        {isEditing ? (
                          <div className="space-y-3 border-t px-3 py-3">
                            {nodeForm}
                            {nodeFormActions}
                          </div>
                        ) : null}
                      </li>
                      )
                    })}
                  </ul>
                )}

                {adding ? (
                  <div className="mt-3 space-y-3 rounded-md border border-foreground/25 bg-background p-3 shadow-sm">
                    {nodeForm}
                    {nodeFormActions}
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">{t("space.settings.templates.selectPrompt")}</p>
          )}
        </div>
      )}

      <AlertDialog
        open={confirmDeleteTemplate}
        onOpenChange={(open) => {
          setConfirmDeleteTemplate(open)
          if (!open) setDeletingTemplateId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("space.settings.templates.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("space.settings.templates.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault()
                const templateId = deletingTemplateId ?? selectedId
                if (!templateId) return
                startTransition(async () => {
                  const result = await deleteProgrammeTemplate(spaceId, templateId)
                  notifyResult(result.error, t("space.settings.templates.deleted"))
                  if (!result.error) {
                    setConfirmDeleteTemplate(false)
                    setDeletingTemplateId(null)
                    if (selectedId === templateId) setSelectedId(null)
                    refreshList(selectedId === templateId ? null : selectedId)
                  }
                })
              }}
            >
              {t("common.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deletingNodeId)} onOpenChange={(open) => !open && setDeletingNodeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("space.settings.templates.deleteNodeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("space.settings.templates.deleteNodeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault()
                if (!selectedId || !deletingNodeId) return
                startTransition(async () => {
                  const result = await deleteOutlineNode(spaceId, selectedId, deletingNodeId)
                  if (result.error) {
                    notify(result.error, "error")
                    return
                  }
                  if (editingNodeId === deletingNodeId) resetNodeForm()
                  setDeletingNodeId(null)
                  const loadedTemplate = await getTemplateWithNodes(selectedId)
                  if (loadedTemplate.data) applyLoaded(loadedTemplate.data.template, loadedTemplate.data.nodes)
                  refreshList(selectedId)
                })
              }}
            >
              {t("common.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
