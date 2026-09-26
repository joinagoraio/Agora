"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react"
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RichTextEditor } from "@/components/rich-text-editor"
import { useProgrammeTextHistory } from "@/components/programme-text-history"
import { useI18n } from "@/lib/i18n/use-i18n"
import { listProgrammeOutlineNodes } from "@/lib/actions/outline"
import {
  ensureChapterDocument,
  getChapterDocument,
  assessDocumentGroundedness,
  setChapterWorkflowStatus,
  listProgrammeChapters,
  assignChapterOwner,
  bindWorkspaceChapterAgent,
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
import {
  addProgrammeComment,
  deleteProgrammeComment,
  listProgrammeCommentThemes,
  listProgrammeComments,
  setProgrammeCommentResolved,
} from "@/lib/actions/comments"
import type { ColleagueCommentThemeRecord } from "@/lib/programme/colleague-comments"
import { UserAvatar } from "@/components/user-avatar"
import { IconTooltip } from "@/components/icon-tooltip"
import { ProgrammeInlineComments } from "@/components/programme-inline-comments"
import { ProgrammeA4Sheets, useProgrammeA4Pagination } from "@/components/programme-document-pages"
import { ProgrammeOutlineEditor } from "@/components/programme-outline-editor"
import { cn } from "@/lib/utils"
import { outlinePurposePlainText, boundChapterAgentId, type ProgrammeBindings, type ProgrammeOutlineNode } from "@/lib/programme/domain"
import { chapterListStatus, type ChapterWorkflowStatus } from "@/lib/programme/review-policy"
import { canAdministerProgramme, canWriteChapter } from "@/lib/programme/ownership"
import {
  programmeCommentRailClass,
  programmeDocumentCanvasClass,
  programmeDocumentColumnClass,
  programmeDocumentPageClass,
  PROGRAMME_DOCUMENT_CONTAINER_CLASS,
  programmeDocumentTypeStyle,
  programmeChapterProseClass,
  programmeChapterScrollTop,
  type ProgrammeDocumentLayout,
} from "@/lib/programme/document-layout"
import type { ProgrammeDocumentMode } from "@/lib/programme/document-mode"
import {
  clickClosesProgrammeChapterEditor,
  clickDismissesWritingChapter,
  visibleProgrammeChapterIds,
} from "@/lib/programme/document-mode"
import { renderProgrammeCitationHtml, type ProgrammeCitationSource } from "@/lib/programme/citation-display"
import { ProgrammeCitationTooltip } from "@/components/programme-citation-tooltip"
import { useBackgroundJob } from "@/components/programme-jobs-provider"
import { startChapterRegeneration } from "@/lib/actions/programme-jobs"
import { BLOCK_ID_ATTR, ensureBlockIdsInHtml, quoteFromBlock } from "@/lib/programme/block-id"
import { stripDuplicateChapterHeading } from "@/lib/programme/chapter-heading"
import {
  paragraphArtefactId,
  parseParagraphArtefactId,
  toAnchoredComment,
  type AnchoredProgrammeComment,
} from "@/lib/programme/comment-anchor"
import { AlertCircle, List, Loader2, Lock, MoreVertical, PencilLine, X } from "lucide-react"
import type { NotifyKind } from "@/lib/notify"

type ChapterBody = {
  documentId: string | null
  content: string
  workflowStatus: ChapterWorkflowStatus
  chapterOwnerId: string | null
}

type Props = {
  workspaceId: string
  spaceId: string
  bindings: ProgrammeBindings
  onBindingsChange: (bindings: ProgrammeBindings) => void
  onMessage: (message: string | null, kind?: NotifyKind) => void
  onGoOutline: () => void
  onShowDocument?: () => void
  structureOpen?: boolean
  canEditOutline?: boolean
  canComment?: boolean
  documentMode?: ProgrammeDocumentMode
  activeChapterId?: string | null
  focusChapterIds?: string[]
  onActivateChapter?: (chapterId: string | null) => void
  onWritableChaptersChange?: (chapters: Array<{ id: string; title: string }>) => void
  currentUserId?: string | null
  accessRole?: string | null
  documentOwnerId?: string | null
  reviewers?: Array<{ id: string; name: string; email: string }>
  draftAgents?: Array<{ id: string; name: string; stage: string; role: string }>
  onChapterOwnerChange?: () => void
  layout: ProgrammeDocumentLayout
  commentRefreshKey?: number
  /** Change to reload every chapter's text, for example after chapters were written in the background. */
  contentRefreshKey?: number
  /** Shown above the chapters, for example progress of writing them. */
  topSlot?: ReactNode
  workspaceName?: string
  citationSources?: ProgrammeCitationSource[]
}

export function ProgrammeChapterEditor({
  workspaceId,
  spaceId,
  bindings,
  onBindingsChange,
  onMessage,
  onGoOutline,
  onShowDocument,
  structureOpen = false,
  canEditOutline = true,
  canComment = true,
  documentMode = "read",
  activeChapterId = null,
  focusChapterIds = [],
  onActivateChapter,
  onWritableChaptersChange,
  currentUserId = null,
  accessRole = null,
  documentOwnerId = null,
  reviewers = [],
  draftAgents = [],
  onChapterOwnerChange,
  layout,
  commentRefreshKey = 0,
  contentRefreshKey = 0,
  topSlot = null,
  workspaceName = "",
  citationSources = [],
}: Props) {
  const { t } = useI18n()
  const labelledCitationSources = useMemo(
    () =>
      citationSources.map((source) => {
        const role = source.documentRole?.trim()
        const label = role && role !== "other" ? t(`workspace.programme.documentRoles.${role}`, "") : ""
        return label ? { ...source, label } : source
      }),
    [citationSources, t],
  )
  const textHistory = useProgrammeTextHistory()
  const applyingHistoryRef = useRef(false)
  const dirtyIdsRef = useRef(new Set<string>())
  const selectedIdRef = useRef<string | null>(null)
  const pendingJumpRef = useRef<string | null>(null)
  const dismissWritingChapterRef = useRef<() => void>(() => {})
  const pointerDownInChromeRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef("")
  const documentIdRef = useRef<string | null>(null)
  const lockHolderRef = useRef<string | null>(null)
  const workflowStatusRef = useRef<ChapterWorkflowStatus>("generated")
  const chapterOwnerIdRef = useRef<string | null>(null)
  const bodiesRef = useRef<Record<string, ChapterBody>>({})
  const sayResult = (error: string | null | undefined, success: string) => {
    if (error) onMessage(error, "error")
    else onMessage(success)
  }
  const [nodes, setNodes] = useState<ProgrammeOutlineNode[]>([])
  const [outlineLoading, setOutlineLoading] = useState(Boolean(bindings.templateId))
  const [creatingNodeId, setCreatingNodeId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bodies, setBodies] = useState<Record<string, ChapterBody>>({})
  const [content, setContent] = useState("")
  const [dirty, setDirty] = useState(false)
  const [draftInstructions, setDraftInstructions] = useState("")
  const [groundedness, setGroundedness] = useState<{ found: number; total: number; uncited: number } | null>(null)
  const [pending, startTransition] = useTransition()
  const [nodeMeasures, setNodeMeasures] = useState<any[]>([])
  const [lockHolder, setLockHolder] = useState<string | null>(null)
  const [workflowStatus, setWorkflowStatus] = useState<ChapterWorkflowStatus>("generated")
  const [showHistory, setShowHistory] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [chapterVersions, setChapterVersions] = useState<Array<{ id: string; reason: string | null; created_at: string }>>([])
  const [restoreReason, setRestoreReason] = useState("")
  const [compareVersionA, setCompareVersionA] = useState("")
  const [compareVersionB, setCompareVersionB] = useState("")
  const [versionDiff, setVersionDiff] = useState<Array<{ path: string; before: string; after: string }>>([])
  const [alsoOpen, setAlsoOpen] = useState<Array<{ name: string; avatarUrl: string | null }>>([])
  const [commentDraft, setCommentDraft] = useState("")
  const [commentPending, setCommentPending] = useState(false)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [commentNodeId, setCommentNodeId] = useState<string | null>(null)
  const [railComments, setRailComments] = useState<AnchoredProgrammeComment[]>([])
  const [commentThemes, setCommentThemes] = useState<ColleagueCommentThemeRecord[]>([])

  useEffect(() => {
    if (layout.showComments) return
    setActiveBlockId(null)
    setCommentNodeId(null)
  }, [layout.showComments])

  const selected = nodes.find((n) => n.id === selectedId) || null
  selectedIdRef.current = selectedId
  const documentId = selectedId ? bodies[selectedId]?.documentId ?? bindings.chapterDocuments?.[selectedId] ?? null : null
  const isWriting = documentMode === "edit" || documentMode === "focus"
  const chapterOwnerId = selectedId ? bodies[selectedId]?.chapterOwnerId ?? null : null
  const chapterAgentId = selectedId ? boundChapterAgentId(bindings, selectedId) : null
  contentRef.current = content
  documentIdRef.current = documentId
  lockHolderRef.current = lockHolder
  workflowStatusRef.current = workflowStatus
  chapterOwnerIdRef.current = chapterOwnerId
  bodiesRef.current = bodies
  const canWriteNode = (nodeId: string) =>
    canWriteChapter({
      actorId: currentUserId,
      accessRole,
      documentOwnerId,
      chapterOwnerId: bodies[nodeId]?.chapterOwnerId ?? null,
    })
  const canAssignOwners = canAdministerProgramme({
    actorId: currentUserId,
    accessRole,
    documentOwnerId,
  })
  const writableChapterList = nodes
    .filter((node) => canWriteNode(node.id))
    .map((node) => ({ id: node.id, title: node.title }))
  const visibleIds = visibleProgrammeChapterIds({
    mode: documentMode,
    allIds: nodes.map((item) => item.id),
    writableIds: writableChapterList.map((chapter) => chapter.id),
    focusIds: focusChapterIds,
  })
  const displayNodes = nodes.filter((node) => visibleIds.includes(node.id))
  const jumpNodes = structureOpen ? nodes : displayNodes

  useEffect(() => {
    onWritableChaptersChange?.(writableChapterList)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, bodies, currentUserId, accessRole, documentOwnerId, documentMode])

  const loadNodes = (templateId: string) => {
    setOutlineLoading(true)
    void (async () => {
      try {
        const result = await listProgrammeOutlineNodes(templateId)
        if (result.error) {
          onMessage(result.error, "error")
          return
        }
        const listed = await listProgrammeChapters(workspaceId)
        const nextBodies: Record<string, ChapterBody> = {}
        for (const chapter of listed.data || []) {
          if (!chapter.outlineNodeId) continue
          nextBodies[chapter.outlineNodeId] = {
            documentId: chapter.documentId,
            content: ensureBlockIdsInHtml(chapter.content || ""),
            workflowStatus: (chapter.workflowStatus as ChapterWorkflowStatus) || "generated",
            chapterOwnerId: chapter.chapterOwnerId ?? null,
          }
        }
        setBodies(nextBodies)
        setNodes(result.data)
        const preferredId =
          (activeChapterId && result.data.some((node) => node.id === activeChapterId) && activeChapterId) ||
          (selectedId && result.data.some((node) => node.id === selectedId) ? selectedId : null)
        if (preferredId) {
          setSelectedId(preferredId)
          const body = nextBodies[preferredId]
          if (body) {
            setContent(body.content)
            setWorkflowStatus(body.workflowStatus)
          }
        } else {
          setSelectedId(null)
        }
        for (const [chapterId, body] of Object.entries(nextBodies)) {
          textHistory.prime(chapterId, body.content)
        }
      } catch (error) {
        onMessage(error instanceof Error ? error.message : t("workspace.programme.editorLoadError"), "error")
      } finally {
        setOutlineLoading(false)
      }
    })()
  }

  useEffect(() => {
    if (bindings.templateId) loadNodes(bindings.templateId)
    else {
      setNodes([])
      setOutlineLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindings.templateId, workspaceId, contentRefreshKey])

  useEffect(() => {
    void listProgrammeMeasures(workspaceId).then((listed) => {
      setNodeMeasures((listed.data || []).filter((m: { outline_node_id?: string }) => m.outline_node_id === selectedId))
    })
  }, [selectedId, workspaceId])

  useEffect(() => {
    if (!activeChapterId || !isWriting || !canWriteNode(activeChapterId)) return
    const key = `chapter:${activeChapterId}`
    void (async () => {
      const lock = await acquireSectionLock(workspaceId, key)
      if (lock.error) {
        const holder = await getSectionLockHolder(workspaceId, key)
        setLockHolder(holder.data ? `${lock.error}: ${holder.data.name}` : lock.error)
      } else setLockHolder(null)
      await heartbeatSectionPresence(workspaceId, key)
      const presence = await listSectionPresence(workspaceId, key)
      setAlsoOpen((presence.data || []).map((row) => ({ name: row.name, avatarUrl: row.avatarUrl })))
    })()
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
      setLockHolder(null)
      setAlsoOpen([])
    }
  }, [activeChapterId, workspaceId, isWriting, currentUserId, accessRole, documentOwnerId, bodies])

  const markChapterDirty = (chapterId: string) => {
    dirtyIdsRef.current.add(chapterId)
    if (selectedIdRef.current === chapterId) setDirty(true)
  }

  const clearChapterDirty = (chapterId: string) => {
    dirtyIdsRef.current.delete(chapterId)
    if (selectedIdRef.current === chapterId) setDirty(false)
  }

  const persistChapter = (input: { chapterId: string; documentId: string; html: string; warnIfLocked?: boolean }) => {
    if (!input.documentId || lockHolderRef.current) {
      if (input.warnIfLocked && lockHolderRef.current) onMessage(lockHolderRef.current, "warning")
      return
    }
    startTransition(async () => {
      const result = await updateWorkspaceDocument(workspaceId, input.documentId, { content: input.html })
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      const latestHtml =
        input.chapterId === selectedIdRef.current
          ? contentRef.current
          : bodiesRef.current[input.chapterId]?.content ?? input.html
      if (latestHtml === input.html) {
        clearChapterDirty(input.chapterId)
        if (input.chapterId === selectedIdRef.current) textHistory.prime(input.chapterId, input.html)
      }
      setBodies((prev) => ({
        ...prev,
        [input.chapterId]: {
          documentId: input.documentId,
          content: latestHtml,
          workflowStatus: prev[input.chapterId]?.workflowStatus ?? workflowStatusRef.current,
          chapterOwnerId: prev[input.chapterId]?.chapterOwnerId ?? chapterOwnerIdRef.current,
        },
      }))
      if (latestHtml !== input.html) scheduleChapterSave(input.chapterId)
    })
  }

  const flushChapterSave = (chapterId: string | null, warnIfLocked = false) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (!chapterId || !dirtyIdsRef.current.has(chapterId)) return
    const docId =
      chapterId === selectedIdRef.current
        ? documentIdRef.current
        : bodiesRef.current[chapterId]?.documentId ?? null
    const html = chapterId === selectedIdRef.current ? contentRef.current : bodiesRef.current[chapterId]?.content
    if (!docId || html == null) return
    persistChapter({ chapterId, documentId: docId, html, warnIfLocked })
  }

  const scheduleChapterSave = (chapterId: string) => {
    markChapterDirty(chapterId)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => flushChapterSave(chapterId), 800)
  }

  const selectChapter = (nodeId: string, scroll = false) => {
    if (selectedId && selectedId !== nodeId) {
      flushChapterSave(selectedId)
      setBodies((prev) => ({
        ...prev,
        [selectedId]: {
          documentId: prev[selectedId]?.documentId ?? documentId,
          content,
          workflowStatus,
          chapterOwnerId: prev[selectedId]?.chapterOwnerId ?? null,
        },
      }))
    }
    setSelectedId(nodeId)
    const cached = bodies[nodeId]
    setContent(cached?.content || "")
    setWorkflowStatus(cached?.workflowStatus || "generated")
    setDirty(dirtyIdsRef.current.has(nodeId))
    setShowHistory(false)
    textHistory.prime(nodeId, cached?.content || "")
    if (scroll) {
      window.setTimeout(() => {
        const scroller = document.getElementById("programme-document-scroll")
        const target = document.getElementById(`chapter-${nodeId}`)
        if (!scroller || !target) return
        scroller.scrollTo({
          top: programmeChapterScrollTop(
            scroller.scrollTop,
            scroller.getBoundingClientRect().top,
            target.getBoundingClientRect().top,
          ),
        })
      }, 0)
    }
  }

  useEffect(() => {
    const applyRevision = (revision: { chapterId: string; before: string; after: string }, direction: "undo" | "redo") => {
      const html = direction === "undo" ? revision.before : revision.after
      applyingHistoryRef.current = true
      setBodies((prev) => ({
        ...prev,
        [revision.chapterId]: {
          documentId: prev[revision.chapterId]?.documentId ?? null,
          content: html,
          workflowStatus: prev[revision.chapterId]?.workflowStatus ?? "generated",
          chapterOwnerId: prev[revision.chapterId]?.chapterOwnerId ?? null,
        },
      }))
      markChapterDirty(revision.chapterId)
      scheduleChapterSave(revision.chapterId)
      if (selectedIdRef.current === revision.chapterId) setContent(html)
      window.setTimeout(() => {
        applyingHistoryRef.current = false
      }, 0)
    }
    textHistory.registerApplier(applyRevision)
    return () => textHistory.registerApplier(null)
  }, [textHistory])

  useEffect(() => {
    if (structureOpen) return
    const id = pendingJumpRef.current
    if (!id) return
    pendingJumpRef.current = null
    window.requestAnimationFrame(() => selectChapter(id, true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureOpen])

  useEffect(() => {
    if (structureOpen || !activeChapterId || nodes.length === 0) return
    if (activeChapterId !== selectedId) selectChapter(activeChapterId, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapterId, nodes.length, structureOpen])

  const openOrCreate = (node: ProgrammeOutlineNode) => {
    setCreatingNodeId(node.id)
    startTransition(async () => {
      try {
      const result = await ensureChapterDocument(workspaceId, node.id, {
        title: node.title,
        purposeHtml: node.purpose,
      })
      if (result.error || !result.data) {
        onMessage(result.error || t("workspace.programme.editorLoadError"), "error")
        return
      }
      const nextBody: ChapterBody = {
        documentId: result.data.documentId,
        content: result.data.content || "",
        workflowStatus: "generated",
        chapterOwnerId: documentOwnerId,
      }
      setBodies((prev) => ({ ...prev, [node.id]: nextBody }))
      setContent(nextBody.content)
      setWorkflowStatus("generated")
      clearChapterDirty(node.id)
      textHistory.prime(node.id, nextBody.content)
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
      } finally {
        setCreatingNodeId(null)
      }
    })
  }

  const loadExisting = (nodeId: string, docId: string) => {
    void (async () => {
      const result = await getChapterDocument(workspaceId, docId)
      if (result.error || !result.data) {
        onMessage(result.error || t("workspace.programme.editorLoadError"), "error")
        return
      }
      const nextBody: ChapterBody = {
        documentId: result.data.documentId,
        content: ensureBlockIdsInHtml(result.data.content),
        workflowStatus: result.data.workflowStatus || "generated",
        chapterOwnerId: result.data.chapterOwnerId ?? null,
      }
      setBodies((prev) => ({ ...prev, [nodeId]: nextBody }))
      if (selectedId === nodeId) {
        setContent(ensureBlockIdsInHtml(result.data.content))
        setWorkflowStatus(result.data.workflowStatus || "generated")
        clearChapterDirty(nodeId)
      }
      textHistory.prime(nodeId, nextBody.content)
    })()
  }

  const refreshComments = () => {
    void (async () => {
      const [listed, themes] = await Promise.all([
        listProgrammeComments(workspaceId),
        listProgrammeCommentThemes(workspaceId),
      ])
      const chapters = nodes.map((node) => ({
        documentId: bodies[node.id]?.documentId ?? bindings.chapterDocuments?.[node.id] ?? null,
        title: node.title,
      }))
      setRailComments(
        (listed.data || [])
          .map((row) => toAnchoredComment(row, chapters, quoteForComment(row.artefact_id)))
          .filter((row): row is AnchoredProgrammeComment => Boolean(row)),
      )
      setCommentThemes(themes.data || [])
    })()
  }

  const quoteForComment = (artefactId: string) => {
    const parsed = parseParagraphArtefactId(artefactId)
    if (!parsed) return ""
    return quoteFromBlock(document.getElementById("programme-document-scroll"), parsed.blockId)
  }

  useEffect(() => {
    if (!selectedId) {
      if (activeChapterId) return
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
      textHistory.prime(selectedId, cached.content)
    } else {
      setContent("")
    }
    setDirty(dirtyIdsRef.current.has(selectedId))
    setShowHistory(false)
    if (docId && !cached) loadExisting(selectedId, docId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, activeChapterId])

  useEffect(() => {
    if (nodes.length === 0) return
    refreshComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, nodes, bodies, commentRefreshKey])

  const chapterJob = useBackgroundJob("chapter", (job) => {
    if (job.status !== "done") {
      onMessage(job.error || t("workspace.programme.editorLoadError"), "error")
      return
    }
    const nodeId = job.progress.targetId
    const docId = nodeId ? bodies[nodeId]?.documentId || bindings.chapterDocuments?.[nodeId] : null
    if (nodeId && docId) {
      void (async () => {
        const reloaded = await getChapterDocument(workspaceId, docId)
        if (!reloaded.data) return
        const nextContent = reloaded.data.content
        if (selectedId === nodeId) {
          textHistory.recordImmediate(nodeId, content, nextContent)
          setContent(nextContent)
          clearChapterDirty(nodeId)
          setWorkflowStatus("generated")
        }
        setBodies((prev) => ({
          ...prev,
          [nodeId]: {
            documentId: docId,
            content: nextContent,
            workflowStatus: "generated",
            chapterOwnerId: prev[nodeId]?.chapterOwnerId ?? null,
          },
        }))
      })()
    }
    const result = job.progress.result
    const summary = result
      ? { found: Number(result.found ?? 0), total: Number(result.total ?? 0), uncited: Number(result.uncited ?? 0) }
      : null
    setGroundedness(summary)
    onMessage(
      summary
        ? t("workspace.programme.editorRegenDone", undefined, {
            found: String(summary.found),
            total: String(summary.total),
            uncited: String(summary.uncited),
          })
        : t("workspace.programme.editorRegenDoneNoCheck"),
    )
  })
  const writingNodeId = chapterJob.running ? chapterJob.job?.progress.targetId ?? null : null

  const regenerateChapter = () => {
    if (!selected || !documentId || pending || chapterJob.running) return
    startTransition(async () => {
      const result = await startChapterRegeneration(workspaceId, selected.id, {
        documentId,
        title: selected.title,
        instructions:
          draftInstructions.trim() ||
          selected.instructions ||
          t("workspace.programme.editorDefaultInstructions", undefined, { title: selected.title }),
      })
      if (result.error || !result.data) {
        onMessage(result.error || t("workspace.programme.editorLoadError"), "error")
        return
      }
      chapterJob.watch(result.data)
      onMessage(t("workspace.programme.editorRegenStarted", undefined, { title: selected.title }), "info")
    })
  }

  const checkGroundedness = () => {
    if (!documentId || pending) return
    startTransition(async () => {
      const result = await assessDocumentGroundedness(workspaceId, documentId)
      if (result.error || !result.data) {
        onMessage(result.error || t("workspace.programme.editorLoadError"), "error")
        return
      }
      const summary = {
        found: result.data.verifiedCount ?? 0,
        total: result.data.citationCount ?? 0,
        uncited: result.data.issues.filter((issue: { reason: string }) => issue.reason === "missing_citation").length,
      }
      setGroundedness(summary)
      onMessage(
        t("workspace.programme.editorGroundedness", undefined, {
          found: String(summary.found),
          total: String(summary.total),
          uncited: String(summary.uncited),
        }),
      )
    })
  }

  const setChapterStatus = (status: ChapterWorkflowStatus, successKey: string) => {
    if (!documentId || pending) return
    startTransition(async () => {
      const result = await setChapterWorkflowStatus(workspaceId, documentId, status)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      setWorkflowStatus(status)
      onMessage(t(successKey))
      onChapterOwnerChange?.()
    })
  }

  const assignOwner = (value: string | null) => {
    if (!documentId || pending) return
    startTransition(async () => {
      const result = await assignChapterOwner(workspaceId, documentId, value)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      if (!selected) return
      setBodies((prev) => ({
        ...prev,
        [selected.id]: {
          documentId,
          content,
          workflowStatus,
          chapterOwnerId: value,
        },
      }))
      onMessage(t("workspace.programme.ownerSaved"))
      onChapterOwnerChange?.()
    })
  }

  const assignChapterAgent = (agentId: string | null) => {
    if (!selectedId || pending) return
    startTransition(async () => {
      const result = await bindWorkspaceChapterAgent(workspaceId, selectedId, agentId)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      if (result.data) onBindingsChange(result.data)
      onMessage(t("workspace.programme.chapterAgentSaved"))
    })
  }

  const openHistory = () => {
    if (!documentId || pending) return
    startTransition(async () => {
      const listed = await listArtefactVersions(workspaceId, "document", documentId)
      setChapterVersions(listed.data || [])
      setRestoreReason("")
      setCompareVersionA("")
      setCompareVersionB("")
      setVersionDiff([])
      setShowHistory(true)
    })
  }

  const restoreVersion = (versionId: string) => {
    if (!selected || !documentId || pending || !restoreReason.trim()) return
    startTransition(async () => {
      const result = await restoreArtefactVersion(workspaceId, versionId, restoreReason)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      const reloaded = await getChapterDocument(workspaceId, documentId)
      if (reloaded.data) {
        const nextContent = reloaded.data.content
        textHistory.recordImmediate(selected.id, content, nextContent)
        setContent(nextContent)
        setWorkflowStatus(reloaded.data.workflowStatus || "generated")
        clearChapterDirty(selected.id)
        setBodies((prev) => ({
          ...prev,
          [selected.id]: {
            documentId,
            content: nextContent,
            workflowStatus: reloaded.data.workflowStatus || "generated",
            chapterOwnerId,
          },
        }))
      }
      onMessage(t("workspace.programme.restoreDone"))
    })
  }

  const runCompare = () => {
    if (!compareVersionA || !compareVersionB || pending) return
    startTransition(async () => {
      const result = await compareArtefactVersions(workspaceId, compareVersionA, compareVersionB)
      if (result.error || !result.data) {
        onMessage(result.error || t("workspace.programme.exportFailed"), "error")
        return
      }
      setVersionDiff(result.data.diff)
    })
  }

  useEffect(() => {
    if (isWriting) return
    flushChapterSave(selectedIdRef.current)
  }, [isWriting])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      const chapterId = selectedIdRef.current
      if (!chapterId || !dirtyIdsRef.current.has(chapterId) || !documentIdRef.current) return
      void updateWorkspaceDocument(workspaceId, documentIdRef.current, { content: contentRef.current })
    }
  }, [workspaceId])

  useEffect(() => {
    if (!isWriting) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return
      const target = event.target as HTMLElement | null
      if (target?.closest("[data-programme-comments], input, textarea") && !target.closest(".ProseMirror")) return
      event.preventDefault()
      flushChapterSave(selectedIdRef.current, true)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isWriting])

  const chapterToolsMenu = selected ? (
    <div className="absolute top-0 right-0 flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {lockHolder ? (
        <IconTooltip label={lockHolder}>
          <span className="inline-flex text-destructive" aria-label={lockHolder}>
            <AlertCircle className="h-4 w-4" />
          </span>
        </IconTooltip>
      ) : null}
      {alsoOpen.length > 0 ? (
        <span className="flex -space-x-1">
          {alsoOpen.map((person) => (
            <IconTooltip key={`${person.name}-${person.avatarUrl || "none"}`} label={person.name}>
              <UserAvatar name={person.name} url={person.avatarUrl} className="h-5 w-5 ring-2 ring-background" />
            </IconTooltip>
          ))}
        </span>
      ) : null}
      {dirty && !lockHolder ? (
        <span className="text-xs text-muted-foreground">{t("workspace.programme.editorSaving")}</span>
      ) : null}
      <DropdownMenu>
        <IconTooltip label={t("workspace.programme.chapterTools")}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("workspace.programme.chapterTools")}
              data-guidance-target="chapter-tools"
              className="relative"
            >
              <MoreVertical className="h-4 w-4" />
              {dirty ? <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> : null}
            </Button>
          </DropdownMenuTrigger>
        </IconTooltip>
        <DropdownMenuContent align="end" className="w-64" data-programme-chapter-tools="">
          <DropdownMenuLabel>
            {t("workspace.programme.chapterStatus", undefined, {
              status: t(`workspace.programme.chapterListStatus.${workflowStatus}`),
            })}
          </DropdownMenuLabel>
          {canAssignOwners && documentId ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t("workspace.programme.chapterOwner")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => assignOwner(null)}>
                  {t("workspace.programme.ownerUnassigned")}
                </DropdownMenuItem>
                {reviewers.map((reviewer) => (
                  <DropdownMenuItem
                    key={reviewer.id}
                    onSelect={() => assignOwner(reviewer.id)}
                    className={chapterOwnerId === reviewer.id ? "bg-accent" : undefined}
                  >
                    {reviewer.name}
                    {reviewer.id === currentUserId ? ` (${t("workspace.programme.reviewerYou")})` : ""}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          {draftAgents.length > 0 && selectedId ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t("workspace.programme.chapterAgent")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => assignChapterAgent(null)}>
                  {t("workspace.programme.chapterAgentDefault")}
                </DropdownMenuItem>
                {draftAgents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onSelect={() => assignChapterAgent(agent.id)}
                    className={chapterAgentId === agent.id ? "bg-accent" : undefined}
                  >
                    {agent.name}
                    <span className="ml-1 text-xs text-muted-foreground">({t(`space.agents.stages.${agent.stage}`)})</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={pending || !documentId} onSelect={() => regenerateChapter()} data-guidance-target="regenerate-chapter">
            {t("workspace.programme.editorRegenStrict")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending || !documentId} onSelect={() => checkGroundedness()}>
            {t("workspace.programme.editorCheckGroundedness")}
          </DropdownMenuItem>
          {(workflowStatus === "generated" || workflowStatus === "revised") ? (
            <DropdownMenuItem disabled={pending || !documentId} onSelect={() => setChapterStatus("in_review", "workspace.programme.chapterReviewRequested")}>
              {t("workspace.programme.requestReview")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={pending || !documentId || workflowStatus === "generated"}
            onSelect={() => setChapterStatus("revised", "workspace.programme.chapterChangesRequested")}
          >
            {t("workspace.programme.requestChanges")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending || !documentId || workflowStatus === "generated"}
            onSelect={() => setChapterStatus("approved", "workspace.programme.chapterApproved")}
          >
            {t("workspace.programme.approveChapter")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={pending || !documentId} onSelect={() => openHistory()}>
            {t("workspace.programme.history")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setInstructionsOpen(true)}>
            {t("workspace.programme.editorNodeInstructions")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : null

  const outlineJump = useMemo(
    () => (
      <DropdownMenu>
        <IconTooltip label={t("workspace.programme.outlineTree")} side="right">
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("workspace.programme.outlineTree")}
            >
              <List className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </IconTooltip>
        <DropdownMenuContent
          align="start"
          side="right"
          className="flex max-h-80 flex-col overflow-hidden"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="min-h-0 overflow-y-auto">
            {jumpNodes.map((node) => {
              const status = chapterListStatus({
                hasDocument: Boolean(bodies[node.id]?.documentId || bindings.chapterDocuments?.[node.id]),
                workflowStatus: selectedId === node.id ? workflowStatus : bodies[node.id]?.workflowStatus,
              })
              return (
                <DropdownMenuItem
                  key={node.id}
                  className="justify-between gap-3"
                  onSelect={() => {
                    if (structureOpen) {
                      pendingJumpRef.current = node.id
                      onShowDocument?.()
                    }
                    selectChapter(node.id, true)
                  }}
                >
                  <span className="min-w-0 truncate">{node.title}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {status === "approved" ? <Lock className="h-3 w-3" aria-hidden /> : null}
                    {t(`workspace.programme.chapterListStatus.${status}`)}
                  </span>
                </DropdownMenuItem>
              )
            })}
          </div>
          {jumpNodes.length > 0 ? <DropdownMenuSeparator className="shrink-0" /> : null}
          <div className="shrink-0">
            {structureOpen ? (
              <DropdownMenuItem onSelect={() => onShowDocument?.()}>
                {t("workspace.programme.outlineShowDocument")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onGoOutline()}>
                {t("workspace.programme.outlineEditStructure")}
              </DropdownMenuItem>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jumpNodes, bodies, bindings.chapterDocuments, selectedId, content, workflowStatus, isWriting, currentUserId, accessRole, documentOwnerId, structureOpen, t],
  )

  const closeChapterEditor = () => {
    if (!activeChapterId) return
    const editingId = activeChapterId
    flushChapterSave(editingId)
    const html = editingId === selectedIdRef.current ? contentRef.current : bodiesRef.current[editingId]?.content
    if (html != null) {
      setBodies((prev) => ({
        ...prev,
        [editingId]: {
          documentId: prev[editingId]?.documentId ?? (editingId === selectedIdRef.current ? documentIdRef.current : null),
          content: html,
          workflowStatus: prev[editingId]?.workflowStatus ?? workflowStatusRef.current,
          chapterOwnerId: prev[editingId]?.chapterOwnerId ?? null,
        },
      }))
    }
    onActivateChapter?.(null)
  }
  dismissWritingChapterRef.current = closeChapterEditor

  useEffect(() => {
    if (!isWriting || !activeChapterId) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
      if (!target) return
      const isEditorChrome = Boolean(
        target.closest(
          "[data-programme-comments], [data-programme-outline-jump], [data-programme-format-menu], [data-programme-chapter-tools], [role='menu'], [role='dialog'], [data-radix-popper-content-wrapper]",
        ),
      )
      pointerDownInChromeRef.current = isEditorChrome
      if (isEditorChrome) return
      const clickedChapterId = target.closest("[data-chapter-id]")?.getAttribute("data-chapter-id") ?? null
      const isWritingControl = Boolean(
        target.closest("button, a, input, textarea, select, [contenteditable='true'], .ProseMirror"),
      )
      if (
        !clickDismissesWritingChapter({
          activeChapterId,
          clickedChapterId,
          isEditorChrome,
          isWritingControl,
        })
      ) {
        return
      }
      dismissWritingChapterRef.current()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [isWriting, activeChapterId])

  const onPreviewClick = (event: MouseEvent, nodeId: string) => {
    if (!layout.showComments) return
    const target = (event.target as HTMLElement).closest(`[${BLOCK_ID_ATTR}]`) as HTMLElement | null
    if (!target) return
    const blockId = target.getAttribute(BLOCK_ID_ATTR)
    if (!blockId) return
    setActiveBlockId(blockId)
    setCommentNodeId(nodeId)
  }

  const clearChapterFocus = (event: MouseEvent<HTMLElement>) => {
    if (pointerDownInChromeRef.current) {
      pointerDownInChromeRef.current = false
      return
    }
    const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
    if (!target) return
    const clickedChapterId = target.closest("[data-chapter-id]")?.getAttribute("data-chapter-id") ?? null
    const isEditorChrome = Boolean(
      target.closest("[data-programme-comments], [data-programme-outline-jump], [data-programme-format-menu]"),
    )
    const isWritingControl = Boolean(
      target.closest("button, a, input, textarea, select, [contenteditable='true'], .ProseMirror"),
    )
    if (
      isWriting &&
      clickDismissesWritingChapter({
        activeChapterId,
        clickedChapterId,
        isEditorChrome,
        isWritingControl,
      })
    ) {
      closeChapterEditor()
    } else if (clickClosesProgrammeChapterEditor({ activeChapterId, clickedChapterId, isEditorChrome })) {
      closeChapterEditor()
    }
    if (target.closest("[data-chapter-id], [data-programme-comments], [data-programme-outline-jump], [data-programme-format-menu]")) {
      return
    }
    if (!selectedId && !activeBlockId) return
    if (!isWriting) setSelectedId(null)
    setActiveBlockId(null)
    setCommentNodeId(null)
  }

  const addParagraphComment = () => {
    const targetNodeId = commentNodeId || selectedId
    const targetDocumentId = targetNodeId
      ? bodies[targetNodeId]?.documentId ?? bindings.chapterDocuments?.[targetNodeId] ?? null
      : documentId
    if (!layout.showComments || !commentDraft.trim()) return
    if (!targetDocumentId || !activeBlockId) {
      onMessage(t("workspace.programme.commentEmpty"), "warning")
      return
    }
    const body = commentDraft.trim()
    setCommentDraft("")
    setCommentPending(true)
    void (async () => {
      const result = await addProgrammeComment({
        workspaceId,
        artefactType: "section",
        artefactId: paragraphArtefactId(targetDocumentId, activeBlockId),
        body,
      })
      sayResult(result.error, t("workspace.programme.commentAdded"))
      refreshComments()
      setCommentPending(false)
    })()
  }

  const replyToComment = (parentId: string, body: string) => {
    setCommentPending(true)
    void (async () => {
      const result = await addProgrammeComment({
        workspaceId,
        artefactType: "section",
        artefactId: activeBlockId && documentId ? paragraphArtefactId(documentId, activeBlockId) : parentId,
        body,
        parentId,
      })
      sayResult(result.error, t("workspace.programme.commentReplyAdded"))
      refreshComments()
      setCommentPending(false)
    })()
  }

  useEffect(() => {
    const root = document.getElementById("programme-document-scroll")
    if (!root) return
    root.querySelectorAll(`[${BLOCK_ID_ATTR}]`).forEach((el) => {
      el.classList.toggle(
        "bg-amber-50",
        layout.showComments && el.getAttribute(BLOCK_ID_ATTR) === activeBlockId,
      )
    })
  }, [activeBlockId, bodies, content, nodes, layout.showComments])

  const paginationKey = `${layout.paged}-${layout.scale}-${layout.showComments}-${displayNodes.length}-${documentMode}-${activeChapterId || ""}`
  const { pageCount, pageStarts } = useProgrammeA4Pagination(layout.paged, paginationKey)
  const dimSiblingChapters = isWriting && Boolean(activeChapterId) && displayNodes.length > 1

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-1", programmeDocumentCanvasClass({ paged: layout.paged && !structureOpen }))}>
      <ProgrammeCitationTooltip />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" id="programme-document-scroll" onClick={clearChapterFocus}>
      {structureOpen ? (
        <>
          <div className="pointer-events-none sticky top-0 z-20 h-0" data-programme-outline-jump>
            <div className="pointer-events-auto absolute top-8 left-8 flex items-center gap-2">
              {outlineJump}
              <Button type="button" variant="outline" size="sm" onClick={() => onShowDocument?.()}>
                <X className="h-4 w-4" />
                {t("workspace.programme.outlineCloseStructure")}
              </Button>
            </div>
          </div>
          <div className={PROGRAMME_DOCUMENT_CONTAINER_CLASS}>
          <div
            id="programme-document-page"
            className={programmeDocumentPageClass({ ...layout, paged: false })}
            data-programme-document-page="continuous"
            data-programme-structure=""
          >
            <div className={programmeDocumentColumnClass({ ...layout, paged: false })}>
              <div data-programme-document-type className="relative z-[1]" style={programmeDocumentTypeStyle(layout.scale)}>
                <ProgrammeOutlineEditor
                  workspaceId={workspaceId}
                  spaceId={spaceId}
                  templateId={bindings.templateId ?? null}
                  canEdit={canEditOutline}
                  onTemplateBound={(templateId) => onBindingsChange({ ...bindings, templateId })}
                  onNodesChange={setNodes}
                  onMessage={(message, kind) => onMessage(message, kind)}
                />
              </div>
            </div>
          </div>
          </div>
        </>
      ) : !bindings.templateId ? (
        <div className="h-full min-h-0 flex-1" />
      ) : (
        <>
          {nodes.length === 0 && (
            <p className="px-8 py-8 text-sm">
              {outlineLoading ? t("workspace.programme.outlineLoading") : t("workspace.programme.outlineEmpty")}
            </p>
          )}
          {nodes.length > 0 && displayNodes.length === 0 && documentMode === "focus" ? (
            <p className="px-8 py-8 text-sm">{t("workspace.programme.focusEmpty")}</p>
          ) : null}
          <div className="pointer-events-none sticky top-0 z-20 h-0" data-programme-outline-jump>
            <div className="pointer-events-auto absolute top-8 left-8 flex items-center gap-2">
              {outlineJump}
            </div>
          </div>
          <div className={PROGRAMME_DOCUMENT_CONTAINER_CLASS}>
          <div
            id="programme-document-page"
            className={programmeDocumentPageClass(layout)}
            data-programme-document-page={layout.paged ? "a4" : "continuous"}
          >
            <div className={programmeDocumentColumnClass(layout)}>
            {layout.paged ? (
              <ProgrammeA4Sheets
                pageCount={pageCount}
                pageStarts={pageStarts}
                programmeName={workspaceName}
                chrome={layout.pageChrome}
              />
            ) : null}
            <div data-programme-document-type className="relative z-[1]" style={programmeDocumentTypeStyle(layout.scale)}>
            {topSlot}
            {displayNodes.map((node) => {
              const body = bodies[node.id]
              const hasDoc = Boolean(body?.documentId || bindings.chapterDocuments?.[node.id])
              const chapterDocumentId = body?.documentId || bindings.chapterDocuments?.[node.id] || undefined
              const isSelected = selectedId === node.id
              const isActiveChapter = activeChapterId === node.id
              const canWriteThis = canWriteNode(node.id)
              const showEditor = isWriting && isActiveChapter && canWriteThis
              const isInactiveChapter = dimSiblingChapters && !isActiveChapter
                    const chapterPurpose = outlinePurposePlainText(node.purpose)
                    return (
                <article
                  key={node.id}
                  id={`chapter-${node.id}`}
                  data-chapter-id={node.id}
                  data-chapter-document={chapterDocumentId}
                  data-chapter-inactive={isInactiveChapter ? "" : undefined}
                  className={cn(
                    "group space-y-3 transition-opacity duration-200",
                    isInactiveChapter && "opacity-40",
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (pointerDownInChromeRef.current) {
                      pointerDownInChromeRef.current = false
                      return
                    }
                    const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
                    const isWritingControl = Boolean(
                      target?.closest("button, a, input, textarea, select, [contenteditable='true'], .ProseMirror"),
                    )
                    if (
                      isWriting &&
                      clickDismissesWritingChapter({
                        activeChapterId,
                        clickedChapterId: node.id,
                        isEditorChrome: false,
                        isWritingControl,
                      })
                    ) {
                      closeChapterEditor()
                      return
                    }
                    if (isWriting && canWriteThis) {
                      if (isWritingControl) return
                      if (selectedId !== node.id) selectChapter(node.id)
                      if (activeChapterId !== node.id) onActivateChapter?.(node.id)
                      return
                    }
                    if (
                      clickClosesProgrammeChapterEditor({
                        activeChapterId,
                        clickedChapterId: node.id,
                        isEditorChrome: false,
                      })
                    ) {
                      closeChapterEditor()
                    }
                    if (selectedId !== node.id) selectChapter(node.id)
                    if (layout.showComments && !target?.closest(`[${BLOCK_ID_ATTR}]`)) {
                      const block = document
                        .getElementById(`chapter-${node.id}`)
                        ?.querySelector(`[${BLOCK_ID_ATTR}]`)
                      const blockId = block?.getAttribute(BLOCK_ID_ATTR)
                      if (blockId) {
                        setActiveBlockId(blockId)
                        setCommentNodeId(node.id)
                      }
                    }
                  }}
                >
                  <div className="relative flex items-start justify-between gap-2">
                    <h2
                      className={cn(
                        "text-xl font-semibold tracking-tight",
                        canWriteThis && "pr-16",
                        layout.showComments && !showEditor && "cursor-pointer",
                      )}
                    >
                      {chapterPurpose ? (
                        <IconTooltip
                          label={chapterPurpose}
                          side="bottom"
                          contentClassName="max-w-sm whitespace-pre-wrap overflow-y-auto max-h-64"
                          className="max-w-full"
                        >
                          <span className="cursor-help">{node.title}</span>
                        </IconTooltip>
                      ) : (
                        node.title
                      )}
                    </h2>
                    {showEditor ? (
                      chapterToolsMenu
                    ) : isWriting && canWriteThis ? (
                      <IconTooltip
                        label={t("workspace.programme.focusEdit")}
                        className="pointer-events-none absolute top-0 right-0 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("workspace.programme.focusEdit")}
                          data-guidance-target="chapter-edit"
                          data-guidance-state={
                            chapterDocumentId && railComments.some((comment) => comment.documentId === chapterDocumentId)
                              ? "noted"
                              : "clean"
                          }
                          onClick={(event) => {
                            event.stopPropagation()
                            selectChapter(node.id)
                            onActivateChapter?.(node.id)
                          }}
                        >
                          <PencilLine className="h-4 w-4" />
                        </Button>
                      </IconTooltip>
                    ) : null}
                  </div>
                  {writingNodeId === node.id ? (
                    <p className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm" role="status">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("workspace.programme.editorRegenRunning")}
                    </p>
                  ) : null}
                  {showEditor ? (
                    hasDoc ? (
                        <RichTextEditor
                          key={documentId || node.id}
                          workspaceId={workspaceId}
                          citationSources={labelledCitationSources}
                          content={stripDuplicateChapterHeading(content, node.title)}
                          showHistoryButtons={false}
                          toolbar="selection"
                          activeBlockId={layout.showComments ? activeBlockId : null}
                          onBlockClick={
                            layout.showComments
                              ? (blockId) => {
                                  setActiveBlockId(blockId)
                                  setCommentNodeId(node.id)
                                }
                              : undefined
                          }
                          onChange={(html) => {
                            setContent(html)
                            if (applyingHistoryRef.current) return
                            scheduleChapterSave(node.id)
                            textHistory.record(node.id, html)
                          }}
                          placeholder={t("workspace.programme.editorPlaceholder")}
                        />
                    ) : canAssignOwners ? (
                      <div className="space-y-2">
                        <p className="text-sm">{t("workspace.programme.editorNoDraft", undefined, { title: node.title })}</p>
                        <Button
                          disabled={creatingNodeId === node.id}
                          onClick={() => {
                            selectChapter(node.id)
                            onActivateChapter?.(node.id)
                            openOrCreate(node)
                          }}
                        >
                          {t("workspace.programme.editorCreateStub")}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("workspace.programme.editorNoDraft", undefined, { title: node.title })}
                      </p>
                    )
                  ) : hasDoc && body?.content ? (
                    <div
                      className={cn(
                        programmeChapterProseClass,
                        layout.showComments
                          ? "[&_[data-block-id]]:cursor-pointer [&_[data-block-id]:hover]:bg-amber-50/70"
                          : "",
                      )}
                      onClick={(event) => onPreviewClick(event, node.id)}
                      dangerouslySetInnerHTML={{
                        __html: renderProgrammeCitationHtml(
                          ensureBlockIdsInHtml(
                            stripDuplicateChapterHeading(
                              isSelected && !(isWriting && activeChapterId && activeChapterId !== node.id)
                                ? content || body.content
                                : body.content,
                              node.title,
                            ),
                          ),
                          { workspaceId, sources: labelledCitationSources },
                        ),
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
            <ProgrammeInlineComments
              rootId="programme-document-page"
              comments={railComments}
              activeBlockId={activeBlockId}
              showAll={layout.showComments}
              draft={commentDraft}
              canComment={canComment && layout.showComments}
              pending={commentPending}
              layoutKey={`${paginationKey}-${layout.wide}-${railComments.length}-${commentThemes.length}-${activeBlockId || ""}-${pageCount}`}
              railClassName={programmeCommentRailClass(layout)}
              addLabel={t("workspace.programme.addComment")}
              resolveLabel={t("workspace.programme.commentResolve")}
              reopenLabel={t("workspace.programme.commentReopen")}
              replyLabel={t("workspace.programme.commentReply")}
              replyPlaceholder={t("workspace.programme.commentReplyPlaceholder")}
              deleteLabel={t("workspace.programme.commentDelete")}
              deleteConfirmLabel={t("workspace.programme.commentDeleteConfirm")}
              placeholder={t("workspace.programme.chapterCommentPlaceholder")}
              panelLabel={t("workspace.programme.commentsPanel", "Comments")}
              collapseLabel={t("workspace.programme.commentsCollapse", "Collapse")}
              compactBelow={layout.paged ? 1130 : 1056}
              onDraftChange={setCommentDraft}
              onAdd={addParagraphComment}
              onReply={replyToComment}
              onSelect={(blockId) => {
                setActiveBlockId(blockId)
                const comment = railComments.find((row) => row.blockId === blockId)
                if (comment?.documentId) {
                  const node = nodes.find(
                    (item) =>
                      (bodies[item.id]?.documentId ?? bindings.chapterDocuments?.[item.id]) === comment.documentId,
                  )
                  if (node) {
                    setCommentNodeId(node.id)
                    selectChapter(node.id)
                  }
                }
                if (blockId) {
                  window.requestAnimationFrame(() => {
                    document
                      .querySelector(`[${BLOCK_ID_ATTR}="${CSS.escape(blockId)}"]`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  })
                }
              }}
              onDelete={(commentId) => {
                setCommentPending(true)
                void (async () => {
                  const result = await deleteProgrammeComment(workspaceId, commentId)
                  sayResult(result.error, t("workspace.programme.commentDeleted"))
                  refreshComments()
                  setCommentPending(false)
                })()
              }}
              onToggleResolved={(commentId, resolved) => {
                setCommentPending(true)
                void (async () => {
                  const result = await setProgrammeCommentResolved(workspaceId, commentId, resolved)
                  if (result.error) onMessage(result.error, "error")
                  refreshComments()
                  setCommentPending(false)
                })()
              }}
            />
          </div>
          </div>
        </>
      )}
      </div>
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("workspace.programme.history")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={restoreReason}
              onChange={(e) => setRestoreReason(e.target.value)}
              placeholder={t("workspace.programme.restoreReason")}
            />
            {chapterVersions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("workspace.programme.noVersions")}</p>
            ) : (
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
                      onClick={() => restoreVersion(version.id)}
                    >
                      {t("workspace.programme.restoreVersion")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {chapterVersions.length > 1 ? (
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
                  onClick={runCompare}
                >
                  {t("workspace.programme.compareVersions")}
                </Button>
                {versionDiff.map((entry) => (
                  <p key={entry.path} className="w-full">
                    {entry.path}: {entry.before.slice(0, 80)} → {entry.after.slice(0, 80)}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("workspace.programme.editorNodeInstructions")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selected?.instructions ? (
              <p className="text-sm text-muted-foreground">
                {selected.instructions}
                {selected.required ? ` · ${t("workspace.programme.requiredSection")}` : ""}
              </p>
            ) : null}
            {nodeMeasures.length > 0 ? (
              <ul className="text-xs text-muted-foreground">
                {nodeMeasures.map((m) => (
                  <li key={m.id}>• {m.title}</li>
                ))}
              </ul>
            ) : null}
            <Textarea
              value={draftInstructions}
              onChange={(e) => setDraftInstructions(e.target.value)}
              rows={4}
              placeholder={t("workspace.programme.editorInstructionsPlaceholder")}
            />
            {groundedness ? (
              <p className="text-xs text-muted-foreground">
                {t("workspace.programme.editorGroundednessScore", undefined, {
                  found: String(groundedness.found),
                  total: String(groundedness.total),
                  uncited: String(groundedness.uncited),
                })}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
