"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n } from "@/lib/i18n/use-i18n"
import { getWorkspaceKnowledgeBundle } from "@/lib/actions/workspace-knowledge"
import {
  DocumentsList,
  WorkspaceEvidenceBoard,
  WorkspaceInheritedItems,
  WorkspaceNotesCount,
  WorkspaceNotesPanel,
} from "@/components/workspace-page-client"
import type { WorkspaceNote } from "@/components/workspace-notes-panel"
import type { ReactNode } from "react"

type Props = {
  workspaceId: string
  currentUserId: string | null
  canManage: boolean
  excludeDocumentIds?: string[]
  filesExtra?: ReactNode
}

export function ProgrammeKnowledgeView({
  workspaceId,
  currentUserId,
  canManage,
  excludeDocumentIds = [],
  filesExtra,
}: Props) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [uploadedDocuments, setUploadedDocuments] = useState<unknown[]>([])
  const [archivedCount, setArchivedCount] = useState(0)
  const [sources, setSources] = useState<Array<{ id: string; name: string; type: string; config?: Record<string, unknown> }>>([])
  const [inheritedItems, setInheritedItems] = useState<unknown[]>([])
  const [evidenceItems, setEvidenceItems] = useState<unknown[]>([])
  const [notes, setNotes] = useState<WorkspaceNote[]>([])
  const [commentsByItem, setCommentsByItem] = useState<Record<string, unknown[]>>({})
  const [parentSpaces, setParentSpaces] = useState<Array<{ id: string; name: string; space_type?: string | null }>>([])

  const excludedKey = useMemo(() => excludeDocumentIds.slice().sort().join("|"), [excludeDocumentIds])
  const excluded = useMemo(() => new Set(excludeDocumentIds), [excludedKey])

  const load = useCallback(async () => {
    const result = await getWorkspaceKnowledgeBundle(workspaceId)
    if (!result.data) {
      setLoading(false)
      return
    }
    const uploaded = (result.data.uploadedDocuments || []).filter((doc: { id?: string }) => !excluded.has(String(doc.id)))
    setUploadedDocuments(uploaded)
    setArchivedCount(result.data.archivedCount)
    setSources(result.data.sources || [])
    setInheritedItems(result.data.combinedInheritedItems || [])
    setEvidenceItems(result.data.localWorkspaceItems || [])
    setNotes((result.data.notes || []) as WorkspaceNote[])
    setCommentsByItem(result.data.commentsByItem || {})
    setParentSpaces(result.data.parentSpaces || [])
    setLoading(false)
  }, [workspaceId, excluded])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onSaved = () => {
      void load()
    }
    window.addEventListener("evidenceSaved", onSaved)
    window.addEventListener("workspaceContextUpdated", onSaved)
    return () => {
      window.removeEventListener("evidenceSaved", onSaved)
      window.removeEventListener("workspaceContextUpdated", onSaved)
    }
  }, [load])

  const heading = (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{t("workspace.programme.nav.knowledge")}</h2>
      <p className="text-sm text-muted-foreground">{t("workspace.programme.purpose.knowledge")}</p>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        {heading}
        <p className="text-sm text-muted-foreground">{t("workspace.programme.knowledgeLoading")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {heading}
      <Tabs defaultValue="sources" className="space-y-6">
      <TabsList className="grid w-full max-w-2xl grid-cols-4">
        <TabsTrigger value="sources">
          {t("workspace.tabs.sources")} <span className="font-normal">({uploadedDocuments.length})</span>
        </TabsTrigger>
        <TabsTrigger value="inherited">
          {t("workspace.tabs.inherited")} <span className="font-normal">({inheritedItems.length})</span>
        </TabsTrigger>
        <TabsTrigger value="evidence">
          {t("workspace.tabs.evidence")} <span className="font-normal">({evidenceItems.length})</span>
        </TabsTrigger>
        <TabsTrigger value="notes">
          {t("workspace.tabs.notes")}{" "}
          <WorkspaceNotesCount workspaceId={workspaceId} initialCount={notes.length} className="font-normal" />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sources" className="space-y-5">
        <div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-lg font-semibold">{t("workspace.sections.sources.title")}</h3>
            <span className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
              ({uploadedDocuments.length})
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{t("workspace.sections.sources.description")}</p>
        </div>
        <DocumentsList
          workspaceId={workspaceId}
          initialDocuments={uploadedDocuments}
          initialArchivedCount={archivedCount}
          sources={sources}
          canManage={canManage}
        />
        {filesExtra}
      </TabsContent>

      <TabsContent value="inherited" className="space-y-5">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">{t("workspace.sections.inherited.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("workspace.sections.inherited.description")}</p>
        </div>
        <WorkspaceInheritedItems items={inheritedItems as never} />
      </TabsContent>

      <TabsContent value="evidence" className="space-y-8">
        <div>
          <h3 className="text-lg font-semibold">{t("workspace.sections.evidence.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("workspace.sections.evidence.description")}</p>
        </div>
        {currentUserId ? (
          <WorkspaceEvidenceBoard
            workspaceId={workspaceId}
            currentUserId={currentUserId}
            initialItems={evidenceItems as never}
            initialComments={commentsByItem as never}
            parentSpaces={parentSpaces}
            canManage={canManage}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("workspace.programme.knowledgeLoading")}</p>
        )}
      </TabsContent>

      <TabsContent value="notes" className="space-y-5">
        {currentUserId ? (
          <WorkspaceNotesPanel
            workspaceId={workspaceId}
            currentUserId={currentUserId}
            initialNotes={notes}
            canManage={canManage}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("workspace.programme.knowledgeLoading")}</p>
        )}
      </TabsContent>
    </Tabs>
    </div>
  )
}
