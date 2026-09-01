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
import { RichTextEditor } from "@/components/rich-text-editor"
import { useI18n } from "@/lib/i18n/use-i18n"
import { listProgrammeOutlineNodes, ensureProgrammeOutline } from "@/lib/actions/outline"
import {
  ensureChapterDocument,
  getChapterDocument,
  assessDocumentGroundedness,
  setChapterWorkflowStatus,
  regenerateProgrammeChapter,
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
import { addProgrammeComment, listProgrammeComments } from "@/lib/actions/comments"
import type { ProgrammeBindings, ProgrammeOutlineNode } from "@/lib/programme/domain"
import type { ChapterWorkflowStatus } from "@/lib/programme/review-policy"

type Props = {
  workspaceId: string
  spaceId: string
  bindings: ProgrammeBindings
  onBindingsChange: (bindings: ProgrammeBindings) => void
  onMessage: (message: string | null) => void
  onGoOutline: () => void
}

export function ProgrammeChapterEditor({
  workspaceId,
  spaceId,
  bindings,
  onBindingsChange,
  onMessage,
  onGoOutline,
}: Props) {
  const { t } = useI18n()
  const [nodes, setNodes] = useState<ProgrammeOutlineNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
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
  const [alsoOpen, setAlsoOpen] = useState<string[]>([])
  const [chapterComment, setChapterComment] = useState("")
  const [chapterComments, setChapterComments] = useState<Array<{ id: string; body: string; resolved: boolean }>>([])

  const loadNodes = (templateId: string) => {
    startTransition(async () => {
      const result = await listProgrammeOutlineNodes(templateId)
      if (result.error) {
        onMessage(result.error)
        return
      }
      setNodes(result.data)
      if (!selectedId && result.data[0]) setSelectedId(result.data[0].id)
    })
  }

  useEffect(() => {
    if (bindings.templateId) loadNodes(bindings.templateId)
    else setNodes([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindings.templateId, workspaceId])

  const selected = nodes.find((n) => n.id === selectedId) || null
  const linkedDocId = selectedId ? bindings.chapterDocuments?.[selectedId] : undefined

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
      setAlsoOpen((presence.data || []).map((row) => row.name))
    })
    const timer = window.setInterval(() => {
      void heartbeatSectionPresence(workspaceId, key).then(() =>
        listSectionPresence(workspaceId, key).then((presence) =>
          setAlsoOpen((presence.data || []).map((row) => row.name)),
        ),
      )
    }, 20000)
    return () => {
      window.clearInterval(timer)
      void releaseSectionLock(workspaceId, key)
    }
  }, [selectedId, workspaceId])

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
      setDocumentId(result.data.documentId)
      setContent(result.data.content || "")
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

  const loadExisting = (docId: string) => {
    startTransition(async () => {
      const result = await getChapterDocument(workspaceId, docId)
      if (result.error || !result.data) {
        onMessage(result.error || t("workspace.programme.editorLoadError"))
        return
      }
      setDocumentId(result.data.documentId)
      setContent(result.data.content)
      setWorkflowStatus(result.data.workflowStatus || "generated")
      setDirty(false)
      const listed = await listProgrammeComments(workspaceId, "document", docId)
      setChapterComments(listed.data || [])
    })
  }

  useEffect(() => {
    if (!selectedId) {
      setDocumentId(null)
      setContent("")
      setShowHistory(false)
      setChapterVersions([])
      return
    }
    const docId = bindings.chapterDocuments?.[selectedId]
    if (docId) loadExisting(docId)
    else {
      setDocumentId(null)
      setContent("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("workspace.programme.editorHint")}</p>

      {!bindings.templateId ? (
        <div className="space-y-2">
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
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <aside className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("workspace.programme.outlineTree")}</p>
            {nodes.length === 0 && <p className="text-sm">{t("workspace.programme.outlineEmpty")}</p>}
            <ul className="space-y-1">
              {nodes.map((node) => {
                const hasDoc = Boolean(bindings.chapterDocuments?.[node.id])
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      className={`w-full rounded-md border px-2 py-1.5 text-left text-sm ${
                        selectedId === node.id ? "border-foreground bg-muted" : "hover:bg-muted/60"
                      }`}
                      onClick={() => setSelectedId(node.id)}
                    >
                      {node.title}
                      {hasDoc ? " · ✓" : ""}
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <div className="space-y-3">
            {!selected ? (
              <p className="text-sm text-muted-foreground">{t("workspace.programme.editorSelectNode")}</p>
            ) : !documentId && !linkedDocId ? (
              <div className="space-y-2">
                <p className="text-sm">{t("workspace.programme.editorNoDraft", undefined, { title: selected.title })}</p>
                {nodeMeasures.length > 0 && (
                  <ul className="text-xs">
                    {nodeMeasures.map((m) => (
                      <li key={m.id}>• {m.title}</li>
                    ))}
                  </ul>
                )}
                <Button disabled={pending} onClick={() => openOrCreate(selected)}>
                  {t("workspace.programme.editorCreateStub")}
                </Button>
              </div>
            ) : (
              <>
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
                  {!documentId && linkedDocId && (
                    <Button variant="outline" disabled={pending} onClick={() => loadExisting(linkedDocId)}>
                      {t("workspace.programme.editorReload")}
                    </Button>
                  )}
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
                  <p className="text-xs text-muted-foreground">
                    {t("workspace.programme.alsoOpen", undefined, { names: alsoOpen.join(", ") })}
                  </p>
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
                {documentId && (
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="text-xs font-medium">{t("workspace.programme.chapterComments")}</p>
                    <ul className="space-y-1 text-xs">
                      {chapterComments.map((comment) => (
                        <li key={comment.id}>
                          {comment.resolved ? "[done] " : ""}
                          {comment.body}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <Input
                        value={chapterComment}
                        onChange={(e) => setChapterComment(e.target.value)}
                        placeholder={t("workspace.programme.chapterCommentPlaceholder")}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending || !chapterComment.trim()}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await addProgrammeComment({
                              workspaceId,
                              artefactType: "document",
                              artefactId: documentId,
                              body: chapterComment,
                            })
                            setChapterComment("")
                            onMessage(result.error || t("workspace.programme.commentAdded"))
                            const listed = await listProgrammeComments(workspaceId, "document", documentId)
                            setChapterComments(listed.data || [])
                          })
                        }
                      >
                        {t("workspace.programme.addComment")}
                      </Button>
                    </div>
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
                <RichTextEditor
                  key={documentId || selected.id}
                  content={content}
                  onChange={(html) => {
                    setContent(html)
                    setDirty(true)
                  }}
                  placeholder={t("workspace.programme.editorPlaceholder")}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
