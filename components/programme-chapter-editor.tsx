"use client"

import { useEffect, useMemo, useState, useTransition, type MouseEvent } from "react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RichTextEditor } from "@/components/rich-text-editor"
import { useI18n } from "@/lib/i18n/use-i18n"
import { listProgrammeOutlineNodes, ensureProgrammeOutline } from "@/lib/actions/outline"
import {
  ensureChapterDocument,
  getChapterDocument,
  assessDocumentGroundedness,
  setChapterWorkflowStatus,
  regenerateProgrammeChapter,
  listProgrammeChapters,
} from "@/lib/actions/programme"
import { updateWorkspaceDocument } from "@/lib/actions/document"
import { listProgrammeMeasures } from "@/lib/actions/measures"
import {
  acquireSectionLock,
  releaseSectionLock,
  listArtefactVersions,
  restoreArtefactVersion,
  getSectionLockHolder,
  compareArtefactVersions,
  heartbeatSectionPresence,
  listSectionPresence,
} from "@/lib/actions/collaboration"
import { addProgrammeComment, listProgrammeComments, setProgrammeCommentResolved } from "@/lib/actions/comments"
import { UserAvatar } from "@/components/user-avatar"
import { IconTooltip } from "@/components/icon-tooltip"
import { ProgrammeCommentRail } from "@/components/programme-comment-rail"
import type { ProgrammeBindings, ProgrammeOutlineNode } from "@/lib/programme/domain"
import type { ChapterWorkflowStatus } from "@/lib/programme/review-policy"
import {
  DEFAULT_PROGRAMME_DOCUMENT_LAYOUT,
  PROGRAMME_ZOOM_PRESETS,
  readProgrammeDocumentLayout,
  stepProgrammeScale,
  writeProgrammeDocumentLayout,
  type ProgrammeDocumentLayout,
} from "@/lib/programme/document-layout"
import { BLOCK_ID_ATTR, ensureBlockIdsInHtml, quoteFromBlock } from "@/lib/programme/block-id"
import {
  paragraphArtefactId,
  parseParagraphArtefactId,
  toAnchoredComment,
  type AnchoredProgrammeComment,
} from "@/lib/programme/comment-anchor"
import { ChevronDown, List, ZoomIn, ZoomOut } from "lucide-react"

type ChapterBody = {
  documentId: string | null
  content: string
  workflowStatus: ChapterWorkflowStatus
}

type Props = {
  workspaceId: string
  spaceId: string
  bindings: ProgrammeBindings
  onBindingsChange: (bindings: ProgrammeBindings) => void
  onMessage: (message: string | null) => void
  onGoOutline: () => void
  canComment?: boolean
}

export function ProgrammeChapterEditor({
  workspaceId,
  spaceId,
  bindings,
  onBindingsChange,
  onMessage,
  onGoOutline,
  canComment = true,
}: Props) {
  const { t } = useI18n()
  const [nodes, setNodes] = useState<ProgrammeOutlineNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bodies, setBodies] = useState<Record<string, ChapterBody>>({})
  const [content, setContent] = useState("")
  const [dirty, setDirty] = useState(false)
  const [draftInstructions, setDraftInstructions] = useState("")
  const [groundednessScore, setGroundednessScore] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [nodeMeasures, setNodeMeasures] = useState<any[]>([])
  const [lockHolder, setLockHolder] = useState<string | null>(null)
  const [workflowStatus, setWorkflowStatus] = useState<ChapterWorkflowStatus>("generated")
  const [showHistory, setShowHistory] = useState(false)
  const [chapterVersions, setChapterVersions] = useState<Array<{ id: string; reason: string | null; created_at: string }>>([])
  const [restoreReason, setRestoreReason] = useState("")
  const [compareVersionA, setCompareVersionA] = useState("")
  const [compareVersionB, setCompareVersionB] = useState("")
  const [versionDiff, setVersionDiff] = useState<Array<{ path: string; before: string; after: string }>>([])
  const [alsoOpen, setAlsoOpen] = useState<Array<{ name: string; avatarUrl: string | null }>>([])
  const [commentDraft, setCommentDraft] = useState("")
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [railComments, setRailComments] = useState<AnchoredProgrammeComment[]>([])
  const [layout, setLayout] = useState<ProgrammeDocumentLayout>(DEFAULT_PROGRAMME_DOCUMENT_LAYOUT)

  useEffect(() => {
    setLayout(readProgrammeDocumentLayout())
  }, [])

  const patchLayout = (patch: Partial<ProgrammeDocumentLayout>) => {
    setLayout((current) => {
      const next = { ...current, ...patch }
      writeProgrammeDocumentLayout(next)
      return next
    })
  }

  const selected = nodes.find((n) => n.id === selectedId) || null
  const documentId = selectedId ? bodies[selectedId]?.documentId ?? bindings.chapterDocuments?.[selectedId] ?? null : null

  const loadNodes = (templateId: string) => {
    startTransition(async () => {
      const result = await listProgrammeOutlineNodes(templateId)
      if (result.error) {
        onMessage(result.error)
        return
      }
      setNodes(result.data)
      const listed = await listProgrammeChapters(workspaceId)
      const nextBodies: Record<string, ChapterBody> = {}
      for (const chapter of listed.data || []) {
        if (!chapter.outlineNodeId) continue
        nextBodies[chapter.outlineNodeId] = {
          documentId: chapter.documentId,
          content: ensureBlockIdsInHtml(chapter.content || ""),
          workflowStatus: (chapter.workflowStatus as ChapterWorkflowStatus) || "generated",
        }
      }
      setBodies(nextBodies)
      const firstId = selectedId || result.data[0]?.id || null
      if (firstId) {
        setSelectedId(firstId)
        const body = nextBodies[firstId]
        if (body) {
          setContent(body.content)
          setWorkflowStatus(body.workflowStatus)
        }
      }
    })
  }

  useEffect(() => {
    if (bindings.templateId) loadNodes(bindings.templateId)
    else setNodes([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindings.templateId, workspaceId])

  useEffect(() => {
    startTransition(async () => {
      const listed = await listProgrammeMeasures(workspaceId)
      setNodeMeasures((listed.data || []).filter((m: { outline_node_id?: string }) => m.outline_node_id === selectedId))
    })
  }, [selectedId, workspaceId])

  useEffect(() => {
    if (!selectedId) return
    const key = `chapter:${selectedId}`
    startTransition(async () => {
      const lock = await acquireSectionLock(workspaceId, key)
      if (lock.error) {
        const holder = await getSectionLockHolder(workspaceId, key)
        setLockHolder(holder.data ? `${lock.error}: ${holder.data.name}` : lock.error)
      } else setLockHolder(null)
      await heartbeatSectionPresence(workspaceId, key)
      const presence = await listSectionPresence(workspaceId, key)
      setAlsoOpen((presence.data || []).map((row) => ({ name: row.name, avatarUrl: row.avatarUrl })))
    })
    const timer = window.setInterval(() => {
      void heartbeatSectionPresence(workspaceId, key).then(() =>
        listSectionPresence(workspaceId, key).then((presence) =>
          setAlsoOpen((presence.data || []).map((row) => ({ name: row.name, avatarUrl: row.avatarUrl }))),
        ),
      )
    }, 20000)
    return () => {
      window.clearInterval(timer)
      void releaseSectionLock(workspaceId, key)
    }
  }, [selectedId, workspaceId])

  const selectChapter = (nodeId: string, scroll = false) => {
    if (selectedId && selectedId !== nodeId) {
      setBodies((prev) => ({
        ...prev,
        [selectedId]: {
          documentId: prev[selectedId]?.documentId ?? documentId,
          content,
          workflowStatus,
        },
      }))
    }
    setSelectedId(nodeId)
    const cached = bodies[nodeId]
    setContent(cached?.content || "")
    setWorkflowStatus(cached?.workflowStatus || "generated")
    setDirty(false)
    setShowHistory(false)
    if (scroll) {
      window.requestAnimationFrame(() => {
        document.getElementById(`chapter-${nodeId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    }
  }

  const openOrCreate = (node: ProgrammeOutlineNode) => {
    startTransition(async () => {
      const result = await ensureChapterDocument(workspaceId, node.id, {
        title: node.title,
        purposeHtml: node.purpose,
      })
      if (result.error || !result.data) {
        onMessage(result.error || t("workspace.programme.editorLoadError"))
        return
      }
      const nextBody: ChapterBody = {
        documentId: result.data.documentId,
        content: result.data.content || "",
        workflowStatus: "generated",
      }
      setBodies((prev) => ({ ...prev, [node.id]: nextBody }))
      setContent(nextBody.content)
      setWorkflowStatus("generated")
      setDirty(false)
      if (result.data.bindings) onBindingsChange(result.data.bindings)
      else if (result.data.created) {
        onBindingsChange({
          ...bindings,
          chapterDocuments: {
            ...(bindings.chapterDocuments || {}),
            [node.id]: result.data.documentId,
          },
        })
      }
      onMessage(
        result.data.created
          ? t("workspace.programme.editorCreated", undefined, { title: node.title })
          : t("workspace.programme.editorOpened", undefined, { title: node.title }),
      )
    })
  }

  const loadExisting = (nodeId: string, docId: string) => {
    startTransition(async () => {
      const result = await getChapterDocument(workspaceId, docId)
      if (result.error || !result.data) {
        onMessage(result.error || t("workspace.programme.editorLoadError"))
        return
      }
      const nextBody: ChapterBody = {
        documentId: result.data.documentId,
        content: ensureBlockIdsInHtml(result.data.content),
        workflowStatus: result.data.workflowStatus || "generated",
      }
      setBodies((prev) => ({ ...prev, [nodeId]: nextBody }))
      if (selectedId === nodeId) {
        setContent(ensureBlockIdsInHtml(result.data.content))
        setWorkflowStatus(result.data.workflowStatus || "generated")
        setDirty(false)
      }
    })
  }

  const refreshComments = () => {
    startTransition(async () => {
      const listed = await listProgrammeComments(workspaceId)
      const chapters = nodes.map((node) => ({
        documentId: bodies[node.id]?.documentId ?? bindings.chapterDocuments?.[node.id] ?? null,
        title: node.title,
      }))
      setRailComments(
        (listed.data || [])
          .map((row) => toAnchoredComment(row, chapters, quoteForComment(row.artefact_id)))
          .filter((row): row is AnchoredProgrammeComment => Boolean(row)),
      )
    })
  }

  const quoteForComment = (artefactId: string) => {
    const parsed = parseParagraphArtefactId(artefactId)
    if (!parsed) return ""
    return quoteFromBlock(document.getElementById("programme-document-scroll"), parsed.blockId)
  }

  useEffect(() => {
    if (!selectedId) {
      setContent("")
      setShowHistory(false)
      setChapterVersions([])
      return
    }
    const cached = bodies[selectedId]
    const docId = cached?.documentId || bindings.chapterDocuments?.[selectedId]
    if (cached) {
      setContent(cached.content)
      setWorkflowStatus(cached.workflowStatus)
    } else {
      setContent("")
    }
    setDirty(false)
    setShowHistory(false)
    if (docId && !cached) loadExisting(selectedId, docId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    if (nodes.length === 0) return
    refreshComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, nodes, bodies])

  const chapterToolbar = selected ? (
    <div className="space-y-3 border-b pb-4">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || !dirty || !documentId}
          onClick={() =>
            startTransition(async () => {
              if (!documentId) return
              if (lockHolder) {
                onMessage(lockHolder)
                return
              }
              const result = await updateWorkspaceDocument(workspaceId, documentId, { content })
              if (result.error) {
                onMessage(result.error)
                return
              }
              setDirty(false)
              setBodies((prev) => ({
                ...prev,
                [selected.id]: { documentId, content, workflowStatus },
              }))
              onMessage(t("workspace.programme.editorSaved", undefined, { title: selected.title }))
            })
          }
        >
          {t("workspace.programme.editorSave")}
        </Button>
        <Button
          variant="outline"
          disabled={pending || !documentId}
          onClick={() =>
            startTransition(async () => {
              if (!documentId) return
              const result = await regenerateProgrammeChapter(workspaceId, selected.id, {
                documentId,
                instructions:
                  draftInstructions.trim() ||
                  selected.instructions ||
                  t("workspace.programme.editorDefaultInstructions", undefined, { title: selected.title }),
              })
              if (result.error || !result.data) {
                onMessage(result.error || t("workspace.programme.editorLoadError"))
                return
              }
              setContent(result.data.content || "")
              setDirty(false)
              setWorkflowStatus("generated")
              setBodies((prev) => ({
                ...prev,
                [selected.id]: {
                  documentId,
                  content: result.data.content || "",
                  workflowStatus: "generated",
                },
              }))
              setGroundednessScore(result.data.groundedness?.score ?? null)
              onMessage(
                t("workspace.programme.editorRegenDone", undefined, {
                  score: String(result.data.groundedness?.score ?? "—"),
                  issues: String(result.data.groundedness?.issues?.length ?? 0),
                }),
              )
            })
          }
        >
          {t("workspace.programme.editorRegenStrict")}
        </Button>
        <Button
          variant="outline"
          disabled={pending || !documentId}
          onClick={() =>
            startTransition(async () => {
              if (!documentId) return
              const result = await assessDocumentGroundedness(workspaceId, documentId)
              if (result.error || !result.data) {
                onMessage(result.error || t("workspace.programme.editorLoadError"))
                return
              }
              setGroundednessScore(result.data.score)
              onMessage(
                t("workspace.programme.editorGroundedness", undefined, {
                  score: String(result.data.score),
                  issues: String(result.data.issues.length),
                }),
              )
            })
          }
        >
          {t("workspace.programme.editorCheckGroundedness")}
        </Button>
        {(workflowStatus === "generated" || workflowStatus === "revised") && (
          <Button
            variant="outline"
            disabled={pending || !documentId}
            onClick={() =>
              startTransition(async () => {
                if (!documentId) return
                const result = await setChapterWorkflowStatus(workspaceId, documentId, "in_review")
                if (result.error) {
                  onMessage(result.error)
                  return
                }
                setWorkflowStatus("in_review")
                onMessage(t("workspace.programme.chapterReviewRequested"))
              })
            }
          >
            {t("workspace.programme.requestReview")}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={pending || !documentId || workflowStatus === "generated"}
          onClick={() =>
            startTransition(async () => {
              if (!documentId) return
              const result = await setChapterWorkflowStatus(workspaceId, documentId, "revised")
              if (result.error) {
                onMessage(result.error)
                return
              }
              setWorkflowStatus("revised")
              onMessage(t("workspace.programme.chapterChangesRequested"))
            })
          }
        >
          {t("workspace.programme.requestChanges")}
        </Button>
        <Button
          variant="outline"
          disabled={pending || !documentId || workflowStatus === "generated"}
          onClick={() =>
            startTransition(async () => {
              if (!documentId) return
              const result = await setChapterWorkflowStatus(workspaceId, documentId, "approved")
              if (result.error) {
                onMessage(result.error)
                return
              }
              setWorkflowStatus("approved")
              onMessage(t("workspace.programme.chapterApproved"))
            })
          }
        >
          {t("workspace.programme.approveChapter")}
        </Button>
        <Button
          variant="outline"
          disabled={pending || !documentId}
          onClick={() =>
            startTransition(async () => {
              if (!documentId) return
              if (showHistory) {
                setShowHistory(false)
                return
              }
              const listed = await listArtefactVersions(workspaceId, "document", documentId)
              setChapterVersions(listed.data || [])
              setShowHistory(true)
              setRestoreReason("")
            })
          }
        >
          {showHistory ? t("workspace.programme.hideHistory") : t("workspace.programme.history")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("workspace.programme.chapterStatus", undefined, { status: workflowStatus })}
      </p>
      {showHistory && (
        <div className="space-y-2 rounded-md border p-2">
          <Input
            value={restoreReason}
            onChange={(e) => setRestoreReason(e.target.value)}
            placeholder={t("workspace.programme.restoreReason")}
          />
          {chapterVersions.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("workspace.programme.noVersions")}</p>
          )}
          <ul className="space-y-1 text-xs">
            {chapterVersions.map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-2">
                <span>
                  {version.reason || "snapshot"} · {version.created_at}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !restoreReason.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      if (!documentId) return
                      const result = await restoreArtefactVersion(workspaceId, version.id, restoreReason)
                      if (result.error) {
                        onMessage(result.error)
                        return
                      }
                      const reloaded = await getChapterDocument(workspaceId, documentId)
                      if (reloaded.data) {
                        setContent(reloaded.data.content)
                        setWorkflowStatus(reloaded.data.workflowStatus || "generated")
                        setDirty(false)
                      }
                      onMessage(t("workspace.programme.restoreDone"))
                    })
                  }
                >
                  {t("workspace.programme.restoreVersion")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {selected.instructions && (
        <p className="rounded-md border p-2 text-xs text-muted-foreground">
          {t("workspace.programme.editorNodeInstructions")}: {selected.instructions}
          {selected.required ? ` · ${t("workspace.programme.requiredSection")}` : ""}
        </p>
      )}
      {lockHolder && <p className="text-xs text-destructive">{lockHolder}</p>}
      {alsoOpen.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex -space-x-1">
            {alsoOpen.map((person) => (
              <IconTooltip key={`${person.name}-${person.avatarUrl || "none"}`} label={person.name}>
                <UserAvatar name={person.name} url={person.avatarUrl} className="h-5 w-5 ring-2 ring-background" />
              </IconTooltip>
            ))}
          </span>
          <span>
            {t("workspace.programme.alsoOpen", undefined, {
              names: alsoOpen.map((person) => person.name).join(", "),
            })}
          </span>
        </div>
      )}
      {showHistory && chapterVersions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Select
            value={compareVersionA || "none"}
            onValueChange={(value) => setCompareVersionA(value === "none" ? "" : value)}
          >
            <SelectTrigger size="sm" className="min-w-36">
              <SelectValue placeholder={t("workspace.programme.compareA")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("workspace.programme.compareA")}</SelectItem>
              {chapterVersions.map((version) => (
                <SelectItem key={version.id} value={version.id}>
                  {version.reason || version.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={compareVersionB || "none"}
            onValueChange={(value) => setCompareVersionB(value === "none" ? "" : value)}
          >
            <SelectTrigger size="sm" className="min-w-36">
              <SelectValue placeholder={t("workspace.programme.compareB")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("workspace.programme.compareB")}</SelectItem>
              {chapterVersions.map((version) => (
                <SelectItem key={`b-${version.id}`} value={version.id}>
                  {version.reason || version.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !compareVersionA || !compareVersionB}
            onClick={() =>
              startTransition(async () => {
                const result = await compareArtefactVersions(workspaceId, compareVersionA, compareVersionB)
                if (result.error || !result.data) {
                  onMessage(result.error || t("workspace.programme.exportFailed"))
                  return
                }
                setVersionDiff(result.data.diff)
              })
            }
          >
            {t("workspace.programme.compareVersions")}
          </Button>
          {versionDiff.map((entry) => (
            <p key={entry.path} className="w-full">
              {entry.path}: {entry.before.slice(0, 80)} → {entry.after.slice(0, 80)}
            </p>
          ))}
        </div>
      )}
      {nodeMeasures.length > 0 && (
        <ul className="text-xs">
          {nodeMeasures.map((m) => (
            <li key={m.id}>• {m.title}</li>
          ))}
        </ul>
      )}
      <Textarea
        value={draftInstructions}
        onChange={(e) => setDraftInstructions(e.target.value)}
        rows={2}
        placeholder={t("workspace.programme.editorInstructionsPlaceholder")}
      />
      {groundednessScore != null && (
        <p className="text-xs text-muted-foreground">
          {t("workspace.programme.editorGroundednessScore", undefined, { score: String(groundednessScore) })}
        </p>
      )}
    </div>
  ) : null

  const outlineJump = useMemo(
    () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <List className="mr-2 h-4 w-4" />
            {t("workspace.programme.outlineTree")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
          {nodes.map((node) => (
            <DropdownMenuItem key={node.id} onClick={() => selectChapter(node.id, true)}>
              {node.title}
              {bodies[node.id]?.documentId || bindings.chapterDocuments?.[node.id] ? " · ✓" : ""}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, bodies, bindings.chapterDocuments, selectedId, content, workflowStatus, t],
  )

  const layoutToolbar = (
    <div className="flex flex-wrap items-center gap-1">
      <IconTooltip label={t("workspace.programme.zoomOut")}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => patchLayout({ scale: stepProgrammeScale(layout.scale, -1) })}
          disabled={layout.scale <= PROGRAMME_ZOOM_PRESETS[0]}
          aria-label={t("workspace.programme.zoomOut")}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-1.5 tabular-nums">
            <span>{Math.round(layout.scale * 100)}%</span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-fit min-w-0">
          {PROGRAMME_ZOOM_PRESETS.map((preset) => (
            <DropdownMenuItem key={preset} onSelect={() => patchLayout({ scale: preset })}>
              {Math.round(preset * 100)}%
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <IconTooltip label={t("workspace.programme.zoomIn")}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => patchLayout({ scale: stepProgrammeScale(layout.scale, 1) })}
          disabled={layout.scale >= PROGRAMME_ZOOM_PRESETS[PROGRAMME_ZOOM_PRESETS.length - 1]}
          aria-label={t("workspace.programme.zoomIn")}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <div className="mx-1 h-5 w-px bg-border" />
      <div className="flex rounded-md border p-0.5" role="group" aria-label={t("workspace.programme.layoutAria")}>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          variant={layout.wide ? "secondary" : "ghost"}
          onClick={() => patchLayout({ wide: true })}
        >
          {t("workspace.programme.layoutWide")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          variant={layout.wide ? "ghost" : "secondary"}
          onClick={() => patchLayout({ wide: false })}
        >
          {t("workspace.programme.layoutNarrow")}
        </Button>
      </div>
    </div>
  )

  const onPreviewClick = (event: MouseEvent, nodeId: string) => {
    const target = (event.target as HTMLElement).closest(`[${BLOCK_ID_ATTR}]`) as HTMLElement | null
    if (!target) return
    event.stopPropagation()
    const blockId = target.getAttribute(BLOCK_ID_ATTR)
    if (!blockId) return
    if (selectedId !== nodeId) selectChapter(nodeId)
    setActiveBlockId(blockId)
  }

  const addParagraphComment = () => {
    if (!documentId || !activeBlockId) {
      onMessage(t("workspace.programme.commentEmpty"))
      return
    }
    startTransition(async () => {
      const result = await addProgrammeComment({
        workspaceId,
        artefactType: "section",
        artefactId: paragraphArtefactId(documentId, activeBlockId),
        body: commentDraft,
      })
      setCommentDraft("")
      onMessage(result.error || t("workspace.programme.commentAdded"))
      refreshComments()
    })
  }

  useEffect(() => {
    const root = document.getElementById("programme-document-scroll")
    if (!root) return
    root.querySelectorAll(`[${BLOCK_ID_ATTR}]`).forEach((el) => {
      el.classList.toggle("bg-amber-50", el.getAttribute(BLOCK_ID_ATTR) === activeBlockId)
    })
  }, [activeBlockId, bodies, content, nodes])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 bg-white">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" id="programme-document-scroll">
      {!bindings.templateId ? (
        <div className="mx-auto w-full max-w-7xl space-y-2 px-8 py-8 md:px-14">
          <p className="text-sm">{t("workspace.programme.editorNeedOutline")} {t("workspace.programme.emptyNext.editor")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await ensureProgrammeOutline(workspaceId, spaceId)
                  if (result.error) {
                    onMessage(result.error)
                    return
                  }
                  if (result.data?.templateId) {
                    onBindingsChange({ ...bindings, templateId: result.data.templateId })
                    onMessage(t("workspace.programme.outlineReady"))
                  }
                })
              }
            >
              {t("workspace.programme.outlineEnsure")}
            </Button>
            <Button variant="outline" onClick={onGoOutline}>
              {t("workspace.programme.setupGoOutline")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-white px-4 py-1.5">
            {outlineJump}
            {layoutToolbar}
          </div>
          {nodes.length === 0 && (
            <p className="px-8 py-8 text-sm">{t("workspace.programme.outlineEmpty")}</p>
          )}
          <div
            className={`mx-auto w-full py-8 ${layout.wide ? "max-w-7xl px-8 md:px-14" : "max-w-3xl px-8"}`}
            style={{ zoom: layout.scale }}
          >
            <div className="space-y-10">
            {nodes.map((node) => {
              const body = bodies[node.id]
              const hasDoc = Boolean(body?.documentId || bindings.chapterDocuments?.[node.id])
              const isSelected = selectedId === node.id
              return (
                <article
                  key={node.id}
                  id={`chapter-${node.id}`}
                  className={`scroll-mt-8 space-y-3 ${isSelected ? "rounded-md ring-1 ring-border ring-offset-4" : ""}`}
                  onClick={() => {
                    if (!isSelected) selectChapter(node.id)
                  }}
                >
                  <h2 className="text-xl font-semibold tracking-tight">{node.title}</h2>
                  {hasDoc && body?.content ? (
                    <div
                      className="text-sm leading-relaxed text-foreground [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mb-2 [&_[data-block-id]]:cursor-pointer [&_[data-block-id]:hover]:bg-amber-50/70"
                      onClick={(event) => onPreviewClick(event, node.id)}
                      dangerouslySetInnerHTML={{
                        __html: ensureBlockIdsInHtml(isSelected ? content || body.content : body.content),
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("workspace.programme.editorNoDraft", undefined, { title: node.title })}
                    </p>
                  )}
                </article>
              )
            })}
            </div>
          </div>
        </>
      )}
      </div>
      {bindings.templateId ? (
        <ProgrammeCommentRail
          comments={railComments}
          activeBlockId={activeBlockId}
          draft={commentDraft}
          canComment={canComment}
          pending={pending}
          emptyHint={t("workspace.programme.commentEmpty")}
          addLabel={t("workspace.programme.addComment")}
          resolveLabel={t("workspace.programme.commentResolve")}
          reopenLabel={t("workspace.programme.commentReopen")}
          placeholder={t("workspace.programme.chapterCommentPlaceholder")}
          title={t("workspace.programme.chapterComments")}
          onDraftChange={setCommentDraft}
          onAdd={addParagraphComment}
          onSelect={(blockId, commentId) => {
            const comment = railComments.find((row) => row.id === commentId)
            if (comment?.documentId) {
              const node = nodes.find(
                (item) => (bodies[item.id]?.documentId ?? bindings.chapterDocuments?.[item.id]) === comment.documentId,
              )
              if (node) selectChapter(node.id, true)
            }
            setActiveBlockId(blockId)
            if (blockId) {
              window.requestAnimationFrame(() => {
                document
                  .querySelector(`[${BLOCK_ID_ATTR}="${CSS.escape(blockId)}"]`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              })
            }
          }}
          onToggleResolved={(commentId, resolved) => {
            startTransition(async () => {
              const result = await setProgrammeCommentResolved(workspaceId, commentId, resolved)
              if (result.error) onMessage(result.error)
              refreshComments()
            })
          }}
        />
      ) : null}
    </div>
  )
}
