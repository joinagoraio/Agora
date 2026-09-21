"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconTooltip } from "@/components/icon-tooltip"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/lib/i18n/use-i18n"
import { cn } from "@/lib/utils"
import { useChatContext } from "@/components/workspace-chat-wrapper"
import {
  ProgrammeAccessDialogs,
  ProgrammeAccessMenuItems,
  type ProgrammeAccessPanel,
} from "@/components/programme-list-menu"
import { notify, notifyResult } from "@/lib/notify"
import { ErrorBoundary } from "@/components/error-boundary"
import {
  canShowProgrammeConfiguration,
  effectiveJob,
  moreNavSections,
  primaryNavSections,
  type GuidanceMode,
} from "@/lib/guidance/jobs"
import { canAdministerProgramme } from "@/lib/programme/ownership"
import {
  nextProgrammeDocumentSearch,
  resolveProgrammeDocumentSearch,
  serializeFocusChapterIds,
  type ProgrammeDocumentMode,
} from "@/lib/programme/document-mode"
import { deriveGuidancePipeline, pipelineInputFromWorkbench, STAGE_TARGET } from "@/lib/guidance/pipeline"
import {
  programmeHasChapterDocuments,
  programmeSetupIncomplete,
  shouldShowProgrammeSetupWizard,
} from "@/lib/guidance/setup"
import { ProgrammeSetupWizard } from "@/components/programme-setup-wizard"
import { listBoundDocumentsForHelp } from "@/lib/programme/source-set-bindings"
import { listProgrammeOutlineNodes } from "@/lib/actions/outline"
import {
  bindWorkspaceAgents,
  bindWorkspaceTemplate,
  ensureDefaultAgentsBound,
  cancelFillProgramme,
  fillProgrammeChapters,
  getFillProgrammeJob,
  getProgrammeBindings,
  getProgrammePolicies,
  listProgrammeReviewers,
  previewBoundAgentSources,
  retryFillProgramme,
  seedLocalProgrammeReviewer,
  approveAllProgrammeLocally,
  listProgrammeChapters,
  assignChapterReviewer,
  setChapterWorkflowStatus,
  updateProgrammeBindings,
  updateProgrammePolicies,
  assignDocumentOwner,
} from "@/lib/actions/programme"
import { getWorkspaceDocuments } from "@/lib/actions/document"
import { getWorkspaceNotes } from "@/lib/actions/workspace-notes"
import {
  listProgrammeMeasures,
  generateProgrammeMeasuresFromContext,
  approveProgrammeMeasure,
  importMeasureCandidatesFromJson,
  setMeasureWorkflowStatus,
  upsertProgrammeMeasure,
  assignMeasureReviewer,
  mergeDuplicateMeasures,
} from "@/lib/actions/measures"
import {
  listAnalysisReports,
  listPolicyGraph,
  runBoundAgentAnalysis,
  compareAnalysisReports,
  rerunAnalysisFromReport,
  setFindingAddressed,
  cancelAnalysisJob,
} from "@/lib/actions/analysis"
import { listArtefactVersions, restoreArtefactVersion, compareArtefactVersions } from "@/lib/actions/collaboration"
import { listGenerationRuns, getProgrammeObservabilityMetrics, listWorkspaceCitationCatalog } from "@/lib/actions/generation-run"
import { formatCitationLabel } from "@/lib/programme/citation-labels"
import { estimateJobEta, formatEtaMs } from "@/lib/programme/job-eta"
import { runMarkdownOrDocxExport, buildAuditPackageJson } from "@/lib/actions/export"
import {
  getActiveProgrammePublication,
  listCitablePublications,
  publishProgrammeSnapshot,
  revokeProgrammePublication,
  type ProgrammePublicationSummary,
} from "@/lib/actions/publish"
import type { PublicationVisibility } from "@/lib/programme/publish"
import { listSpaceTemplates } from "@/lib/actions/template"
import { ProgrammeTemplatePicker } from "@/components/programme-template-picker"
import { SaveProgrammeAsTemplateDialog } from "@/components/save-programme-as-template-dialog"
import { listSpaceAgents } from "@/lib/actions/agent"
import { convertPolicyProseToMeasures, findDuplicateMeasures, generateVisionSkeleton, mergeMeasureFragment } from "@/lib/actions/pipelines"
import {
  addProgrammeComment,
  clusterColleagueComments,
  listProgrammeCommentThemes,
  listProgrammeComments,
  setProgrammeCommentResolved,
  setProgrammeCommentThemeAddressed,
} from "@/lib/actions/comments"
import { nestColleagueComments, type ColleagueCommentThemeRecord } from "@/lib/programme/colleague-comments"
import { getProgrammeConsultationQueue, type ConsultationQueue } from "@/lib/actions/consultation"
import { ConsultationOwnerPanel } from "@/components/consultation-owner-panel"
import {
  AGENT_STAGES,
  documentOriginFromMetadata,
  parseProgrammeBindings,
  isProgrammeWorkbenchSection,
  PROGRAMME_WORKBENCH_SECTIONS,
  type DocumentOrigin,
  type ProgrammeBindings,
  type ProgrammeTemplateSummary,
  type ProgrammeWorkbenchSection,
  type WorkspaceKind,
} from "@/lib/programme/domain"
import { splitAnchorList } from "@/lib/programme/vision-path"
import { ProgrammeChapterEditor } from "@/components/programme-chapter-editor"
import { ProgrammeEffectsPanel } from "@/components/programme-effects-panel"
import { ProgrammePolicyGraph } from "@/components/programme-policy-graph"
import { ProgrammeDocumentRoles } from "@/components/programme-document-roles"
import { ProgrammeKnowledgeView } from "@/components/programme-knowledge-view"
import { ProgrammeDocumentChrome } from "@/components/programme-document-chrome"
import { OverflowTitle } from "@/components/overflow-title"
import { ProgrammeTextHistoryProvider } from "@/components/programme-text-history"
import { ProgrammeToolsToolbar } from "@/components/programme-tools-toolbar"
import {
  DEFAULT_PROGRAMME_DOCUMENT_LAYOUT,
  mergeProgrammeDocumentLayout,
  programmeDocumentCanvasClass,
  readProgrammeDocumentLayout,
  writeProgrammeDocumentLayout,
  type ProgrammeDocumentLayout,
  type ProgrammeDocumentLayoutPatch,
} from "@/lib/programme/document-layout"
import { UserAvatar } from "@/components/user-avatar"
import { WorkspaceNotesPanel, type WorkspaceNote } from "@/components/workspace-notes-panel"
import { getDocumentFileExtension } from "@/lib/utils/document-files"
import { ArrowLeft, CircleHelp, MoreVertical } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

function StageHeading({ title, purpose }: { title: string; purpose: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground" aria-label={purpose}>
                <CircleHelp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{purpose}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="text-sm text-muted-foreground">{purpose}</p>
    </div>
  )
}

const SHEET_SECTIONS = new Set<ProgrammeWorkbenchSection>([
  "overview",
  "setup",
  "agents",
  "corpus",
  "analysis",
  "measures",
  "effects",
  "provenance",
  "review",
  "consultation",
  "export",
  "publish",
])

const MENU_GROUPS: { id: "work" | "properties" | "output"; sections: ProgrammeWorkbenchSection[] }[] = [
  { id: "work", sections: ["analysis", "measures", "effects", "provenance", "review", "consultation"] },
  { id: "properties", sections: ["overview", "setup", "agents"] },
  { id: "output", sections: ["export", "publish"] },
]

const emptyMeasureDraft = {
  title: "",
  type: "measure",
  specificAction: "",
  ownerRole: "",
  geography: "",
  timeline: "",
  indicator: "",
  successCriterion: "",
  contributesToVision: "",
  provincialInterests: "",
  narrative: "",
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadExportPayload(payload: {
  content: string
  encoding: "utf8" | "base64"
  mimeType: string
  filename: string
}) {
  if (payload.encoding === "base64") {
    const binary = atob(payload.content)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    downloadBlob(payload.filename, new Blob([bytes], { type: payload.mimeType }))
    return
  }
  downloadBlob(payload.filename, new Blob([payload.content], { type: payload.mimeType }))
}

const NEXT_COPY: Record<string, string> = {
  bind: "guidance.coach.nextBind",
  analyse: "guidance.coach.nextAnalyse",
  structure: "guidance.coach.nextStructure",
  draft: "guidance.coach.nextDraft",
  check: "guidance.coach.nextCheck",
  review: "guidance.coach.nextReview",
  export: "guidance.coach.nextExport",
}

function openPrintPreview(html: string) {
  const w = window.open("", "_blank")
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => {
    w.print()
  }, 250)
}

type Props = {
  workspaceId: string
  workspaceName: string
  workspaceSummary?: string | null
  workspaceDescription?: string | null
  spaceId: string
  spaceName?: string
  kind: WorkspaceKind | string
  metadata: Record<string, unknown>
  spaceJob?: string | null
  workspaceJob?: string | null
  guidanceMode?: GuidanceMode
  expertPromptDismissed?: boolean
  helpAiEnabled?: boolean
  canAccessSettings?: boolean
  currentUserId?: string | null
  accessRole?: string | null
  initialDocumentOwnerId?: string | null
}

export function ProgrammeWorkbench({
  workspaceId,
  workspaceName,
  workspaceSummary: workspaceSummaryProp,
  workspaceDescription: workspaceDescriptionProp,
  spaceId,
  spaceName = "",
  kind,
  spaceJob = "none",
  workspaceJob = "author",
  guidanceMode = "guided",
  expertPromptDismissed = false,
  helpAiEnabled = false,
  canAccessSettings = false,
  currentUserId: currentUserIdProp = null,
  accessRole: accessRoleProp = null,
  initialDocumentOwnerId = null,
  metadata,
}: Props) {
  const workspaceSummary = workspaceSummaryProp ?? ""
  const workspaceDescription = workspaceDescriptionProp ?? ""
  const { t } = useI18n()
  const { setGuidance } = useChatContext()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [outlineNodeCount, setOutlineNodeCount] = useState(0)
  const [snapshotLoaded, setSnapshotLoaded] = useState(false)
  const [wizardSession, setWizardSession] = useState(false)
  const [accessPanel, setAccessPanel] = useState<ProgrammeAccessPanel>(null)
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false)

  const chromeJob = effectiveJob({ spaceJob, workspaceJob, pathname })
  const [documentOwnerId, setDocumentOwnerId] = useState<string | null>(initialDocumentOwnerId)
  const [accessRole, setAccessRole] = useState<string | null>(accessRoleProp)
  const [currentUserId, setCurrentUserId] = useState<string | null>(currentUserIdProp)
  const canAdminister = canAdministerProgramme({
    actorId: currentUserId,
    accessRole,
    documentOwnerId,
  })
  const showConfiguration =
    canShowProgrammeConfiguration({ spaceJob, canAccessSettings }) || canAdminister
  const primarySections = primaryNavSections(chromeJob).filter(
    (section) => (section !== "setup" && section !== "agents") || showConfiguration,
  )
  const moreSections = moreNavSections(chromeJob, PROGRAMME_WORKBENCH_SECTIONS).filter(
    (section) => (section !== "setup" && section !== "agents") || showConfiguration,
  )

  const sectionParam = searchParams.get("section")
  const viewParam = searchParams.get("view")
  const chapterParam = searchParams.get("chapter")
  const structureOpen = searchParams.get("structure") === "1" || sectionParam === "outline"
  const isKnowledgeView = viewParam === "knowledge"
  const documentSearch = resolveProgrammeDocumentSearch({
    mode: searchParams.get("mode"),
    focus: searchParams.get("focus"),
    chapter: chapterParam,
  })
  const documentMode = documentSearch.mode
  const activeSection: ProgrammeWorkbenchSection = structureOpen
    ? "outline"
    : isProgrammeWorkbenchSection(sectionParam)
      ? sectionParam
      : "editor"
  const [sheetDismissed, setSheetDismissed] = useState(false)
  const [documentLayout, setDocumentLayout] = useState<ProgrammeDocumentLayout>(DEFAULT_PROGRAMME_DOCUMENT_LAYOUT)
  const [writableChapters, setWritableChapters] = useState<Array<{ id: string; title: string }>>([])
  const sheetOpen = !isKnowledgeView && SHEET_SECTIONS.has(activeSection) && !sheetDismissed

  useEffect(() => {
    setDocumentLayout(readProgrammeDocumentLayout())
  }, [])

  const patchDocumentLayout = useCallback((patch: ProgrammeDocumentLayoutPatch) => {
    setDocumentLayout((current) => {
      const next = mergeProgrammeDocumentLayout(current, patch)
      writeProgrammeDocumentLayout(next)
      return next
    })
  }, [])

  useEffect(() => {
    setSheetDismissed(false)
  }, [sectionParam])

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      mutate(params)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const setMode = useCallback(
    (mode: "document" | "knowledge") => {
      replaceParams((params) => {
        params.delete("section")
        params.delete("structure")
        if (mode === "knowledge") params.set("view", "knowledge")
        else params.delete("view")
      })
    },
    [replaceParams],
  )

  const setSection = useCallback(
    (section: string) => {
      if (!isProgrammeWorkbenchSection(section)) return
      setSheetDismissed(false)
      if (section === "editor") {
        replaceParams((params) => {
          params.delete("section")
          params.delete("structure")
          params.set("view", "document")
        })
        return
      }
      if (section === "outline") {
        replaceParams((params) => {
          params.delete("section")
          params.set("view", "document")
          params.set("structure", "1")
        })
        return
      }
      replaceParams((params) => {
        params.delete("structure")
        params.set("view", "document")
        params.set("section", section)
      })
    },
    [replaceParams],
  )

  const closeSheet = useCallback(() => {
    setSheetDismissed(true)
    replaceParams((params) => {
      params.delete("section")
      params.set("view", "document")
    })
  }, [replaceParams])

  const closeStructure = useCallback(() => {
    replaceParams((params) => {
      params.delete("section")
      params.delete("structure")
      params.set("view", "document")
    })
  }, [replaceParams])

  const applyDocumentSearch = useCallback(
    (next: { mode: ProgrammeDocumentMode | null; focusIds: string[]; chapterId: string | null }) => {
      replaceParams((params) => {
        params.delete("section")
        params.set("view", "document")
        if (next.mode) params.set("mode", next.mode)
        else params.delete("mode")
        if (next.focusIds.length > 0) params.set("focus", serializeFocusChapterIds(next.focusIds))
        else params.delete("focus")
        if (next.chapterId) params.set("chapter", next.chapterId)
        else params.delete("chapter")
      })
    },
    [replaceParams],
  )

  const setDocumentMode = useCallback(
    (mode: ProgrammeDocumentMode) => {
      applyDocumentSearch(
        nextProgrammeDocumentSearch({
          nextMode: mode,
          writableIds: writableChapters.map((chapter) => chapter.id),
          currentChapterId: documentSearch.chapterId,
          currentFocusIds: documentSearch.focusIds,
        }),
      )
    },
    [applyDocumentSearch, documentSearch.chapterId, documentSearch.focusIds, writableChapters],
  )

  const setActiveChapter = useCallback(
    (chapterId: string | null) => {
      replaceParams((params) => {
        params.delete("structure")
        params.set("view", "document")
        if (chapterId) params.set("chapter", chapterId)
        else params.delete("chapter")
      })
    },
    [replaceParams],
  )

  const setFocusVisibleIds = useCallback(
    (ids: string[]) => {
      const focusIds = ids.filter((id) => writableChapters.some((chapter) => chapter.id === id))
      const nextIds = focusIds.length > 0 ? focusIds : writableChapters.map((chapter) => chapter.id)
      applyDocumentSearch({
        mode: "focus",
        focusIds: nextIds,
        chapterId:
          documentSearch.chapterId && nextIds.includes(documentSearch.chapterId)
            ? documentSearch.chapterId
            : null,
      })
    },
    [applyDocumentSearch, documentSearch.chapterId, writableChapters],
  )

  const [bindings, setBindings] = useState<ProgrammeBindings>(() => parseProgrammeBindings(metadata))
  const [measures, setMeasures] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [observability, setObservability] = useState<{
    generationRunCount: number
    citationCoverageRate: number | null
    unusedSourceRate: number | null
    exportFailureRate: number | null
    hasSuccessfulExport?: boolean
    modelsUsed: string[]
    byKind: Record<string, number>
  } | null>(null)
  const [exportMd, setExportMd] = useState("")
  const [measureInstructions, setMeasureInstructions] = useState("")
  const [measureImportJson, setMeasureImportJson] = useState("")
  const [pending, startTransition] = useTransition()
  const [templates, setTemplates] = useState<ProgrammeTemplateSummary[]>([])
  const [agents, setAgents] = useState<
    Array<{ id: string; name: string; role: string; stage: string; provider: string }>
  >([])
  const [corpusDocs, setCorpusDocs] = useState<
    Array<{ id: string; title: string; document_role: string | null; origin: DocumentOrigin; fileExtension: string }>
  >([])
  const [notes, setNotes] = useState<WorkspaceNote[]>([])
  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] })
  const [duplicates, setDuplicates] = useState<Array<Array<{ id: string; title: string; score?: number; reason?: string }>>>([])
  const [fillProgress, setFillProgress] = useState<Array<{ title: string; status: string; error?: string }>>([])
  const [fillStartedAt, setFillStartedAt] = useState<string | null>(null)
  const [filling, setFilling] = useState(false)
  const [citationCatalog, setCitationCatalog] = useState<{
    documents: Array<{ id: string; title: string; documentRole?: string | null }>
    sections: Array<{ id: string; documentId: string; title: string; pageNumber?: number }>
  }>({ documents: [], sections: [] })
  const [policies, setPolicies] = useState({
    distinctReviewer: false,
    stakeholderExportRequiresFreeze: false,
    hasFreeze: false,
    freezeId: null as string | null,
    freezeAt: null as string | null,
  })
  const [publication, setPublication] = useState<ProgrammePublicationSummary | null>(null)
  const [consultationQueue, setConsultationQueue] = useState<ConsultationQueue>({
    consultation: null,
    comments: [],
    replies: [],
    clusters: [],
    appeals: [],
    topicSummary: null,
    unresolvedCount: 0,
    windowOpen: false,
    clusterJob: null,
  })
  const [citablePublications, setCitablePublications] = useState<ProgrammePublicationSummary[]>([])
  const [publishVisibility, setPublishVisibility] = useState<PublicationVisibility>("permissioned")
  const [publishPeriod, setPublishPeriod] = useState("")
  const [revealedAccessCode, setRevealedAccessCode] = useState<string | null>(null)
  const [citePublicationId, setCitePublicationId] = useState("")
  const [reviewers, setReviewers] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [historyMeasureId, setHistoryMeasureId] = useState<string | null>(null)
  const [measureVersions, setMeasureVersions] = useState<Array<{ id: string; reason: string | null; created_at: string }>>([])
  const [restoreReason, setRestoreReason] = useState("")
  const [sourcePreview, setSourcePreview] = useState<string>("")
  const [compareA, setCompareA] = useState("")
  const [compareB, setCompareB] = useState("")
  const [compareResult, setCompareResult] = useState<string>("")
  const [compareFindings, setCompareFindings] = useState<{
    onlyA: Array<{ id: string; disposition?: string; summary?: string }>
    onlyB: Array<{ id: string; disposition?: string; summary?: string }>
    shared: Array<{ id: string; disposition?: string; summary?: string }>
  } | null>(null)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [analysisInstructions, setAnalysisInstructions] = useState("")
  const [analysisJobStatus, setAnalysisJobStatus] = useState<string>("")
  const [editingMeasureId, setEditingMeasureId] = useState<string | null>(null)
  const [measureDraft, setMeasureDraft] = useState(emptyMeasureDraft)
  const [commentBody, setCommentBody] = useState("")
  const [comments, setComments] = useState<any[]>([])
  const [commentThemes, setCommentThemes] = useState<ColleagueCommentThemeRecord[]>([])
  const [chapters, setChapters] = useState<
    Array<{
      documentId: string
      title: string
      workflowStatus: string
      assignedReviewerId: string | null
      chapterOwnerId: string | null
      outlineNodeId: string | null
      hasBody?: boolean
    }>
  >([])
  const [compareVersionA, setCompareVersionA] = useState("")
  const [compareVersionB, setCompareVersionB] = useState("")
  const [measureDiff, setMeasureDiff] = useState<Array<{ path: string; before: string; after: string }>>([])
  const [classification, setClassification] = useState<"public" | "internal" | "confidential">("internal")
  const [stakeholderExport, setStakeholderExport] = useState(false)

  const refresh = () => {
    void (async () => {
      try {
      const [b, m, r, g, obs, graphResult, dupes, policyResult, reviewerResult, publicationResult, citableResult, catalog] =
        await Promise.all([
        getProgrammeBindings(workspaceId),
        listProgrammeMeasures(workspaceId),
        listAnalysisReports(workspaceId),
        listGenerationRuns(workspaceId),
        getProgrammeObservabilityMetrics(workspaceId),
        listPolicyGraph(workspaceId),
        findDuplicateMeasures(workspaceId),
        getProgrammePolicies(workspaceId),
        listProgrammeReviewers(workspaceId),
        getActiveProgrammePublication(workspaceId),
        listCitablePublications(spaceId, workspaceId),
        listWorkspaceCitationCatalog(workspaceId),
      ])
      if (b.data) setBindings(b.data)
      setMeasures(m.data || [])
      setReports(r.data || [])
      setRuns(g.data || [])
      if (obs.data) setObservability(obs.data)
      if (graphResult.data) setGraph(graphResult.data)
      setDuplicates(dupes.data || [])
      setCitationCatalog({
        documents: catalog.documents || [],
        sections: catalog.sections || [],
      })
      if (policyResult.data) {
        setPolicies({
          distinctReviewer: policyResult.data.distinctReviewer,
          stakeholderExportRequiresFreeze: policyResult.data.stakeholderExportRequiresFreeze,
          hasFreeze: policyResult.data.hasFreeze,
          freezeId: policyResult.data.freezeId,
          freezeAt: policyResult.data.freezeAt,
        })
        if (policyResult.data.documentOwnerId) setDocumentOwnerId(policyResult.data.documentOwnerId)
        if (policyResult.data.accessRole) setAccessRole(policyResult.data.accessRole)
        if (policyResult.data.fillJob?.progress?.length) {
          setFillProgress(policyResult.data.fillJob.progress)
          setFillStartedAt(policyResult.data.fillJob.startedAt || null)
        }
      }
      setPublication(publicationResult.data || null)
      setCitablePublications(citableResult.data || [])
      if (!citePublicationId && citableResult.data?.[0]?.id) {
        setCitePublicationId(citableResult.data[0].id)
      }
      setReviewers(reviewerResult.data || [])
      setCurrentUserId(reviewerResult.currentUserId ?? null)
      const [tpl, ag, cm, themeResult, docs, chapterResult, notesResult, consultationResult] = await Promise.all([
        listSpaceTemplates(spaceId),
        listSpaceAgents(spaceId),
        listProgrammeComments(workspaceId),
        listProgrammeCommentThemes(workspaceId),
        getWorkspaceDocuments(workspaceId),
        listProgrammeChapters(workspaceId),
        getWorkspaceNotes(workspaceId),
        getProgrammeConsultationQueue(workspaceId),
      ])
      setTemplates(tpl.data || [])
      setAgents(
        (ag.data || [])
          .filter((a) => a.permitted)
          .map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            stage: a.stage,
            provider: a.latestVersion?.provider || "n/a",
          })),
      )
      setComments(cm.data || [])
      setCommentThemes(themeResult.data || [])
      if (consultationResult.data) setConsultationQueue(consultationResult.data)
      setChapters(chapterResult.data || [])
      setCorpusDocs(
        (docs.data || []).map(
          (d: { id: string; title: string; document_role?: string | null; metadata?: unknown; url?: string | null }) => ({
            id: d.id,
            title: d.title,
            document_role: d.document_role ?? null,
            origin: documentOriginFromMetadata(d.metadata),
            fileExtension: getDocumentFileExtension({
              metadata: (d.metadata as Record<string, unknown> | null) ?? null,
              title: d.title,
              url: d.url,
            }),
          }),
        ),
      )
      setNotes((notesResult.data || []) as WorkspaceNote[])
      const templateId = b.data?.templateId
      if (templateId) {
        const nodes = await listProgrammeOutlineNodes(templateId)
        setOutlineNodeCount(nodes.data?.length ?? 0)
      } else {
        setOutlineNodeCount(0)
      }
      setSnapshotLoaded(true)
      } catch (error) {
        notify(error instanceof Error ? error.message : t("workspace.programme.exportFailed"), "error")
      }
    })()
  }

  useEffect(() => {
    setBindings(parseProgrammeBindings(metadata))
    setChapters([])
    setSnapshotLoaded(false)
    setWizardSession(false)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  useEffect(() => {
    if (!filling) return
    const timer = window.setInterval(() => {
      void getFillProgrammeJob(workspaceId).then((result) => {
        if (result.data?.progress) setFillProgress(result.data.progress)
        if (result.data?.startedAt) setFillStartedAt(result.data.startedAt)
        if (result.data?.status && result.data.status !== "running") {
          setFilling(false)
        }
      })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [filling, workspaceId])

  const pipeline = useMemo(
    () =>
      deriveGuidancePipeline(
        pipelineInputFromWorkbench({
          bindings,
          reports,
          measures,
          chapters,
          outlineNodeCount,
          hasQcRun: Boolean(observability?.byKind?.qc) || reports.some((report) => report.report_type === "quality"),
          hasSuccessfulExport: Boolean(observability?.hasSuccessfulExport),
        }),
      ),
    [bindings, reports, measures, chapters, outlineNodeCount, observability],
  )
  const setupIncomplete = programmeSetupIncomplete(bindings)
  const hasChapterBody = chapters.some((chapter) => chapter.hasBody)
  const canRunSetup = chromeJob !== "reviewer" && accessRole !== "viewer"
  const showSetupWizard = shouldShowProgrammeSetupWizard({
    canEdit: canRunSetup,
    hasChapterBody,
    setupIncomplete,
    wizardSession,
    ready: snapshotLoaded,
    hasChapterDocuments: programmeHasChapterDocuments(bindings),
    setupComplete: bindings.setupComplete,
  })

  useEffect(() => {
    if (!snapshotLoaded || !setupIncomplete || bindings.setupComplete) return
    setWizardSession(true)
  }, [snapshotLoaded, setupIncomplete, bindings.setupComplete])

  useEffect(() => {
    if (isKnowledgeView || documentMode !== "focus") return
    if (documentSearch.focusIds.length > 0 || writableChapters.length === 0) return
    setFocusVisibleIds(writableChapters.map((chapter) => chapter.id))
  }, [isKnowledgeView, documentMode, documentSearch.focusIds.length, writableChapters, setFocusVisibleIds])

  const boundTemplateName = templates.find((tpl) => tpl.id === bindings.templateId)?.name
  const setupSteps: Array<{
    id: string
    done: boolean
    label: string
    section: ProgrammeWorkbenchSection
  }> = [
    {
      id: "agents",
      done: Object.keys(bindings.agentBindings || {}).length >= 2,
      label: t("workspace.programme.setupStepAgents"),
      section: "agents",
    },
    {
      id: "template",
      done: Boolean(bindings.templateId),
      label: t("workspace.programme.setupStepTemplate"),
      section: "outline",
    },
    {
      id: "corpus",
      done:
        (bindings.environmentalVisionDocumentIds?.length ?? 0) > 0 &&
        (bindings.existingPolicyDocumentIds?.length ?? 0) > 0,
      label: t("workspace.programme.setupStepCorpus"),
      section: "corpus",
    },
    {
      id: "analysis",
      done: reports.length > 0,
      label: t("workspace.programme.setupStepAnalysis"),
      section: "analysis",
    },
    {
      id: "measures",
      done: measures.length > 0,
      label: t("workspace.programme.setupStepMeasures"),
      section: "measures",
    },
  ]
  const nextSetupStep = setupSteps.find((step) => !step.done)
  const pendingMeasures = measures.filter((m) => m.workflow_status !== "approved")
  const pendingChapters = chapters.filter((chapter) => chapter.workflowStatus !== "approved")
  const reviewHasPending = pendingMeasures.length + pendingChapters.length > 0
  const reviewHasArtefacts = measures.length + chapters.length > 0
  const navSections = PROGRAMME_WORKBENCH_SECTIONS.filter(
    (section) => primarySections.includes(section) || moreSections.includes(section),
  )
  const navSet = new Set(navSections)
  const documentMenuGroups = MENU_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter((section) => {
      if (section === "setup" || section === "agents") return showConfiguration && navSet.has(section)
      return navSet.has(section)
    }),
  })).filter((group) => group.sections.length > 0 || (group.id === "output" && canAccessSettings))
  const documentRoleList = (
    <ProgrammeDocumentRoles
      workspaceId={workspaceId}
      corpusDocs={corpusDocs}
      bindings={bindings}
      pending={pending}
      canBind={chromeJob !== "reviewer"}
      citablePublications={citablePublications}
      citePublicationId={citePublicationId}
      onCitePublicationIdChange={setCitePublicationId}
      onBindingsChange={setBindings}
      onMessage={notify}
      onRefresh={refresh}
      startTransition={startTransition}
    />
  )
  const coachSection = isKnowledgeView ? "knowledge" : showSetupWizard ? "setup" : activeSection

  useEffect(() => {
    setGuidance({
      surface: "programme",
      job: chromeJob,
      guidanceMode,
      helpAiEnabled,
      spaceId,
      pipeline,
      section: coachSection,
      documentTitles: listBoundDocumentsForHelp(corpusDocs || [], bindings),
      onNavigate: (section, target) => {
        setSection(section)
        if (target) {
          window.setTimeout(() => {
            const el = document.querySelector(`[data-guidance-target="${target}"]`)
            if (el instanceof HTMLElement) el.focus()
          }, 50)
        }
      },
      reviewComplete: pipeline.stages.review,
      expertPromptDismissed,
      setupInProgress: showSetupWizard,
    })
    return () => setGuidance(null)
  }, [
    bindings,
    chromeJob,
    coachSection,
    corpusDocs,
    expertPromptDismissed,
    guidanceMode,
    helpAiEnabled,
    pipeline,
    setGuidance,
    setSection,
    showSetupWizard,
    spaceId,
  ])

  return (
    <ProgrammeTextHistoryProvider>
    <>
    <div className="relative flex h-dvh flex-col overflow-hidden bg-white">
      <header
        className={cn(
          "shrink-0 border-b bg-card",
          !sheetOpen && "bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75",
        )}
      >
        <div className="relative flex h-16 min-w-0 items-center px-4">
          <Button variant="ghost" asChild className="relative z-10 justify-self-start min-w-0">
            <Link href={`/spaces/${spaceId}`}>
              <ArrowLeft className="mr-2 h-3 w-3 shrink-0" />
              <span className="min-w-0 truncate text-xs font-normal">
                {t("workspace.navigation.backToSpace")} {spaceName || t("workspace.programme.back")}
              </span>
            </Link>
          </Button>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 sm:px-24">
            <div className="pointer-events-auto w-max max-w-[min(100%,36rem)]">
              <OverflowTitle title={workspaceName} fit className="text-2xl font-semibold tracking-tight" />
            </div>
          </div>
          {canAccessSettings ? (
            <div className="relative z-10 ml-auto">
              <DropdownMenu>
                <IconTooltip label={t("space.workspaces.dropdownMenuSr")} side="bottom">
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant={accessPanel ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      aria-label={t("space.workspaces.dropdownMenuSr")}
                      aria-haspopup="menu"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </IconTooltip>
                <DropdownMenuContent align="end" className="w-44">
                  <ProgrammeAccessMenuItems onPick={(panel) => setAccessPanel(panel)} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </header>
      {showSetupWizard ? null : (
      <ProgrammeToolsToolbar
        groups={documentMenuGroups}
        activeSection={activeSection}
        sheetOpen={sheetOpen}
        onSection={setSection}
        canAccessSettings={canAccessSettings}
        publicationLoaded={snapshotLoaded}
        published={Boolean(publication)}
        onSaveAsTemplate={canAccessSettings ? () => setSaveAsTemplateOpen(true) : undefined}
        chrome={
          <ProgrammeDocumentChrome
            compact
            isKnowledgeView={isKnowledgeView}
            layout={documentLayout}
            onLayoutChange={patchDocumentLayout}
            documentMode={documentMode}
            onDocumentModeChange={setDocumentMode}
            onViewChange={setMode}
            canWrite={writableChapters.length > 0}
            writableChapters={writableChapters}
            focusChapterIds={documentSearch.focusIds}
            onFocusChapterIdsChange={setFocusVisibleIds}
          />
        }
      />
      )}
      {!showSetupWizard &&
      guidanceMode === "guided" &&
      pipeline.firstIncomplete &&
      pipeline.firstIncomplete !== "orient" ? (
        <div
          data-guidance-next=""
          className="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {t("guidance.coach.next", undefined, {
                action: t(`guidance.coach.stages.${pipeline.firstIncomplete}`),
              })}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {t(NEXT_COPY[pipeline.firstIncomplete] ?? "guidance.coach.nothingRequired")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setSection(pipeline.firstIncompleteSection)
              const target = pipeline.firstIncomplete ? STAGE_TARGET[pipeline.firstIncomplete] : undefined
              if (!target) return
              window.setTimeout(() => {
                const el = document.querySelector(`[data-guidance-target="${target}"]`)
                if (el instanceof HTMLElement) el.focus()
              }, 50)
            }}
          >
            {t("guidance.coach.goThere")}
          </Button>
        </div>
      ) : null}
      <ProgrammeAccessDialogs
        workspace={{
          id: workspaceId,
          name: workspaceName,
          summary: workspaceSummary,
          description: workspaceDescription,
        }}
        panel={accessPanel}
        onClose={() => setAccessPanel(null)}
        onDeleted={() => router.push(`/spaces/${spaceId}`)}
      />
      {canAccessSettings ? (
        <SaveProgrammeAsTemplateDialog
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          open={saveAsTemplateOpen}
          onOpenChange={setSaveAsTemplateOpen}
          onSaved={refresh}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isKnowledgeView ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="container mx-auto py-8 px-8">
              <ProgrammeKnowledgeView
                workspaceId={workspaceId}
                currentUserId={currentUserId}
                canManage={chromeJob !== "reviewer"}
                excludeDocumentIds={Object.values(bindings.chapterDocuments || {})}
                filesExtra={documentRoleList}
              />
            </div>
          </div>
        ) : (
          <div className={`flex min-h-0 flex-1 overflow-hidden ${programmeDocumentCanvasClass({ paged: documentLayout.paged && !structureOpen && !showSetupWizard })}`}>
            {showSetupWizard && !structureOpen ? (
              <ProgrammeSetupWizard
                workspaceId={workspaceId}
                spaceId={spaceId}
                bindings={bindings}
                templates={templates}
                corpusDocs={corpusDocs}
                canEdit={canRunSetup}
                onBindingsChange={setBindings}
                onMessage={notify}
                onRefresh={refresh}
                onStartWriting={async (next) => {
                  const merged = { ...(next ?? bindings), setupComplete: true }
                  const result = await updateProgrammeBindings(workspaceId, merged)
                  if (result.error) {
                    notify(result.error, "error")
                    return
                  }
                  const agents = await ensureDefaultAgentsBound(workspaceId, spaceId)
                  if (agents.error) {
                    notify(agents.error, "error")
                    setBindings(merged)
                  } else if (agents.data) {
                    setBindings({ ...agents.data, setupComplete: true })
                  } else {
                    setBindings(merged)
                  }
                  setWizardSession(false)
                  setDocumentMode("edit")
                }}
              />
            ) : (
            <ProgrammeChapterEditor
              workspaceId={workspaceId}
              spaceId={spaceId}
              bindings={bindings}
              onBindingsChange={setBindings}
              onMessage={notify}
              onGoOutline={() => setSection("outline")}
              onShowDocument={closeStructure}
              structureOpen={structureOpen}
              canEditOutline={accessRole !== "viewer"}
              canComment
              documentMode={documentMode}
              activeChapterId={documentSearch.chapterId}
              focusChapterIds={documentSearch.focusIds}
              onActivateChapter={setActiveChapter}
              onWritableChaptersChange={(next) => {
                setWritableChapters((current) => {
                  if (
                    current.length === next.length &&
                    current.every((chapter, index) => chapter.id === next[index]?.id && chapter.title === next[index]?.title)
                  ) {
                    return current
                  }
                  return next
                })
              }}
              currentUserId={currentUserId}
              accessRole={accessRole}
              documentOwnerId={documentOwnerId}
              reviewers={reviewers}
              draftAgents={agents.filter((agent) => agent.stage === "draft" || agent.stage === "chat")}
              onChapterOwnerChange={refresh}
              layout={documentLayout}
              workspaceName={workspaceName}
            />
            )}
          </div>
        )}
      </div>

      <Dialog open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet() }}>
        <DialogContent
          overlayClassName="z-[70]"
          className="z-[80] flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden sm:max-w-4xl"
        >
        <ErrorBoundary resetKeys={[activeSection]}>
          <DialogHeader className="sr-only">
            <DialogTitle>{t(`workspace.programme.nav.${activeSection}`, activeSection)}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          <Tabs value={activeSection} onValueChange={setSection} className="space-y-6">
        <TabsContent value="overview" className="space-y-4">
          <StageHeading
            title={t("workspace.programme.nav.overview")}
            purpose={t("workspace.programme.purpose.overview")}
          />
          {workspaceSummary.trim() ? (
            <p className="whitespace-pre-line text-sm font-semibold text-foreground">{workspaceSummary}</p>
          ) : null}
          {workspaceDescription.trim() ? (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{workspaceDescription}</p>
          ) : null}
          {pipeline.firstIncomplete ? (
            <Button type="button" onClick={() => setSection(pipeline.firstIncompleteSection)}>
              {t("guidance.coach.next", undefined, {
                action: t(`guidance.coach.stages.${pipeline.firstIncomplete}`),
              })}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t("guidance.coach.nothingRequired")}</p>
          )}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("workspace.programme.overviewNotesTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("workspace.programme.overviewNotesHint")}</p>
            {currentUserId ? (
              <WorkspaceNotesPanel
                key={notes.map((note) => note.id).join("-") || "empty"}
                workspaceId={workspaceId}
                currentUserId={currentUserId}
                initialNotes={notes}
                canManage={chromeJob !== "reviewer"}
                hideHeading
              />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="setup" className="space-y-4">
          <StageHeading
            title={t("workspace.programme.setupTitle")}
            purpose={t("workspace.programme.purpose.setup")}
          />
          <p className="text-sm text-muted-foreground">{t("workspace.programme.setupHint")}</p>
          <ol className="space-y-2 text-sm">
            {setupSteps.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left"
                  onClick={() => setSection(step.section)}
                >
                  <span className="font-medium">{index + 1}.</span>
                  <span className={step.done ? "text-muted-foreground line-through" : ""}>{step.label}</span>
                  {step.done && (
                    <span className="ml-auto text-xs text-muted-foreground">{t("workspace.programme.setupDone")}</span>
                  )}
                </button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {nextSetupStep && nextSetupStep.section !== "setup" && (
              <Button variant="outline" onClick={() => setSection(nextSetupStep.section)}>
                {t("workspace.programme.setupNext", undefined, { step: nextSetupStep.label })}
              </Button>
            )}
            <Button variant="outline" onClick={() => setSection("agents")}>
              {t("workspace.programme.setupGoAgents")}
            </Button>
            <Button variant="outline" onClick={() => setSection("outline")}>
              {t("workspace.programme.setupGoOutline")}
            </Button>
            <Button variant="outline" onClick={() => setSection("analysis")}>
              {t("workspace.programme.setupGoAnalysis")}
            </Button>
            <Button variant="outline" onClick={() => setSection("corpus")}>
              {t("workspace.programme.setupGoCorpus")}
            </Button>
            <Button variant="outline" onClick={() => setSection("measures")}>
              {t("workspace.programme.setupGoMeasures")}
            </Button>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-[16rem] flex-1">
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("workspace.programme.noTemplates")}</p>
                ) : (
                  <ProgrammeTemplatePicker
                    templates={templates}
                    value={bindings.templateId ?? null}
                    allowNone={!bindings.templateId}
                    disabled={pending}
                    label={t("workspace.programme.bindTemplate")}
                    help={t("workspace.programme.bindTemplateHint")}
                    onChange={(next) => {
                      if (!next || next === bindings.templateId) return
                      startTransition(async () => {
                        const saved = await bindWorkspaceTemplate(workspaceId, next)
                        if (saved.data) setBindings(saved.data)
                        const name = templates.find((tpl) => tpl.id === next)?.name || next
                        notifyResult(saved.error, t("workspace.programme.templateBound", undefined, { name }))
                      })
                    }}
                  />
                )}
              </div>
            </div>
            {bindings.templateId ? (
              <p className="text-xs text-muted-foreground">{t("workspace.programme.bindTemplateSwitchHint")}</p>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("workspace.programme.bindingsSummary", undefined, {
              playbook: boundTemplateName || bindings.templateId || t("workspace.programme.none"),
              vision: bindings.environmentalVisionDocumentIds.join(", ") || t("workspace.programme.none"),
            })}
          </p>
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">{t("workspace.programme.documentOwner")}</p>
            <Select
              value={documentOwnerId || "none"}
              disabled={pending || !canAdminister}
              onValueChange={(value) =>
                startTransition(async () => {
                  if (value === "none") return
                  const result = await assignDocumentOwner(workspaceId, value)
                  if (result.data?.documentOwnerId) setDocumentOwnerId(result.data.documentOwnerId)
                  notifyResult(result.error, t("workspace.programme.ownerSaved"))
                })
              }
            >
              <SelectTrigger size="sm" className="min-w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("workspace.programme.ownerUnassigned")}</SelectItem>
                {reviewers.map((reviewer) => (
                  <SelectItem key={reviewer.id} value={reviewer.id}>
                    {reviewer.name}
                    {reviewer.id === currentUserId ? ` (${t("workspace.programme.reviewerYou")})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">{t("workspace.programme.policyTitle")}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={policies.distinctReviewer}
                disabled={pending}
                onChange={(e) =>
                  startTransition(async () => {
                    const result = await updateProgrammePolicies(workspaceId, { distinctReviewer: e.target.checked })
                    if (result.data) setPolicies((prev) => ({ ...prev, ...result.data }))
                    notifyResult(result.error, t("workspace.programme.policySaved"))
                  })
                }
              />
              {t("workspace.programme.distinctReviewer")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={policies.stakeholderExportRequiresFreeze}
                disabled={pending}
                onChange={(e) =>
                  startTransition(async () => {
                    const result = await updateProgrammePolicies(workspaceId, {
                      stakeholderExportRequiresFreeze: e.target.checked,
                    })
                    if (result.data) setPolicies((prev) => ({ ...prev, ...result.data }))
                    notifyResult(result.error, t("workspace.programme.policySaved"))
                  })
                }
              />
              {t("workspace.programme.requireFreeze")}
            </label>
          </div>
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <StageHeading
            title={t("workspace.programme.nav.agents")}
            purpose={t("workspace.programme.purpose.agents")}
          />
          <p className="text-sm text-muted-foreground">{t("workspace.programme.agentsHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    const result = await ensureDefaultAgentsBound(workspaceId, spaceId)
                    notifyResult(result.error, t("workspace.programme.agentsBound"))
                    if ("data" in result && result.data) setBindings(result.data)
                    refresh()
                  } catch (error) {
                    notify(error instanceof Error ? error.message : t("workspace.programme.exportFailed"), "error")
                  }
                })
              }
            >
              {t("workspace.programme.bindDefaultAgents")}
            </Button>
          </div>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("workspace.programme.agentsEmpty")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {AGENT_STAGES.map((stage) => {
                const options = agents.filter((agent) => agent.stage === stage)
                    const bound = bindings.agentBindings?.[stage] || ""
                    const selected = options.some((agent) => agent.id === bound) ? bound : undefined
                    return (
                      <label key={stage} className="space-y-1 text-xs">
                        <span className="text-muted-foreground">
                          {t("workspace.programme.bindAgentStage", undefined, {
                            stage: t(`space.agents.stages.${stage}`),
                          })}
                        </span>
                        {options.length === 0 ? (
                          <p className="text-sm text-muted-foreground">{t("workspace.programme.bindAgentEmpty")}</p>
                        ) : (
                          <Select
                            value={selected}
                        disabled={pending}
                        onValueChange={(value) =>
                          startTransition(async () => {
                            const saved = await bindWorkspaceAgents(workspaceId, { [stage]: value })
                            if (saved.data) setBindings(saved.data)
                            notifyResult(saved.error, t("workspace.programme.agentsBound"))
                          })
                        }
                      >
                        <SelectTrigger className="w-full" size="sm">
                          <SelectValue placeholder={t("workspace.programme.bindAgentUnset")} />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {t("workspace.programme.agentProvider", undefined, {
                                name: agent.name,
                                provider: agent.provider,
                              })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </label>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="corpus" className="space-y-3">
          <StageHeading
            title={t("workspace.programme.nav.corpus")}
            purpose={t("workspace.programme.purpose.corpus")}
          />
          {documentRoleList}
          <Button variant="outline" type="button" onClick={() => setMode("knowledge")}>
            {t("workspace.programme.openKnowledge")}
          </Button>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-3">
          <StageHeading
            title={t("workspace.programme.analysisTitle")}
            purpose={t("workspace.programme.purpose.analysis")}
          />
          <p className="text-sm text-muted-foreground">{t("workspace.programme.analysisHint")}</p>
          <Textarea
            value={analysisInstructions}
            onChange={(e) => setAnalysisInstructions(e.target.value)}
            placeholder={t("workspace.programme.analysisInstructions")}
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            {(["analysis", "vision", "oer", "qc"] as const).map((kind) => (
              <Button
                key={kind}
                disabled={pending}
                variant={kind === "analysis" ? "default" : "outline"}
                data-guidance-target={kind === "analysis" ? "run-analysis" : undefined}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const preview = await previewBoundAgentSources(workspaceId, kind)
                      setSourcePreview(preview.data?.preview || "")
                      if (kind === "analysis" || kind === "qc") setAnalysisJobStatus("running")
                      const result = await runBoundAgentAnalysis({
                        workspaceId,
                        kind,
                        instructions: analysisInstructions.trim() || undefined,
                      })
                      setAnalysisJobStatus("")
                      notifyResult(
                        "error" in result && result.error ? result.error : null,
                        t("workspace.programme.analysisSaved", undefined, {
                          id: "data" in result && result.data ? String(result.data.id) : "",
                        }),
                      )
                      if ("data" in result && result.data?.id) setSelectedReportId(result.data.id)
                      refresh()
                    } catch (error) {
                      setAnalysisJobStatus("")
                      notify(error instanceof Error ? error.message : t("workspace.programme.exportFailed"), "error")
                    }
                  })
                }
              >
                {t(`workspace.programme.runJob.${kind}`)}
              </Button>
            ))}
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await generateVisionSkeleton(workspaceId)
                  notifyResult(result.error, t("workspace.programme.visionSkeletonDone"))
                  refresh()
                })
              }
            >
              {t("workspace.programme.visionSkeleton")}
            </Button>
            <Button
              variant="outline"
              disabled={pending || analysisJobStatus !== "running"}
              onClick={() =>
                void cancelAnalysisJob(workspaceId, "analysis").then((result) => {
                  if (result.error) notify(result.error, "error")
                  else notify(t("workspace.programme.analysisCancel"), "info")
                })
              }
            >
              {t("workspace.programme.analysisCancel")}
            </Button>
          </div>
          {analysisJobStatus && <p className="text-sm">{t("workspace.programme.analysisJob", undefined, { status: analysisJobStatus })}</p>}
          {sourcePreview && (
            <pre className="whitespace-pre-wrap rounded-md border p-2 text-xs">{sourcePreview}</pre>
          )}
          <div className="flex flex-wrap gap-2">
            <Select value={compareA || "none"} onValueChange={(value) => setCompareA(value === "none" ? "" : value)}>
              <SelectTrigger size="sm" className="min-w-40">
                <SelectValue placeholder={t("workspace.programme.compareA")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("workspace.programme.compareA")}</SelectItem>
                {reports.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.report_type} {r.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={compareB || "none"} onValueChange={(value) => setCompareB(value === "none" ? "" : value)}>
              <SelectTrigger size="sm" className="min-w-40">
                <SelectValue placeholder={t("workspace.programme.compareB")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("workspace.programme.compareB")}</SelectItem>
                {reports.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.report_type} {r.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={pending || !compareA || !compareB}
              onClick={() =>
                startTransition(async () => {
                  const result = await compareAnalysisReports(workspaceId, compareA, compareB)
                  if (result.error || !result.data) {
                    notify(result.error || t("workspace.programme.exportFailed"), "error")
                    return
                  }
                  setCompareFindings(result.data)
                  setCompareResult(
                    t("workspace.programme.compareResult", undefined, {
                      onlyA: String(result.data.onlyA.length),
                      onlyB: String(result.data.onlyB.length),
                      shared: String(result.data.shared.length),
                    }),
                  )
                })
              }
            >
              {t("workspace.programme.compare")}
            </Button>
          </div>
          {compareResult && <p className="text-sm">{compareResult}</p>}
          {compareFindings && (
            <div className="grid gap-2 text-xs md:grid-cols-3">
              <div>
                <p className="font-medium">{t("workspace.programme.compareOnlyA")}</p>
                {compareFindings.onlyA.map((f) => (
                  <p key={f.id}>[{f.disposition}] {f.summary}</p>
                ))}
              </div>
              <div>
                <p className="font-medium">{t("workspace.programme.compareOnlyB")}</p>
                {compareFindings.onlyB.map((f) => (
                  <p key={f.id}>[{f.disposition}] {f.summary}</p>
                ))}
              </div>
              <div>
                <p className="font-medium">{t("workspace.programme.compareShared")}</p>
                {compareFindings.shared.map((f) => (
                  <p key={f.id}>[{f.disposition}] {f.summary}</p>
                ))}
              </div>
            </div>
          )}
          <ProgrammePolicyGraph nodes={graph.nodes} edges={graph.edges} />
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("workspace.programme.qcTitle")}</h3>
            {reports.filter((r) => r.report_type === "quality").length === 0 && (
              <p className="text-sm text-muted-foreground">{t("workspace.programme.qcEmpty")}</p>
            )}
            <ul className="space-y-1 text-sm">
              {reports
                .filter((r) => r.report_type === "quality")
                .slice(0, 1)
                .flatMap((r) =>
                  (Array.isArray(r.findings) ? r.findings : []).map((f: any) => ({ ...f, reportId: r.id })),
                )
                .map((f: { id: string; reportId: string; disposition?: string; summary?: string; addressed?: boolean; measureId?: string; citations?: Array<{ documentId: string }> }) => (
                  <li key={f.id} className="space-y-1 rounded-md border p-2">
                    <p>
                      [{f.disposition || "missing"}] {f.summary}
                      {f.addressed ? ` · ${t("workspace.programme.qcAddressed")}` : ""}
                    </p>
                    {f.measureId && (
                      <p className="text-xs text-muted-foreground">
                        {t("workspace.programme.qcMeasure", undefined, { id: f.measureId })}
                      </p>
                    )}
                    {Array.isArray(f.citations) && f.citations[0] && (
                      <p className="text-xs text-muted-foreground">{f.citations[0].documentId}</p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await setFindingAddressed(workspaceId, f.reportId, f.id, !f.addressed)
                          notifyResult(result.error, t("workspace.programme.qcToggled"))
                          refresh()
                        })
                      }
                    >
                      {f.addressed ? t("workspace.programme.qcReopen") : t("workspace.programme.qcAddress")}
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
          <ul className="space-y-2 text-sm">
            {reports.length === 0 && (
              <li>
                {t("workspace.programme.noReports")} {t("workspace.programme.emptyNext.analysis")}
              </li>
            )}
            {reports.map((r) => {
              const open = selectedReportId === r.id
              return (
                <li key={r.id} className="space-y-2 rounded-md border p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" className="text-left" onClick={() => setSelectedReportId(open ? null : r.id)}>
                      {r.report_type} — {new Date(r.created_at).toLocaleString()} — findings:{" "}
                      {Array.isArray(r.findings) ? r.findings.length : 0}
                      {(() => {
                        const run = runs.find((item) => item.id === r.generation_run_id)
                        const score = run?.citations?.groundedness?.score
                        return score == null
                          ? ""
                          : ` · ${t("workspace.programme.groundednessRun", undefined, {
                              score: String(score),
                              issues: String(run?.citations?.groundedness?.issues?.length ?? 0),
                            })}`
                      })()}
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || !r.generation_run_id}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await rerunAnalysisFromReport(workspaceId, r.id, analysisInstructions.trim() || undefined)
                          notifyResult(result.error, t("workspace.programme.analysisRerun"))
                          refresh()
                        })
                      }
                    >
                      {t("workspace.programme.analysisRerun")}
                    </Button>
                  </div>
                  {open &&
                    Array.isArray(r.findings) &&
                    r.findings.map((f: any) => (
                      <div key={f.id} className="rounded-md bg-muted/40 p-2 text-xs">
                        <p>
                          [{f.disposition}] {f.summary}
                        </p>
                        {f.visionAnchor && <p>{t("workspace.programme.findingAnchor", undefined, { value: f.visionAnchor })}</p>}
                        {f.provincialInterest && (
                          <p>{t("workspace.programme.findingInterest", undefined, { value: f.provincialInterest })}</p>
                        )}
                        {f.conflictWithDocumentId && (
                          <p>{t("workspace.programme.findingConflict", undefined, { value: f.conflictWithDocumentId })}</p>
                        )}
                        {Array.isArray(f.citations) &&
                          f.citations.map((c: { documentId: string; sectionId?: string; quote?: string; pageNumber?: number }, index: number) => (
                            <p key={`${c.documentId}-${index}`}>
                              {formatCitationLabel(c, citationCatalog.documents, citationCatalog.sections)}
                              {c.quote ? ` — ${c.quote}` : ""}
                            </p>
                          ))}
                        {f.oerTheme && (
                          <p>
                            {t("workspace.programme.oerTheme")}: {f.oerTheme}
                          </p>
                        )}
                        {r.generation_run_id && <p>run {String(r.generation_run_id).slice(0, 8)}</p>}
                      </div>
                    ))}
                </li>
              )
            })}
          </ul>
        </TabsContent>

        <TabsContent value="measures" className="space-y-3">
          <StageHeading
            title={t("workspace.programme.measuresTitle")}
            purpose={t("workspace.programme.purpose.measures")}
          />
          <Textarea
            value={measureInstructions}
            onChange={(e) => setMeasureInstructions(e.target.value)}
            rows={3}
            placeholder={t("workspace.programme.measuresInstructionsPlaceholder")}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const preview = await previewBoundAgentSources(workspaceId, "measures")
                  setSourcePreview(
                    [
                      preview.data?.provider && `Provider: ${preview.data.provider}`,
                      preview.data?.model && `Model: ${preview.data.model}`,
                      preview.data?.preview,
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  )
                })
              }
            >
              {t("workspace.programme.previewSources")}
            </Button>
            <Button
              disabled={pending}
              data-guidance-target="generate-measures"
              onClick={() =>
                startTransition(async () => {
                  try {
                  const result = await generateProgrammeMeasuresFromContext(workspaceId, {
                    instructions: measureInstructions || undefined,
                    count: 5,
                  })
                  if (result.error) {
                    notify(result.error, "error")
                    return
                  }
                  const errCount = result.data?.errors?.length ?? 0
                  notify(
                    t("workspace.programme.measuresGenerated", undefined, {
                      count: String(result.data?.saved ?? 0),
                      errors: String(errCount),
                    }),
                    errCount > 0 ? "warning" : "success",
                  )
                  refresh()
                  } catch (error) {
                    notify(error instanceof Error ? error.message : t("workspace.programme.exportFailed"), "error")
                  }
                })
              }
            >
              {t("workspace.programme.generateMeasures")}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await convertPolicyProseToMeasures(workspaceId, measureInstructions)
                  notifyResult(result.error, t("workspace.programme.pipelineConverted", undefined, { count: String(result.data?.saved ?? 0) }))
                  refresh()
                })
              }
            >
              {t("workspace.programme.convertPolicy")}
            </Button>
          </div>
          {sourcePreview && <pre className="whitespace-pre-wrap rounded-md border p-2 text-xs">{sourcePreview}</pre>}
          <details className="rounded-md border p-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {t("workspace.programme.importMeasuresEscape")}
            </summary>
            <div className="mt-2 space-y-2">
              <Textarea
                value={measureImportJson}
                onChange={(e) => setMeasureImportJson(e.target.value)}
                rows={4}
                placeholder={t("workspace.programme.importMeasuresPlaceholder")}
              />
              <Button
                variant="outline"
                disabled={pending || !measureImportJson.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const result = await mergeMeasureFragment(workspaceId, measureImportJson)
                    if (result.error) {
                      notify(result.error, "error")
                      return
                    }
                    notify(
                      t("workspace.programme.measuresImported", undefined, {
                        count: String(result.data?.merged ?? 0),
                      }),
                    )
                    setMeasureImportJson("")
                    refresh()
                  })
                }
              >
                {t("workspace.programme.importMeasures")}
              </Button>
            </div>
          </details>
          {duplicates.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">{t("workspace.programme.duplicatesTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {t("workspace.programme.duplicatesHint", undefined, { count: String(duplicates.length) })}
              </p>
              {duplicates.map((group) => (
                <div key={group.map((item) => item.id).join("-")} className="space-y-1 rounded-md border p-2 text-sm">
                  <p>
                    {group[0]?.title}
                    {group[0]?.reason === "near_duplicate" || group[0]?.reason === "cross_chapter"
                      ? ` · ${t("workspace.programme.duplicatesNear", undefined, { score: String(group[0]?.score ?? "") })}`
                      : ""}
                  </p>
                  <ul className="space-y-1">
                    {group.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs">{item.id.slice(0, 8)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending || group.length < 2}
                          onClick={() =>
                            startTransition(async () => {
                              let lastError: string | undefined
                              for (const other of group.filter((candidate) => candidate.id !== item.id)) {
                                const result = await mergeDuplicateMeasures(workspaceId, item.id, other.id)
                                if (result.error) lastError = result.error
                              }
                              notifyResult(lastError, t("workspace.programme.mergeDone", undefined, { title: item.title }))
                              refresh()
                            })
                          }
                        >
                          {t("workspace.programme.mergeKeep")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <ul className="space-y-2 text-sm">
            {measures.length === 0 && (
              <li>
                {t("workspace.programme.noMeasures")} {t("workspace.programme.emptyNext.measures")}
              </li>
            )}
            {measures.map((m) => (
              <li key={m.id} className="space-y-2 rounded-md border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    [{m.workflow_status}] {m.title} ({m.measure_type})
                    {m.outline_node_id ? ` · node ${String(m.outline_node_id).slice(0, 8)}` : ""}
                    {Array.isArray(m.citations) && m.citations.length
                      ? ` · ${m.citations
                          .map((citation: { documentId: string; sectionId?: string; pageNumber?: number }) =>
                            formatCitationLabel(citation, citationCatalog.documents, citationCatalog.sections),
                          )
                          .join("; ")}`
                      : ""}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingMeasureId(m.id)
                        setMeasureDraft({
                          title: m.title,
                          type: m.measure_type || "measure",
                          specificAction: m.specific_action || "",
                          ownerRole: m.owner_role || "",
                          geography: m.geography || "",
                          timeline: m.timeline || "",
                          indicator: m.indicator || "",
                          successCriterion: m.success_criterion || "",
                          contributesToVision: (m.contributes_to_vision || []).join(", "),
                          provincialInterests: (m.provincial_interests || []).join(", "),
                          narrative: m.narrative || "",
                        })
                      }}
                    >
                      {t("workspace.programme.editMeasure")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          if (historyMeasureId === m.id) {
                            setHistoryMeasureId(null)
                            setMeasureVersions([])
                            return
                          }
                          const listed = await listArtefactVersions(workspaceId, "measure", m.id)
                          setHistoryMeasureId(m.id)
                          setMeasureVersions(listed.data || [])
                          setRestoreReason("")
                        })
                      }
                    >
                      {historyMeasureId === m.id
                        ? t("workspace.programme.hideHistory")
                        : t("workspace.programme.history")}
                    </Button>
                    {(m.workflow_status === "generated" || m.workflow_status === "revised") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await setMeasureWorkflowStatus(workspaceId, m.id, "in_review")
                            refresh()
                          })
                        }
                      >
                        {t("workspace.programme.requestReview")}
                      </Button>
                    )}
                    {m.workflow_status !== "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await approveProgrammeMeasure(workspaceId, m.id)
                            notifyResult(
                              result.error,
                              t("workspace.programme.measureApproved", undefined, { title: m.title }),
                            )
                            refresh()
                          })
                        }
                      >
                        {t("workspace.programme.approveMeasure")}
                      </Button>
                    )}
                  </div>
                </div>
                {editingMeasureId === m.id && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-xs sm:col-span-2">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.title")}</span>
                      <Input
                        value={measureDraft.title}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, title: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.type")}</span>
                      <Select
                        value={measureDraft.type}
                        onValueChange={(value) => setMeasureDraft((p) => ({ ...p, type: value }))}
                      >
                        <SelectTrigger className="w-full" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ambition">ambition</SelectItem>
                          <SelectItem value="goal">goal</SelectItem>
                          <SelectItem value="measure">measure</SelectItem>
                          <SelectItem value="implementation">implementation</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.ownerRole")}</span>
                      <Input
                        value={measureDraft.ownerRole}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, ownerRole: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs sm:col-span-2">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.specificAction")}</span>
                      <Textarea
                        rows={2}
                        value={measureDraft.specificAction}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, specificAction: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.geography")}</span>
                      <Input
                        value={measureDraft.geography}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, geography: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.timeline")}</span>
                      <Input
                        value={measureDraft.timeline}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, timeline: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.indicator")}</span>
                      <Input
                        value={measureDraft.indicator}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, indicator: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.successCriterion")}</span>
                      <Input
                        value={measureDraft.successCriterion}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, successCriterion: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs sm:col-span-2">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.contributesToVision")}</span>
                      <Input
                        value={measureDraft.contributesToVision}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, contributesToVision: e.target.value }))}
                      />
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.listHint")}</span>
                    </label>
                    <label className="space-y-1 text-xs sm:col-span-2">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.provincialInterests")}</span>
                      <Input
                        value={measureDraft.provincialInterests}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, provincialInterests: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs sm:col-span-2">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.narrative")}</span>
                      <Textarea
                        rows={3}
                        value={measureDraft.narrative}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, narrative: e.target.value }))}
                      />
                    </label>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await upsertProgrammeMeasure(workspaceId, {
                            id: m.id,
                            title: measureDraft.title,
                            type: measureDraft.type as "ambition" | "goal" | "measure" | "implementation",
                            specificAction: measureDraft.specificAction,
                            ownerRole: measureDraft.ownerRole || undefined,
                            geography: measureDraft.geography || undefined,
                            timeline: measureDraft.timeline || undefined,
                            indicator: measureDraft.indicator || undefined,
                            successCriterion: measureDraft.successCriterion || undefined,
                            citations: m.citations || [],
                            contributesToVision: splitAnchorList(measureDraft.contributesToVision),
                            provincialInterests: splitAnchorList(measureDraft.provincialInterests),
                            effectsDirection: m.effects_direction,
                            effectsDeviation: m.effects_deviation,
                            effectsJustification: m.effects_justification,
                            narrative: measureDraft.narrative,
                            outlineNodeId: m.outline_node_id,
                            workflowStatus: m.workflow_status === "generated" ? "revised" : m.workflow_status,
                          })
                          notifyResult(result.error, t("workspace.programme.measureEdited"))
                          setEditingMeasureId(null)
                          refresh()
                        })
                      }
                    >
                      {t("workspace.programme.saveMeasure")}
                    </Button>
                  </div>
                )}
                {historyMeasureId === m.id && (
                  <div className="space-y-2 border-t pt-2">
                    {measureVersions.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t("workspace.programme.noVersions")}</p>
                    )}
                    <Input
                      value={restoreReason}
                      onChange={(e) => setRestoreReason(e.target.value)}
                      placeholder={t("workspace.programme.restoreReason")}
                    />
                    {measureVersions.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        <Select
                          value={compareVersionA || "none"}
                          onValueChange={(value) => setCompareVersionA(value === "none" ? "" : value)}
                        >
                          <SelectTrigger size="sm" className="min-w-36">
                            <SelectValue placeholder={t("workspace.programme.compareA")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t("workspace.programme.compareA")}</SelectItem>
                            {measureVersions.map((version) => (
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
                            {measureVersions.map((version) => (
                              <SelectItem key={`mb-${version.id}`} value={version.id}>
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
                                notify(result.error || t("workspace.programme.exportFailed"), "error")
                                return
                              }
                              setMeasureDiff(result.data.diff)
                            })
                          }
                        >
                          {t("workspace.programme.compareVersions")}
                        </Button>
                      </div>
                    )}
                    {measureDiff.map((entry) => (
                      <p key={entry.path} className="text-xs">
                        {entry.path}: {entry.before.slice(0, 60)} → {entry.after.slice(0, 60)}
                      </p>
                    ))}
                    <ul className="space-y-1 text-xs">
                      {measureVersions.map((version) => (
                        <li key={version.id} className="flex items-center justify-between gap-2">
                          <span>
                            {new Date(version.created_at).toLocaleString()}
                            {version.reason ? ` · ${version.reason}` : ""}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending || !restoreReason.trim()}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await restoreArtefactVersion(workspaceId, version.id, restoreReason)
                                notifyResult(result.error, t("workspace.programme.restoreDone"))
                                refresh()
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
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="effects" className="space-y-3">
          <StageHeading
            title={t("workspace.programme.nav.effects")}
            purpose={t("workspace.programme.purpose.effects")}
          />
          <ProgrammeEffectsPanel
            workspaceId={workspaceId}
            measures={measures}
            reports={reports}
            onMessage={notify}
            onRefresh={refresh}
            onGoMeasures={() => setSection("measures")}
          />
        </TabsContent>

        <TabsContent value="provenance" className="space-y-3">
          <StageHeading
            title={t("workspace.programme.provenanceTitle")}
            purpose={t("workspace.programme.purpose.provenance")}
          />
          {observability && (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p>
                {t("workspace.programme.metricsRuns", undefined, {
                  count: String(observability.generationRunCount),
                })}
              </p>
              <p>
                {t("workspace.programme.metricsCoverage", undefined, {
                  rate:
                    observability.citationCoverageRate == null
                      ? "—"
                      : `${Math.round(observability.citationCoverageRate * 100)}%`,
                })}
              </p>
              <p>
                {t("workspace.programme.metricsUnused", undefined, {
                  rate:
                    observability.unusedSourceRate == null
                      ? "—"
                      : `${Math.round(observability.unusedSourceRate * 100)}%`,
                })}
              </p>
              <p>
                {t("workspace.programme.metricsExportFail", undefined, {
                  rate:
                    observability.exportFailureRate == null
                      ? "—"
                      : `${Math.round(observability.exportFailureRate * 100)}%`,
                })}
              </p>
              <p className="sm:col-span-2">
                {t("workspace.programme.metricsModels", undefined, {
                  models: observability.modelsUsed.join(", ") || t("workspace.programme.none"),
                })}
              </p>
            </div>
          )}
          <ul className="text-sm">
            {runs.length === 0 && (
              <li>
                {t("workspace.programme.noRuns")} {t("workspace.programme.emptyNext.provenance")}
              </li>
            )}
            {runs.map((r) => {
              const unused = Array.isArray(r.citations?.unusedSources) ? r.citations.unusedSources : []
              const groundedness = r.citations?.groundedness
              return (
                <li key={r.id} className="space-y-1 rounded-md border p-2">
                  <p>
                    {r.kind} — {r.model || "n/a"}
                    {groundedness
                      ? ` · ${t("workspace.programme.groundednessRun", undefined, {
                          score: String(groundedness.score ?? "—"),
                          issues: String(groundedness.issues?.length ?? 0),
                        })}`
                      : ""}
                  </p>
                  {unused.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("workspace.programme.unusedNone")}</p>
                  ) : (
                    <ul className="text-xs text-muted-foreground">
                      {unused.map((item: { id: string; title: string; kind: string }) => (
                        <li key={`${r.id}-${item.id}`}>
                          {item.kind === "excluded"
                            ? t("workspace.programme.unusedExcluded")
                            : item.kind === "not_cited"
                              ? t("workspace.programme.unusedNotCited")
                              : t("workspace.programme.unusedShouldUse")}
                          {`: ${item.title}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </TabsContent>

        <TabsContent value="review" className="space-y-3">
          <StageHeading
            title={t("workspace.programme.nav.review")}
            purpose={t("workspace.programme.purpose.review")}
          />
          <p className="text-sm text-muted-foreground">{t("workspace.programme.reviewHint")}</p>
          <p className="text-xs text-muted-foreground">{t("workspace.programme.reviewLocalHint")}</p>
          <div className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-medium">{t("workspace.programme.colleagueThemesTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("workspace.programme.colleagueThemesHint")}</p>
            <p className="text-xs text-muted-foreground">{t("workspace.programme.colleagueNotConsultation")}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await clusterColleagueComments(workspaceId)
                  notifyResult(result.error, t("workspace.programme.colleagueClustered"))
                  refresh()
                })
              }
            >
              {t("workspace.programme.colleagueClusterAction")}
            </Button>
            {commentThemes.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("workspace.programme.colleagueThemesEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {commentThemes.map((theme) => (
                  <li key={theme.id} className="space-y-1 rounded-md border p-2">
                    <p className="text-sm font-medium">{theme.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("workspace.programme.colleagueThemeComments", undefined, { count: String(theme.commentCount) })}
                    </p>
                    {theme.summary ? <p className="text-xs">{theme.summary}</p> : null}
                    {theme.suggestedReply ? (
                      <p className="text-xs text-muted-foreground">
                        {t("workspace.programme.colleagueThemeSuggestedReply")}: {theme.suggestedReply}
                      </p>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await setProgrammeCommentThemeAddressed(
                            workspaceId,
                            theme.id,
                            !theme.addressed,
                          )
                          notifyResult(
                            result.error,
                            theme.addressed
                              ? t("workspace.programme.colleagueThemeReopen")
                              : t("workspace.programme.colleagueThemeAddressed"),
                          )
                          refresh()
                        })
                      }
                    >
                      {theme.addressed
                        ? t("workspace.programme.colleagueThemeReopen")
                        : t("workspace.programme.colleagueThemeAddressed")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={policies.distinctReviewer}
              disabled={pending}
              onChange={(e) =>
                startTransition(async () => {
                  const result = await updateProgrammePolicies(workspaceId, { distinctReviewer: e.target.checked })
                  if (result.data) setPolicies((prev) => ({ ...prev, ...result.data }))
                  notifyResult(result.error, t("workspace.programme.policySaved"))
                })
              }
            />
            {t("workspace.programme.distinctReviewer")}
          </label>
          <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await seedLocalProgrammeReviewer(workspaceId)
                notifyResult(
                  result.error,
                  t("workspace.programme.localReviewerSeeded", undefined, {
                    email: result.data?.email || "reviewer.dev@example.com",
                  }),
                )
                refresh()
              })
            }
          >
            {t("workspace.programme.seedLocalReviewer")}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await approveAllProgrammeLocally(workspaceId)
                if (result.error || !result.data) {
                  notify(result.error || t("workspace.programme.approveAllFailed"), "error")
                  return
                }
                setPolicies((prev) => ({ ...prev, distinctReviewer: false }))
                const blocked = [...result.data.measures, ...result.data.chapters].filter((item) => item.status === "blocked")
                notify(
                  blocked.length
                    ? t("workspace.programme.approveAllPartial", undefined, {
                        blocked: String(blocked.length),
                        detail: blocked.map((item) => `${item.title}: ${item.error}`).join(" · "),
                      })
                    : t("workspace.programme.approveAllDone", undefined, {
                        measures: String(result.data.measures.filter((item) => item.status === "approved").length),
                        chapters: String(result.data.chapters.filter((item) => item.status === "approved").length),
                      }),
                  blocked.length ? "warning" : "success",
                )
                refresh()
              })
            }
          >
            {t("workspace.programme.approveAllLocally")}
          </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {!reviewHasPending && (
              <li>
                {reviewHasArtefacts
                  ? t("workspace.programme.reviewEmpty")
                  : `${t("workspace.programme.reviewEmptyNone")} ${t("workspace.programme.emptyNext.review")}`}
              </li>
            )}
            {pendingMeasures.map((m) => (
                <li key={m.id} className="space-y-2 rounded-md border p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      [{m.workflow_status}] {m.title}
                      {m.assigned_reviewer_id
                        ? ` · ${reviewers.find((reviewer) => reviewer.id === m.assigned_reviewer_id)?.name || m.assigned_reviewer_id.slice(0, 8)}`
                        : ""}
                    </span>
                    <div className="flex gap-1">
                      {(m.workflow_status === "generated" || m.workflow_status === "revised") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await setMeasureWorkflowStatus(workspaceId, m.id, "in_review")
                              refresh()
                            })
                          }
                        >
                          {t("workspace.programme.requestReview")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await setMeasureWorkflowStatus(workspaceId, m.id, "revised")
                            refresh()
                          })
                        }
                      >
                        {t("workspace.programme.requestChanges")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={pending || m.workflow_status === "generated"}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await approveProgrammeMeasure(workspaceId, m.id)
                            notifyResult(
                              result.error,
                              t("workspace.programme.measureApproved", undefined, { title: m.title }),
                            )
                            refresh()
                          })
                        }
                      >
                        {t("workspace.programme.approveMeasure")}
                      </Button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{t("workspace.programme.assignReviewer")}</span>
                    <Select
                      value={m.assigned_reviewer_id || "none"}
                      disabled={pending}
                      onValueChange={(value) =>
                        startTransition(async () => {
                          const result = await assignMeasureReviewer(workspaceId, m.id, value === "none" ? null : value)
                          notifyResult(result.error, t("workspace.programme.reviewerAssigned"))
                          refresh()
                        })
                      }
                    >
                      <SelectTrigger size="sm" className="min-w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("workspace.programme.reviewerUnassigned")}</SelectItem>
                        {reviewers.map((reviewer) => (
                          <SelectItem key={reviewer.id} value={reviewer.id}>
                            {reviewer.name}
                            {reviewer.id === currentUserId ? ` (${t("workspace.programme.reviewerYou")})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <div className="flex gap-2">
                    <Textarea
                      rows={2}
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder={t("workspace.programme.commentPlaceholder")}
                    />
                    <Button
                      size="sm"
                      disabled={pending || !commentBody.trim()}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await addProgrammeComment({
                            workspaceId,
                            artefactType: "measure",
                            artefactId: m.id,
                            body: commentBody,
                          })
                          notifyResult(result.error, t("workspace.programme.commentAdded"))
                          setCommentBody("")
                          refresh()
                        })
                      }
                    >
                      {t("workspace.programme.addComment")}
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
          <h3 className="text-sm font-medium">{t("workspace.programme.chapterReviewTitle")}</h3>
          <ul className="space-y-2 text-sm">
            {pendingChapters.map((chapter) => (
                <li key={chapter.documentId} className="space-y-2 rounded-md border p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      [{chapter.workflowStatus}] {chapter.title}
                    </span>
                    <div className="flex gap-1">
                      {(chapter.workflowStatus === "generated" || chapter.workflowStatus === "revised") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await setChapterWorkflowStatus(workspaceId, chapter.documentId, "in_review")
                              refresh()
                            })
                          }
                        >
                          {t("workspace.programme.requestReview")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await setChapterWorkflowStatus(workspaceId, chapter.documentId, "revised")
                            refresh()
                          })
                        }
                      >
                        {t("workspace.programme.requestChanges")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={pending || chapter.workflowStatus === "generated"}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await setChapterWorkflowStatus(workspaceId, chapter.documentId, "approved")
                            notifyResult(result.error, t("workspace.programme.chapterApproved"))
                            refresh()
                          })
                        }
                      >
                        {t("workspace.programme.approveChapter")}
                      </Button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{t("workspace.programme.assignReviewer")}</span>
                    <Select
                      value={chapter.assignedReviewerId || "none"}
                      disabled={pending}
                      onValueChange={(value) =>
                        startTransition(async () => {
                          const result = await assignChapterReviewer(
                            workspaceId,
                            chapter.documentId,
                            value === "none" ? null : value,
                          )
                          notifyResult(result.error, t("workspace.programme.reviewerAssigned"))
                          refresh()
                        })
                      }
                    >
                      <SelectTrigger size="sm" className="min-w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("workspace.programme.reviewerUnassigned")}</SelectItem>
                        {reviewers.map((reviewer) => (
                          <SelectItem key={reviewer.id} value={reviewer.id}>
                            {reviewer.name}
                            {reviewer.id === currentUserId ? ` (${t("workspace.programme.reviewerYou")})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </li>
              ))}
          </ul>
          <ul className="text-sm">
            {nestColleagueComments(
              comments.map((c) => ({ ...c, parentId: c.parentId ?? null })),
            ).map((c) => (
              <li key={c.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <UserAvatar name={c.authorName} url={c.authorAvatarUrl} className="h-6 w-6 shrink-0" />
                    <span className={c.resolved ? "line-through text-muted-foreground" : ""}>
                      {c.authorName ? `${c.authorName} · ` : ""}
                      {c.themeLabel ? `${c.themeLabel} · ` : ""}
                      {c.artefact_type}: {c.body}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      startTransition(async () => {
                        await setProgrammeCommentResolved(workspaceId, c.id, !c.resolved)
                        refresh()
                      })
                    }
                  >
                    {c.resolved ? t("workspace.programme.reopenComment") : t("workspace.programme.resolveComment")}
                  </Button>
                </div>
                {c.replies.map((reply: { id: string; authorName?: string | null; body: string }) => (
                  <p key={reply.id} className="ml-8 text-xs text-muted-foreground">
                    {reply.authorName ? `${reply.authorName} · ` : ""}
                    {reply.body}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          <Button variant="outline" onClick={() => setSection("export")}>
            {t("workspace.programme.setupGoExport")}
          </Button>
        </TabsContent>

        <TabsContent value="consultation" className="space-y-3">
          <StageHeading
            title={t("workspace.programme.nav.consultation")}
            purpose={t("workspace.programme.purpose.consultation")}
          />
          <p className="text-sm text-muted-foreground">{t("workspace.programme.consultationHowTo")}</p>
          {snapshotLoaded && !publication ? (
            <p className="text-sm text-muted-foreground">{t("workspace.programme.emptyNext.consultation")}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {publication ? (
              <Button variant="outline" asChild>
                <Link href={`/published/${publication.id}`} target="_blank">
                  {t("workspace.programme.publishOpenRoom")}
                </Link>
              </Button>
            ) : snapshotLoaded ? (
              <Button variant="outline" onClick={() => setSection("publish")}>
                {t("workspace.programme.setupGoPublish")}
              </Button>
            ) : null}
          </div>
          <ConsultationOwnerPanel
            workspaceId={workspaceId}
            publicationId={publication?.id || null}
            canAdminister={canAdminister}
            queue={consultationQueue}
            onChanged={refresh}
          />
        </TabsContent>

        <TabsContent value="export" className="space-y-3">
          <StageHeading
            title={t("workspace.programme.exportTitle")}
            purpose={t("workspace.programme.purpose.export")}
          />
          {!observability?.hasSuccessfulExport && (
            <p className="text-sm text-muted-foreground">{t("workspace.programme.emptyNext.export")}</p>
          )}
          <p className="text-sm text-muted-foreground">{t("workspace.programme.exportComposeHint")}</p>
          <label className="flex items-center gap-2 text-sm">
            <Select
              value={classification}
              onValueChange={(value) => setClassification(value as typeof classification)}
            >
              <SelectTrigger size="sm" className="min-w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">public</SelectItem>
                <SelectItem value="internal">internal</SelectItem>
                <SelectItem value="confidential">confidential</SelectItem>
              </SelectContent>
            </Select>
            {t("workspace.programme.classification")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={stakeholderExport} onChange={(e) => setStakeholderExport(e.target.checked)} />
            {t("workspace.programme.stakeholderDownload")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={policies.stakeholderExportRequiresFreeze}
              disabled={pending}
              onChange={(e) =>
                startTransition(async () => {
                  const result = await updateProgrammePolicies(workspaceId, {
                    stakeholderExportRequiresFreeze: e.target.checked,
                  })
                  if (result.data) setPolicies((prev) => ({ ...prev, ...result.data }))
                  notifyResult(result.error, t("workspace.programme.policySaved"))
                })
              }
            />
            {t("workspace.programme.requireFreeze")}
          </label>
          <p className="text-xs text-muted-foreground">
            {policies.hasFreeze
              ? t("workspace.programme.freezePresent", undefined, { at: policies.freezeAt || "—" })
              : t("workspace.programme.freezeMissing")}
          </p>
          <div className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-medium">{t("workspace.programme.nav.publish")}</h3>
            <p className="text-sm text-muted-foreground">{t("workspace.programme.exportPublishHint")}</p>
            <Button variant="outline" onClick={() => setSection("publish")}>
              {t("workspace.programme.publishOpenSection")}
            </Button>
          </div>
          <Textarea
            value={exportMd}
            onChange={(e) => setExportMd(e.target.value)}
            rows={6}
            placeholder={t("workspace.programme.exportOverridePlaceholder")}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await runMarkdownOrDocxExport({
                    workspaceId,
                    title: workspaceName,
                    markdown: exportMd,
                    format: "docx",
                    compose: !exportMd.trim(),
                    classificationMax: classification,
                    stakeholder: stakeholderExport,
                  })
                  if (result.error || !result.data) {
                    notify(result.error || t("workspace.programme.exportFailed"), "error")
                    return
                  }
                  downloadExportPayload(result.data)
                  notify(t("workspace.programme.exportDocxDone", undefined, { jobId: result.data.jobId }))
                })
              }
            >
              {t("workspace.programme.exportDocx")}
            </Button>
            <Button
              disabled={pending}
              variant="outline"
              onClick={() =>
                startTransition(async () => {
                  const result = await runMarkdownOrDocxExport({
                    workspaceId,
                    title: workspaceName,
                    markdown: exportMd,
                    format: "markdown",
                    compose: !exportMd.trim(),
                    classificationMax: classification,
                    stakeholder: stakeholderExport,
                  })
                  if (result.error || !result.data) {
                    notify(result.error || t("workspace.programme.exportFailed"), "error")
                    return
                  }
                  downloadExportPayload(result.data)
                  notify(t("workspace.programme.exportMdDone", undefined, { jobId: result.data.jobId }))
                })
              }
            >
              {t("workspace.programme.exportMarkdown")}
            </Button>
            <Button
              disabled={pending}
              variant="outline"
              onClick={() =>
                startTransition(async () => {
                  const result = await runMarkdownOrDocxExport({
                    workspaceId,
                    title: workspaceName,
                    markdown: exportMd,
                    format: "pdf",
                    compose: !exportMd.trim(),
                    classificationMax: classification,
                    stakeholder: stakeholderExport,
                  })
                  if (result.error || !result.data) {
                    notify(result.error || t("workspace.programme.exportFailed"), "error")
                    return
                  }
                  if (result.data.pdfFallback || result.data.mimeType.includes("html")) {
                    openPrintPreview(result.data.content)
                    notify(t("workspace.programme.exportPdfFallback", undefined, { jobId: result.data.jobId }), "warning")
                    return
                  }
                  downloadExportPayload(result.data)
                  notify(t("workspace.programme.exportPdfFileDone", undefined, { jobId: result.data.jobId }))
                })
              }
            >
              {t("workspace.programme.exportPdf")}
            </Button>
            <Button
              disabled={pending}
              variant="outline"
              onClick={() =>
                startTransition(async () => {
                  const result = await runMarkdownOrDocxExport({
                    workspaceId,
                    title: workspaceName,
                    format: "json",
                    compose: true,
                    classificationMax: classification,
                    stakeholder: stakeholderExport,
                  })
                  if (result.error || !result.data) {
                    notify(result.error || t("workspace.programme.exportFailed"), "error")
                    return
                  }
                  downloadExportPayload(result.data)
                  notify(t("workspace.programme.exportJsonDone", undefined, { jobId: result.data.jobId }))
                })
              }
            >
              {t("workspace.programme.exportJson")}
            </Button>
            <Button
              disabled={pending || filling || !canAdminister}
              variant="outline"
              onClick={() => {
                setFilling(true)
                setFillProgress([])
                setFillStartedAt(new Date().toISOString())
                startTransition(async () => {
                  const result = await fillProgrammeChapters(workspaceId, spaceId)
                  setFillProgress(result.data?.progress || [])
                  setFilling(false)
                  if (result.error) {
                    notify(result.error, "error")
                  } else if (result.data?.cancelled) {
                    notify(t("workspace.programme.fillCancelled"), "warning")
                  } else {
                    notify(
                      t("workspace.programme.fillDone", undefined, {
                        count: String(result.data?.progress.filter((p) => p.status === "ok").length ?? 0),
                      }),
                    )
                  }
                  refresh()
                })
              }}
            >
              {t("workspace.programme.fillProgramme")}
            </Button>
            <Button
              disabled={!filling}
              variant="outline"
              onClick={() => {
                notify(t("workspace.programme.fillCancelRequested"), "info")
                void cancelFillProgramme(workspaceId).then((result) => {
                  if (result.error) notify(result.error, "error")
                })
              }}
            >
              {t("workspace.programme.fillCancel")}
            </Button>
            <Button
              disabled={pending || filling || !canAdminister}
              variant="outline"
              onClick={() => {
                setFilling(true)
                startTransition(async () => {
                  const result = await retryFillProgramme(workspaceId, spaceId)
                  setFillProgress(result.data?.progress || [])
                  setFilling(false)
                  if (result.error) {
                    notify(result.error, "error")
                  } else if (result.data?.cancelled) {
                    notify(t("workspace.programme.fillCancelled"), "warning")
                  } else if (result.data?.skipped) {
                    notify(t("workspace.programme.fillNothingToRetry"), "info")
                  } else {
                    notify(
                      t("workspace.programme.fillDone", undefined, {
                        count: String(result.data?.progress.filter((p) => p.status === "ok").length ?? 0),
                      }),
                    )
                  }
                  refresh()
                })
              }}
            >
              {t("workspace.programme.fillRetry")}
            </Button>
            <Button
              disabled={pending || !canAdminister}
              variant="outline"
              onClick={() =>
                startTransition(async () => {
                  const pack = await buildAuditPackageJson(workspaceId)
                  if (pack.error || !pack.data) {
                    notify(pack.error || t("workspace.programme.exportFailed"), "error")
                    return
                  }
                  const json = JSON.stringify(pack.data, null, 2)
                  downloadBlob(
                    `audit-package-${workspaceId.slice(0, 8)}.json`,
                    new Blob([json], { type: "application/json" }),
                  )
                  setPolicies((prev) => ({
                    ...prev,
                    hasFreeze: true,
                    freezeId: pack.data.freezeId,
                    freezeAt: pack.data.generatedAt,
                  }))
                  notify(
                    t("workspace.programme.auditPackageDone", undefined, {
                      runs: pack.data.generationRuns.length,
                      measures: pack.data.measures.length,
                    }),
                  )
                })
              }
            >
              {t("workspace.programme.auditPackage")}
            </Button>
          </div>
          {fillProgress.length > 0 && (
            <ul className="text-sm">
              {(() => {
                const eta = estimateJobEta({ startedAt: fillStartedAt, progress: fillProgress })
                return (
                  <li className="text-muted-foreground">
                    {t("workspace.programme.fillEta", undefined, {
                      eta: formatEtaMs(eta.remainingMs),
                      done: String(eta.doneCount),
                      total: String(fillProgress.length),
                    })}
                  </li>
                )
              })()}
              {fillProgress.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  {t("workspace.programme.fillProgress", undefined, {
                    title: item.title,
                    status: item.error || item.status,
                  })}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="publish" className="space-y-3">
          <StageHeading
            title={t("workspace.programme.nav.publish")}
            purpose={t("workspace.programme.purpose.publish")}
          />
          <p className="text-sm text-muted-foreground">{t("workspace.programme.publishBody")}</p>
          {snapshotLoaded && !publication ? (
            <p className="text-sm text-muted-foreground">{t("workspace.programme.emptyNext.publish")}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {publication
              ? t("workspace.programme.publishCurrent", undefined, { at: publication.publishedAt })
              : t("workspace.programme.publishNone")}
          </p>
          <p className="text-xs text-muted-foreground">
            {policies.hasFreeze
              ? t("workspace.programme.freezePresent", undefined, { at: policies.freezeAt || "—" })
              : t("workspace.programme.freezeMissing")}
          </p>
          {!policies.hasFreeze ? (
            <Button variant="outline" onClick={() => setSection("export")}>
              {t("workspace.programme.setupGoExport")}
            </Button>
          ) : null}
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("workspace.programme.publishVisibility")}</span>
            <Select
              value={publishVisibility}
              onValueChange={(value) => setPublishVisibility(value as PublicationVisibility)}
            >
              <SelectTrigger size="sm" className="min-w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="permissioned">{t("workspace.programme.publishPermissioned")}</SelectItem>
                <SelectItem value="link_code">{t("workspace.programme.publishLinkCode")}</SelectItem>
                <SelectItem value="public_listing">{t("workspace.programme.publishPublicListing")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">{t("workspace.programme.publishPeriod")}</span>
            <Input
              value={publishPeriod}
              onChange={(event) => setPublishPeriod(event.target.value)}
              placeholder={t("workspace.programme.publishPeriodPlaceholder")}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || chromeJob === "reviewer" || !policies.hasFreeze || !canAdminister}
              onClick={() =>
                startTransition(async () => {
                  const result = await publishProgrammeSnapshot({
                    workspaceId,
                    visibility: publishVisibility,
                    periodLabel: publishPeriod,
                  })
                  if (result.error || !result.data) {
                    notify(result.error || t("workspace.programme.publishNeedFreeze"), result.error ? "error" : "warning")
                    return
                  }
                  setPublication(result.data.publication)
                  setRevealedAccessCode(result.data.accessCode)
                  notify(
                    result.data.accessCode
                      ? t("workspace.programme.publishCodeOnce", undefined, { code: result.data.accessCode })
                      : t("workspace.programme.publishDone"),
                  )
                })
              }
            >
              {t("workspace.programme.publishAction")}
            </Button>
            {publication ? (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/published/${publication.id}`} target="_blank">
                    {t("workspace.programme.publishOpenRoom")}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  disabled={pending || chromeJob === "reviewer"}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await revokeProgrammePublication(workspaceId)
                      if (result.error) {
                        notify(result.error, "error")
                        return
                      }
                      setPublication(null)
                      setRevealedAccessCode(null)
                      notify(t("workspace.programme.publishRevoked"))
                    })
                  }
                >
                  {t("workspace.programme.publishRevoke")}
                </Button>
              </>
            ) : null}
          </div>
          {revealedAccessCode ? (
            <p className="text-sm">
              {t("workspace.programme.publishCodeOnce", undefined, { code: revealedAccessCode })}
            </p>
          ) : null}
          <div className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-medium">{t("workspace.programme.nav.consultation")}</h3>
            <p className="text-sm text-muted-foreground">{t("workspace.programme.consultationExportHint")}</p>
            <Button variant="outline" onClick={() => setSection("consultation")}>
              {t("workspace.programme.consultationOpenSection")}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
          </div>
        </ErrorBoundary>
        </DialogContent>
      </Dialog>
    </div>
    </>
    </ProgrammeTextHistoryProvider>
  )
}
