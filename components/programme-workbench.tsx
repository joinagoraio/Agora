"use client"

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  getProgrammeBindings,
  getProgrammePolicies,
  listProgrammeReviewers,
  previewBoundAgentSources,
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
  replyToColleagueTheme,
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
import { ProgrammeInterestsPanel } from "@/components/programme-interests-panel"
import { MeasureDecisionControl } from "@/components/measure-decision-control"
import { MeasureSummaryLines } from "@/components/measure-summary-lines"
import { DemoTourPanel, DemoTourStrip, useDemoTour, useTourSheetInsets } from "@/components/demo-tour"
import { ENOUGH_MEASURES_PER_INTEREST } from "@/lib/programme/demo-tour"
import { agentDisplayName } from "@/lib/programme/agent-labels"
import { listProgrammeInterests } from "@/lib/actions/interests"
import type { ProgrammeInterest } from "@/lib/programme/interests"
import { parseRoleCheck } from "@/lib/programme/role-check"
import { parseMeasurePriority } from "@/lib/programme/measure-priority"
import {
  MEASURE_FILTERS,
  MEASURE_SORTS,
  sortAndFilterMeasures,
  type MeasureFilter,
  type MeasureSort,
} from "@/lib/programme/measure-order"
import { MeasurePriorityControl } from "@/components/measure-priority-control"
import { Badge } from "@/components/ui/badge"
import { OverflowTitle } from "@/components/overflow-title"
import { ProgrammeTextHistoryProvider } from "@/components/programme-text-history"
import { ProgrammeToolsToolbar } from "@/components/programme-tools-toolbar"
import {
  DEFAULT_PROGRAMME_DOCUMENT_LAYOUT,
  mergeProgrammeDocumentLayout,
  programmeDocumentCanvasClass,
  readProgrammeDocumentLayout,
  readProgrammeShowComments,
  writeProgrammeDocumentLayout,
  writeProgrammeShowComments,
  type ProgrammeDocumentLayout,
  type ProgrammeDocumentLayoutPatch,
} from "@/lib/programme/document-layout"
import { UserAvatar } from "@/components/user-avatar"
import { UserMenu } from "@/components/user-menu"
import { WorkspaceNotesPanel, type WorkspaceNote } from "@/components/workspace-notes-panel"
import { getDocumentFileExtension } from "@/lib/utils/document-files"
import { ArrowLeft, Loader2, MoreVertical } from "lucide-react"
import { useBackgroundJob } from "@/components/programme-jobs-provider"
import { ProgrammeWriteChaptersBar } from "@/components/programme-write-chapters-bar"
import { DemoColleaguesBar } from "@/components/demo-colleagues-bar"
import { startFillChapters, startMeasureGeneration, startRoleCheck } from "@/lib/actions/programme-jobs"
import {
  ProgrammeToolExtra,
  ProgrammeToolPage,
  ProgrammeToolSheet,
  ProgrammeToolSplit,
  ProgrammeToolSwitch,
} from "@/components/programme-tool-sheet"

const SHEET_SECTIONS = new Set<ProgrammeWorkbenchSection>([
  "overview",
  "setup",
  "agents",
  "corpus",
  "analysis",
  "interests",
  "measures",
  "effects",
  "provenance",
  "review",
  "consultation",
  "export",
  "publish",
])

const MENU_GROUPS: { id: "work" | "properties" | "output"; sections: ProgrammeWorkbenchSection[] }[] = [
  { id: "work", sections: ["analysis", "interests", "measures", "effects", "provenance", "review"] },
  { id: "properties", sections: ["overview", "setup", "agents"] },
  { id: "output", sections: ["export", "publish", "consultation"] },
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
  outlineNodeId: "",
  challenge: "",
  resources: "",
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

/** Seeding a reviewer and bulk approval are for local testing, never for a real sign-off. */
const LOCAL_SHORTCUTS = process.env.NODE_ENV !== "production"

const FINDING_TONE: Record<string, string> = {
  adopt: "border-emerald-300 bg-emerald-50 text-emerald-800",
  adapt: "border-amber-300 bg-amber-50 text-amber-800",
  drop: "border-red-300 bg-red-50 text-red-800",
  missing: "border-sky-300 bg-sky-50 text-sky-800",
}

const SOURCE_LINE = /^- (.+?) \[[0-9a-f-]{36}\](?: \(([a-z_]+)\))?$/

/** The sources a run will read, as titles with their role instead of raw ids. */
function SourcePreviewList({ preview, className }: { preview: string; className?: string }) {
  const { t } = useI18n()
  return (
    <ul className={cn("space-y-1 text-sm", className)}>
      {preview.split("\n").map((line, index) => {
        const match = SOURCE_LINE.exec(line.trim())
        if (!match) return line.trim() ? <li key={index} className="text-xs text-muted-foreground">{line.replace(/^- /, "")}</li> : null
        return (
          <li key={index} className="flex flex-wrap items-baseline gap-x-2">
            <span>{match[1]}</span>
            {match[2] ? (
              <span className="text-xs text-muted-foreground">{t(`workspace.programme.documentRoles.${match[2]}`, match[2])}</span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function openPrintPreview(html: string) {
  const w = window.open("", "_blank")
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
  try {
    w.history.replaceState(null, "", window.location.href)
  } catch {
    // The print window keeps its own address when the browser refuses the replacement.
  }
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
  guidanceSidebar?: boolean
  guidanceStrip?: boolean
  expertPromptDismissed?: boolean
  helpAiEnabled?: boolean
  canAccessSettings?: boolean
  currentUserId?: string | null
  accessRole?: string | null
  initialDocumentOwnerId?: string | null
  /** Shown above everything, for example the demo strip. */
  topBanner?: ReactNode
  /** A loaded demo, for platform admins: offers shortcuts such as colleagues reading along. */
  demo?: boolean
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
  guidanceSidebar = false,
  expertPromptDismissed = false,
  helpAiEnabled = false,
  canAccessSettings = false,
  currentUserId: currentUserIdProp = null,
  accessRole: accessRoleProp = null,
  initialDocumentOwnerId = null,
  metadata,
  topBanner = null,
  demo = false,
}: Props) {
  const workspaceSummary = workspaceSummaryProp ?? ""
  const workspaceDescription = workspaceDescriptionProp ?? ""
  const { t } = useI18n()
  const { setGuidance } = useChatContext()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [liveGuidanceMode, setLiveGuidanceMode] = useState<GuidanceMode>(guidanceMode)
  const demoTour = useDemoTour()
  useEffect(() => {
    setLiveGuidanceMode(guidanceMode)
  }, [guidanceMode])
  const [outlineNodeCount, setOutlineNodeCount] = useState(0)
  const [outlineChapters, setOutlineChapters] = useState<Array<{ id: string; title: string }>>([])
  const [programmeInterests, setProgrammeInterests] = useState<ProgrammeInterest[]>([])
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
  const tourOpen = Boolean(demoTour?.open)
  const tourSheetInsets = useTourSheetInsets(tourOpen && sheetOpen)

  useEffect(() => {
    setDocumentLayout({
      ...readProgrammeDocumentLayout(),
      showComments: readProgrammeShowComments(workspaceId),
    })
  }, [workspaceId])

  const patchDocumentLayout = useCallback((patch: ProgrammeDocumentLayoutPatch) => {
    setDocumentLayout((current) => {
      const next = mergeProgrammeDocumentLayout(current, patch)
      writeProgrammeDocumentLayout(next)
      if (patch.showComments !== undefined) writeProgrammeShowComments(workspaceId, next.showComments)
      return next
    })
  }, [workspaceId])

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
  const measuresJob = useBackgroundJob("measures", (job) => {
    refresh()
    if (job.status !== "done") {
      notify(job.error || t("workspace.programme.exportFailed"), "error")
      return
    }
    const errCount = Number(job.progress.result?.errors ?? 0)
    notify(
      t("workspace.programme.measuresGenerated", undefined, {
        count: String(job.progress.result?.saved ?? 0),
        errors: String(errCount),
      }),
      errCount > 0 ? "warning" : "success",
    )
  })
  const fillJob = useBackgroundJob("fill")
  const rolesJob = useBackgroundJob("roles", (job) => {
    refresh()
    if (job.status !== "done") {
      notify(job.error || t("workspace.programme.exportFailed"), "error")
      return
    }
    notify(
      t("workspace.programme.roleCheck.done", undefined, {
        count: String(job.progress.result?.checked ?? 0),
        total: String(job.progress.result?.total ?? 0),
      }),
      "success",
    )
  })
  const [commentRefreshKey, setCommentRefreshKey] = useState(0)
  const [templates, setTemplates] = useState<ProgrammeTemplateSummary[]>([])
  const [agents, setAgents] = useState<
    Array<{ id: string; name: string; role: string; stage: string; provider: string }>
  >([])
  const [corpusDocs, setCorpusDocs] = useState<
    Array<{ id: string; title: string; document_role: string | null; origin: DocumentOrigin; fileExtension: string }>
  >([])
  const [corpusLoaded, setCorpusLoaded] = useState(false)
  const [notes, setNotes] = useState<WorkspaceNote[]>([])
  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] })
  const [duplicates, setDuplicates] = useState<Array<Array<{ id: string; title: string; score?: number; reason?: string }>>>([])
  const [chapterContentKey, setChapterContentKey] = useState(0)
  const chaptersWritten = useCallback(() => {
    setChapterContentKey((key) => key + 1)
    void listProgrammeChapters(workspaceId).then((result) => setChapters(result.data || []))
  }, [workspaceId])
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
    effectsCheckedIds: [] as string[],
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
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null)
  const [measureSort, setMeasureSort] = useState<MeasureSort>("priority")
  const [measureFilter, setMeasureFilter] = useState<MeasureFilter>("all")
  const [reviewPane, setReviewPane] = useState<"chapters" | "measures" | "notes">("chapters")
  const [analysisView, setAnalysisView] = useState<"findings" | "vision">("findings")
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [analysisInstructions, setAnalysisInstructions] = useState("")
  const [analysisJobStatus, setAnalysisJobStatus] = useState<string>("")
  const [editingMeasureId, setEditingMeasureId] = useState<string | null>(null)
  const [measureDraft, setMeasureDraft] = useState(emptyMeasureDraft)
  const [commentBody, setCommentBody] = useState("")
  const [comments, setComments] = useState<any[]>([])
  const [commentThemes, setCommentThemes] = useState<ColleagueCommentThemeRecord[]>([])
  const [themeReplies, setThemeReplies] = useState<Record<string, string>>({})
  const [chapters, setChapters] = useState<
    Array<{
      documentId: string
      title: string
      workflowStatus: string
      assignedReviewerId: string | null
      chapterOwnerId: string | null
      outlineNodeId: string | null
      hasBody?: boolean
      drafted?: boolean
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
          effectsCheckedIds: policyResult.data.effectsCheckedIds || [],
        })
        if (policyResult.data.documentOwnerId) setDocumentOwnerId(policyResult.data.documentOwnerId)
        if (policyResult.data.accessRole) setAccessRole(policyResult.data.accessRole)
      }
      setPublication(publicationResult.data || null)
      setCitablePublications(citableResult.data || [])
      if (!citePublicationId && citableResult.data?.[0]?.id) {
        setCitePublicationId(citableResult.data[0].id)
      }
      setReviewers(reviewerResult.data || [])
      setCurrentUserId(reviewerResult.currentUserId ?? null)
      void listProgrammeInterests(workspaceId).then((listed) => setProgrammeInterests(listed.data || []))
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
      setCorpusLoaded(true)
      setNotes((notesResult.data || []) as WorkspaceNote[])
      const templateId = b.data?.templateId
      if (templateId) {
        const nodes = await listProgrammeOutlineNodes(templateId)
        setOutlineNodeCount(nodes.data?.length ?? 0)
        setOutlineChapters((nodes.data || []).map((node) => ({ id: node.id, title: node.title })))
      } else {
        setOutlineNodeCount(0)
        setOutlineChapters([])
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

  const pipeline = useMemo(
    () =>
      deriveGuidancePipeline(
        pipelineInputFromWorkbench({
          bindings,
          reports,
          measures: measures.map((measure) => ({
            ...measure,
            effectsChecked: policies.effectsCheckedIds.includes(measure.id),
          })),
          chapters,
          outlineNodeCount,
          hasQcRun: Boolean(observability?.byKind?.qc) || reports.some((report) => report.report_type === "quality"),
          hasSuccessfulExport: Boolean(observability?.hasSuccessfulExport),
        }),
      ),
    [bindings, reports, measures, chapters, outlineNodeCount, observability, policies.effectsCheckedIds],
  )
  const openPipelineStep = (stage: string | null, section: string, chapterId: string | null) => {
    if (stage === "draft" && chapterId) {
      replaceParams((params) => {
        params.delete("section")
        params.delete("structure")
        params.set("view", "document")
        params.set("mode", "edit")
        params.set("chapter", chapterId)
      })
      return
    }
    setSection(section)
    const target = stage ? STAGE_TARGET[stage as keyof typeof STAGE_TARGET] : undefined
    if (!target) return
    window.setTimeout(() => {
      const el = document.querySelector(`[data-guidance-target="${target}"]`)
      if (el instanceof HTMLElement) el.focus()
    }, 50)
  }
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

  const boundTemplate = templates.find((tpl) => tpl.id === bindings.templateId)
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
  const pendingMeasures = measures.filter((m) => m.workflow_status !== "approved")
  const activeReport = reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null
  const measuredInterestIds = useMemo(() => {
    const counts = new Map<string, number>()
    for (const id of measures.flatMap((measure) => (Array.isArray(measure.interest_ids) ? (measure.interest_ids as string[]) : []))) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return [...counts].filter(([, count]) => count >= ENOUGH_MEASURES_PER_INTEREST).map(([id]) => id)
  }, [measures])
  const shownMeasures = sortAndFilterMeasures(measures, {
    sort: measureSort,
    filter: measureFilter,
    chapterOrder: outlineChapters.map((chapter) => chapter.id),
  })
  const activeMeasure =
    shownMeasures.find((measure) => measure.id === selectedMeasureId) ?? shownMeasures[0] ?? null
  const chapterTitle = (id: string | null | undefined) => outlineChapters.find((chapter) => chapter.id === id)?.title ?? null
  const personName = (id: string | null | undefined) => (id ? reviewers.find((person) => person.id === id)?.name ?? null : null)
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
    if (!demoTour) {
      setGuidance(null)
      return
    }
    setGuidance({
      panel: <DemoTourPanel />,
      tabLabel: t("demoTour.tab", "Tour"),
      surface: "programme",
      job: chromeJob,
      guidanceMode: liveGuidanceMode,
      onModeChange: setLiveGuidanceMode,
      helpAiEnabled,
      spaceId,
      pipeline,
      section: coachSection,
      documentTitles: listBoundDocumentsForHelp(corpusDocs || [], bindings),
      onNavigate: (section, target) => {
        if (section === "editor" && pipeline.firstIncomplete === "draft" && pipeline.focusChapterId) {
          openPipelineStep("draft", section, pipeline.focusChapterId)
          return
        }
        setSection(section)
        if (target) {
          window.setTimeout(() => {
            const el = document.querySelector(`[data-guidance-target="${target}"]`)
            if (el instanceof HTMLElement) el.focus()
          }, 50)
        }
      },
      reviewComplete: pipeline.stages.review === "ready",
      expertPromptDismissed,
      setupInProgress: showSetupWizard,
    })
    return () => setGuidance(null)
  }, [
    bindings,
    chromeJob,
    coachSection,
    corpusDocs,
    demoTour,
    t,
    expertPromptDismissed,
    liveGuidanceMode,
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
      {topBanner}
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
          <div className="relative z-10 ml-auto">
            <UserMenu />
          </div>
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
        menu={
          canAccessSettings ? (
            <DropdownMenu>
              <IconTooltip label={t("space.workspaces.dropdownMenuSr")} side="bottom">
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant={accessPanel ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label={t("space.workspaces.dropdownMenuSr")}
                    aria-haspopup="menu"
                    data-guidance-target="programme-menu"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </IconTooltip>
              <DropdownMenuContent align="end" className="w-52">
                <ProgrammeAccessMenuItems onPick={(panel) => setAccessPanel(panel)} />
                {canAdminister ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={fillJob.running}
                      onSelect={() =>
                        startTransition(async () => {
                          const result = await startFillChapters(workspaceId, spaceId)
                          if (result.error) {
                            notify(result.error, "error")
                            return
                          }
                          fillJob.watch()
                          closeStructure()
                          notify(t("workspace.programme.writeChapters.started"), "info")
                        })
                      }
                    >
                      {t("workspace.programme.writeChapters.action")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
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
            findCommonNotes={
              !isKnowledgeView && documentLayout.showComments
                ? {
                    label: t("workspace.programme.colleagueClusterAction"),
                    disabled: pending,
                    onClick: () =>
                      startTransition(async () => {
                        const result = await clusterColleagueComments(workspaceId)
                        notifyResult(result.error, t("workspace.programme.colleagueClustered"))
                        setCommentRefreshKey((key) => key + 1)
                        setReviewPane("notes")
                        setSection("review")
                        refresh()
                      }),
                  }
                : undefined
            }
          />
        }
      />
      )}
      <DemoTourStrip />
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
                corpusLoading={!corpusLoaded}
                canEdit={canRunSetup}
                onBindingsChange={setBindings}
                onMessage={notify}
                onRefresh={refresh}
                onGuidanceMode={setLiveGuidanceMode}
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
                  } else if ("data" in agents && agents.data) {
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
              contentRefreshKey={chapterContentKey}
              topSlot={
                !isKnowledgeView ? (
                  <>
                    <ProgrammeWriteChaptersBar
                      workspaceId={workspaceId}
                      spaceId={spaceId}
                      templateId={bindings.templateId ?? null}
                      chapters={chapters}
                      chaptersLoaded={snapshotLoaded}
                      canAdminister={canAdminister}
                      onMessage={notify}
                      onChaptersWritten={chaptersWritten}
                    />
                    {demo && chapters.some((chapter) => chapter.drafted) ? (
                      <DemoColleaguesBar
                        workspaceId={workspaceId}
                        refreshKey={commentRefreshKey}
                        onSeeded={() => {
                          patchDocumentLayout({ showComments: true })
                          setCommentRefreshKey((key) => key + 1)
                        }}
                      />
                    ) : null}
                  </>
                ) : null
              }
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
              commentRefreshKey={commentRefreshKey}
              workspaceName={workspaceName}
              citationSources={citationCatalog.documents}
            />
            )}
          </div>
        )}
      </div>

      <Dialog open={sheetOpen} modal={!tourOpen} onOpenChange={(open) => { if (!open) closeSheet() }}>
        <DialogContent
          overlayClassName="z-[70]"
          showOverlay={!tourOpen}
          style={tourSheetInsets ?? undefined}
          onInteractOutside={tourOpen ? (event) => event.preventDefault() : undefined}
          className="top-6 right-6 bottom-6 left-6 z-[80] flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        >
        <ErrorBoundary resetKeys={[activeSection]}>
          <DialogHeader className="sr-only">
            <DialogTitle>{t(`workspace.programme.nav.${activeSection}`, activeSection)}</DialogTitle>
          </DialogHeader>
          <ProgrammeToolSheet
            groups={documentMenuGroups.filter((group) => group.sections.length > 0)}
            activeSection={activeSection}
            onSection={setSection}
          >
          <Tabs value={activeSection} onValueChange={setSection} className="min-h-0 flex-1 gap-0">
        <TabsContent value="overview" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            title={t("workspace.programme.nav.overview")}
            purpose={t("workspace.programme.purpose.overview")}
            actions={
              pipeline.firstIncomplete ? (
                <Button type="button" onClick={() => setSection(pipeline.firstIncompleteSection)}>
                  {t("guidance.coach.next", undefined, {
                    action: t(`guidance.coach.stages.${pipeline.firstIncomplete}`),
                  })}
                </Button>
              ) : null
            }
          >
          {workspaceSummary.trim() || workspaceDescription.trim() ? (
            <section className="overflow-hidden rounded-lg border">
              <div className="space-y-2 px-4 py-3">
                {workspaceSummary.trim() ? (
                  <p className="whitespace-pre-line text-sm font-semibold text-foreground">{workspaceSummary}</p>
                ) : null}
                {workspaceDescription.trim() ? (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{workspaceDescription}</p>
                ) : null}
              </div>
            </section>
          ) : null}
          {pipeline.firstIncomplete ? null : (
            <p className="text-sm text-muted-foreground">{t("guidance.coach.nothingRequired")}</p>
          )}
          <section className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted px-4 py-3">
              <h3 className="text-sm font-semibold">{t("workspace.programme.overviewNotesTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("workspace.programme.overviewNotesHint")}</p>
            </div>
            <div className="px-4 py-3">
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
          </section>
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="setup" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            title={t("workspace.programme.setupTitle")}
            purpose={t("workspace.programme.purpose.setup")}
          >
          <section className="overflow-hidden rounded-lg border">
            <div className="divide-y">
              <div className="space-y-2 px-4 py-4">
                <h3 className="text-sm font-semibold">{t("workspace.programme.setupChecklistTitle")}</h3>
                <ol className="text-sm">
                  {setupSteps.map((step, index) => (
                    <li key={step.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
                        onClick={() => setSection(step.section)}
                      >
                        <span className="w-4 text-muted-foreground">{index + 1}</span>
                        <span className={step.done ? "text-muted-foreground" : ""}>{step.label}</span>
                        {step.done ? (
                          <span className="ml-auto text-xs text-muted-foreground">{t("workspace.programme.setupDone")}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="space-y-3 px-4 py-4">
                <div>
                  <h3 className="text-sm font-semibold">{t("workspace.programme.bindTemplate")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("workspace.programme.bindTemplateHint")}</p>
                </div>
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("workspace.programme.noTemplates")}</p>
                ) : (
                  <ProgrammeTemplatePicker
                    templates={templates}
                    value={bindings.templateId ?? null}
                    allowNone={!bindings.templateId}
                    disabled={pending}
                    hideLabel
                    hideChapters
                    label={t("workspace.programme.bindTemplate")}
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
                {boundTemplate && boundTemplate.chapterTitles.length > 0 ? (
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {boundTemplate.chapterTitles.map((title, index) => (
                      <li key={`${index}-${title}`}>{title}</li>
                    ))}
                  </ol>
                ) : null}
                {bindings.templateId ? (
                  <p className="text-sm text-muted-foreground">{t("workspace.programme.bindTemplateSwitchHint")}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {t("workspace.programme.documentRoles.environmental_vision")}:{" "}
                  {bindings.environmentalVisionDocumentIds
                    .map((id) => {
                      const title = citationCatalog.documents.find((document) => document.id === id)?.title || id
                      const file = title.match(/^(.*)\.(md|markdown|pdf|docx?|txt)$/i)
                      return file ? file[1].replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() : title
                    })
                    .join(", ") || t("workspace.programme.none")}
                </p>
              </div>
              <div className="space-y-2 px-4 py-4">
                <h3 className="text-sm font-semibold">{t("workspace.programme.documentOwner")}</h3>
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
              <div className="space-y-2 px-4 py-4">
                <h3 className="text-sm font-semibold">{t("workspace.programme.policyTitle")}</h3>
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
            </div>
          </section>
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="agents" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            title={t("workspace.programme.nav.agents")}
            purpose={t("workspace.programme.purpose.agents")}
            actions={
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
            }
          >
          <section className="overflow-hidden rounded-lg border">
            {agents.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">{t("workspace.programme.agentsEmpty")}</p>
            ) : (
              <div className="divide-y">
                {AGENT_STAGES.map((stage) => {
                  const options = agents.filter((agent) => agent.stage === stage)
                  const bound = bindings.agentBindings?.[stage] || ""
                  const selected = options.find((agent) => agent.id === bound)
                  const provider = selected?.provider && selected.provider !== "n/a"
                    ? t(`workspace.programme.agentProviderName.${selected.provider}`, selected.provider)
                    : ""
                  return (
                    <div key={stage} className="space-y-3 px-4 py-4">
                      <div>
                        <h3 className="text-sm font-semibold">{t(`space.agents.stages.${stage}`)}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{t(`workspace.programme.agentJob.${stage}`)}</p>
                      </div>
                      {options.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("workspace.programme.bindAgentEmpty")}</p>
                      ) : (
                        <div className="max-w-xl space-y-1">
                          <Select
                            value={selected?.id}
                            disabled={pending}
                            onValueChange={(value) =>
                              startTransition(async () => {
                                const saved = await bindWorkspaceAgents(workspaceId, { [stage]: value })
                                if (saved.data) setBindings(saved.data)
                                notifyResult(saved.error, t("workspace.programme.agentsBound"))
                              })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t("workspace.programme.bindAgentUnset")} />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((agent) => (
                                <SelectItem key={agent.id} value={agent.id}>
                                  {agentDisplayName(agent, t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {provider && selected && !selected.name.toLowerCase().includes(provider.toLowerCase()) ? (
                            <p className="text-xs text-muted-foreground">{provider}</p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="corpus" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            title={t("workspace.programme.nav.corpus")}
            purpose={t("workspace.programme.purpose.corpus")}
            actions={
              <Button variant="outline" type="button" onClick={() => setMode("knowledge")}>
                {t("workspace.programme.openKnowledge")}
              </Button>
            }
          >
          {documentRoleList}
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="analysis" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            fill
            title={t("workspace.programme.analysisTitle")}
            purpose={
              reports.length === 0
                ? t("workspace.programme.purpose.analysisEmpty")
                : t("workspace.programme.purpose.analysis")
            }
            actions={
              <>
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
          <ProgrammeToolExtra label={t("workspace.programme.analysisInstructionsLabel")}>
            <p className="text-xs text-muted-foreground">{t("workspace.programme.analysisInstructionsHint")}</p>
            <Textarea
              id="analysis-instructions"
              value={analysisInstructions}
              onChange={(e) => setAnalysisInstructions(e.target.value)}
              placeholder={t("workspace.programme.analysisInstructionsPlaceholder")}
              rows={2}
            />
          </ProgrammeToolExtra>
          {analysisJobStatus ? (
            <p className="basis-full text-sm">{t("workspace.programme.analysisJob", undefined, { status: analysisJobStatus })}</p>
          ) : null}
              </>
            }
          >
          <ProgrammeToolSplit
            list={
              <div className="flex h-full min-h-0 flex-col">
                <div className="shrink-0 border-b bg-muted px-4 py-3">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t("workspace.programme.reportListTitle")}
                  </h3>
                  <p className="mt-1 text-xs text-foreground">{t("workspace.programme.reportListHint")}</p>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto bg-background text-sm">
                  {reports.length === 0 ? (
                    <li className="px-4 py-6 text-muted-foreground">
                      {t("workspace.programme.noReports")} {t("workspace.programme.emptyNext.analysis")}
                    </li>
                  ) : null}
                  {reports.map((r) => {
                    const selected = activeReport?.id === r.id
                    const run = runs.find((item) => item.id === r.generation_run_id)
                    const score = run?.citations?.groundedness?.score
                    const findingCount = Array.isArray(r.findings) ? r.findings.length : 0
                    return (
                      <li key={r.id} className="border-b">
                        <button
                          type="button"
                          aria-current={selected ? "true" : undefined}
                          className={`w-full border-l-2 px-4 py-3 text-left ${selected ? "border-l-foreground bg-background" : "border-l-transparent hover:bg-muted/30"}`}
                          onClick={() => setSelectedReportId(r.id)}
                        >
                          <span className="block font-medium">
                            {t(`workspace.programme.reportType.${r.report_type}`, r.report_type)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                            {" · "}
                            {t("workspace.programme.findingCount", undefined, { count: findingCount })}
                            {score == null
                              ? ""
                              : ` · ${t("workspace.programme.groundednessRun", undefined, {
                                  score: String(score),
                                  issues: String(run?.citations?.groundedness?.issues?.length ?? 0),
                                })}`}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {reports.length >= 2 ? (
                  <div className="shrink-0 space-y-3 border-t bg-muted/40 px-4 py-3">
                    <div>
                      <h3 className="text-sm font-semibold">{t("workspace.programme.compareTitle")}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{t("workspace.programme.compareHint")}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">{t("workspace.programme.compareA")}</p>
                      <Select value={compareA || "none"} onValueChange={(value) => setCompareA(value === "none" ? "" : value)}>
                        <SelectTrigger size="sm" className="w-full bg-background">
                          <SelectValue placeholder={t("workspace.programme.comparePick")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("workspace.programme.comparePick")}</SelectItem>
                          {reports.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {t(`workspace.programme.reportType.${r.report_type}`, r.report_type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">{t("workspace.programme.compareB")}</p>
                      <Select value={compareB || "none"} onValueChange={(value) => setCompareB(value === "none" ? "" : value)}>
                        <SelectTrigger size="sm" className="w-full bg-background">
                          <SelectValue placeholder={t("workspace.programme.comparePick")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("workspace.programme.comparePick")}</SelectItem>
                          {reports.map((r) => (
                            <SelectItem key={`b-${r.id}`} value={r.id}>
                              {t(`workspace.programme.reportType.${r.report_type}`, r.report_type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
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
                ) : null}
              </div>
            }
            detail={
              <div className="space-y-4 p-6">
                <ProgrammeToolSwitch
                  label={t("workspace.programme.analysisViewLabel")}
                  value={analysisView}
                  options={[
                    { id: "findings", label: t("workspace.programme.analysisView.findings") },
                    { id: "vision", label: t("workspace.programme.analysisView.vision") },
                  ]}
                  onChange={setAnalysisView}
                />
                {analysisView === "vision" ? (
                  <ProgrammePolicyGraph nodes={graph.nodes} edges={graph.edges} />
                ) : (
                  <>
                {sourcePreview ? (
                  <section className="overflow-hidden rounded-lg border bg-background">
                    <div className="border-b bg-muted px-4 py-3">
                      <h3 className="text-sm font-semibold">{t("workspace.programme.sourcePreviewTitle")}</h3>
                    </div>
                    <SourcePreviewList preview={sourcePreview} className="px-4 py-3" />
                  </section>
                ) : null}
                {compareFindings ? (
                  <section className="overflow-hidden rounded-lg border bg-background">
                    <div className="border-b bg-muted px-4 py-3">
                      <h3 className="text-sm font-semibold">{t("workspace.programme.compareResultTitle")}</h3>
                      {compareResult ? <p className="mt-1 text-sm text-muted-foreground">{compareResult}</p> : null}
                    </div>
                    <div className="grid gap-4 px-4 py-3 text-sm md:grid-cols-3">
                      <div className="space-y-1">
                        <p className="font-medium">{t("workspace.programme.compareOnlyA")}</p>
                        {compareFindings.onlyA.map((f) => (
                          <p key={f.id}>
                            <Badge variant="outline" className={cn("mr-1.5 align-middle", FINDING_TONE[f.disposition ?? ""])}>
                              {t(`workspace.programme.findingDisposition.${f.disposition}`, String(f.disposition))}
                            </Badge>
                            {f.summary}
                          </p>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">{t("workspace.programme.compareOnlyB")}</p>
                        {compareFindings.onlyB.map((f) => (
                          <p key={f.id}>
                            <Badge variant="outline" className={cn("mr-1.5 align-middle", FINDING_TONE[f.disposition ?? ""])}>
                              {t(`workspace.programme.findingDisposition.${f.disposition}`, String(f.disposition))}
                            </Badge>
                            {f.summary}
                          </p>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">{t("workspace.programme.compareShared")}</p>
                        {compareFindings.shared.map((f) => (
                          <p key={f.id}>
                            <Badge variant="outline" className={cn("mr-1.5 align-middle", FINDING_TONE[f.disposition ?? ""])}>
                              {t(`workspace.programme.findingDisposition.${f.disposition}`, String(f.disposition))}
                            </Badge>
                            {f.summary}
                          </p>
                        ))}
                      </div>
                    </div>
                  </section>
                ) : null}
                {activeReport ? (
                  <section className="overflow-hidden rounded-lg border bg-background">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted px-4 py-3">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold">{t("workspace.programme.findingsTitle")}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t(`workspace.programme.reportType.${activeReport.report_type}`, activeReport.report_type)}
                          {" · "}
                          {t("workspace.programme.findingsHint")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending || !activeReport.generation_run_id}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await rerunAnalysisFromReport(
                              workspaceId,
                              activeReport.id,
                              analysisInstructions.trim() || undefined,
                            )
                            notifyResult(result.error, t("workspace.programme.analysisRerun"))
                            refresh()
                          })
                        }
                      >
                        {t("workspace.programme.analysisRerun")}
                      </Button>
                    </div>
                    <div className="space-y-3 px-4 py-3">
                    {activeReport.report_type === "quality" && (!Array.isArray(activeReport.findings) || activeReport.findings.length === 0) ? (
                      <p className="text-sm text-muted-foreground">{t("workspace.programme.qcEmpty")}</p>
                    ) : null}
                    {Array.isArray(activeReport.findings) &&
                      activeReport.findings.map((f: any) => (
                        <div key={f.id} className="space-y-1 rounded-md border p-3 text-sm">
                          <p>
                            {f.disposition ? (
                              <Badge variant="outline" className={cn("mr-2 align-middle", FINDING_TONE[f.disposition as string])}>
                                {t(`workspace.programme.findingDisposition.${f.disposition}`, String(f.disposition))}
                              </Badge>
                            ) : null}
                            {f.summary}
                            {f.addressed ? ` · ${t("workspace.programme.qcAddressed")}` : ""}
                          </p>
                          {f.measureId ? (
                            <p className="text-xs text-muted-foreground">
                              {t("workspace.programme.qcMeasure", undefined, { id: f.measureId })}
                            </p>
                          ) : null}
                          {f.visionAnchor ? <p className="text-xs">{t("workspace.programme.findingAnchor", undefined, { value: f.visionAnchor })}</p> : null}
                          {f.provincialInterest ? (
                            <p className="text-xs">{t("workspace.programme.findingInterest", undefined, { value: f.provincialInterest })}</p>
                          ) : null}
                          {f.conflictWithDocumentId ? (
                            <p className="text-xs">
                              {t("workspace.programme.findingConflict", undefined, {
                                value:
                                  citationCatalog.documents.find((doc) => doc.id === f.conflictWithDocumentId)?.title ||
                                  f.conflictWithDocumentId,
                              })}
                            </p>
                          ) : null}
                          {Array.isArray(f.citations) &&
                            f.citations.map((c: { documentId: string; sectionId?: string; quote?: string; pageNumber?: number }, index: number) => (
                              <p key={`${c.documentId}-${index}`} className="text-xs text-muted-foreground">
                                {formatCitationLabel(c, citationCatalog.documents, citationCatalog.sections)}
                                {c.quote ? ` — ${c.quote}` : ""}
                              </p>
                            ))}
                          {f.oerTheme ? (
                            <p className="text-xs">
                              {t("workspace.programme.oerTheme")}: {f.oerTheme}
                            </p>
                          ) : null}
                          {activeReport.report_type === "quality" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () => {
                                  const result = await setFindingAddressed(workspaceId, activeReport.id, f.id, !f.addressed)
                                  notifyResult(result.error, t("workspace.programme.qcToggled"))
                                  refresh()
                                })
                              }
                            >
                              {f.addressed ? t("workspace.programme.qcReopen") : t("workspace.programme.qcAddress")}
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("workspace.programme.noReports")} {t("workspace.programme.emptyNext.analysis")}
                  </p>
                )}
                  </>
                )}
              </div>
            }
          />
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="interests" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage fill title={t("workspace.programme.nav.interests")} purpose={t("workspace.programme.purpose.interests")}>
            <ProgrammeInterestsPanel
              workspaceId={workspaceId}
              canEdit={chromeJob !== "reviewer" && accessRole !== "viewer"}
              citationSources={citationCatalog.documents}
              measuredInterestIds={measuredInterestIds}
              onMessage={notify}
              onChanged={refresh}
            />
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="measures" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            fill
            title={t("workspace.programme.measuresTitle")}
            purpose={t("workspace.programme.purpose.measures")}
            actions={
              <>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || measuresJob.running || accessRole === "viewer"}
              data-guidance-target="generate-measures"
              onClick={() =>
                startTransition(async () => {
                  const result = await startMeasureGeneration(workspaceId, {
                    instructions: measureInstructions || undefined,
                    count: 5,
                  })
                  if (result.error || !result.data) {
                    notify(result.error || t("workspace.programme.exportFailed"), "error")
                    return
                  }
                  measuresJob.watch(result.data)
                })
              }
            >
              {measuresJob.running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("workspace.programme.generateMeasures")}
            </Button>
            <Button
              variant="outline"
              disabled={pending || rolesJob.running || measures.length === 0 || accessRole === "viewer"}
              data-guidance-target="check-roles"
              onClick={() =>
                startTransition(async () => {
                  const result = await startRoleCheck(workspaceId)
                  if (result.error || !result.data) {
                    notify(result.error || t("workspace.programme.exportFailed"), "error")
                    return
                  }
                  rolesJob.watch(result.data)
                })
              }
            >
              {rolesJob.running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("workspace.programme.roleCheck.run")}
            </Button>
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
          <ProgrammeToolExtra label={t("workspace.programme.measuresInstructionsLabel")}>
            <Textarea
              value={measureInstructions}
              onChange={(e) => setMeasureInstructions(e.target.value)}
              rows={3}
              placeholder={t("workspace.programme.measuresInstructionsPlaceholder")}
            />
          </ProgrammeToolExtra>
          <ProgrammeToolExtra
            label={t("workspace.programme.importMeasuresEscape")}
          >
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
          </ProgrammeToolExtra>
              </>
            }
          >
          {sourcePreview ? (
            <section className="shrink-0 border-b">
              <div className="border-b bg-muted px-6 py-3">
                <h3 className="text-sm font-semibold">{t("workspace.programme.sourcePreviewTitle")}</h3>
              </div>
              <SourcePreviewList preview={sourcePreview} className="px-6 py-3" />
            </section>
          ) : null}
          {duplicates.length > 0 && (
            <div className="shrink-0 space-y-2 border-b px-6 py-3">
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
                        <span className="font-medium">{item.title}</span>
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
          <ProgrammeToolSplit
            list={
              <div className="flex h-full min-h-0 flex-col">
                <div className="shrink-0 space-y-2 border-b bg-muted px-4 py-3">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t("workspace.programme.measuresListTitle")}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={measureSort} onValueChange={(value) => setMeasureSort(value as MeasureSort)}>
                      <SelectTrigger className="h-8 w-auto gap-1 bg-background text-xs" aria-label={t("workspace.programme.measureOrder.sortLabel")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEASURE_SORTS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(`workspace.programme.measureOrder.sort.${option}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={measureFilter} onValueChange={(value) => setMeasureFilter(value as MeasureFilter)}>
                      <SelectTrigger className="h-8 w-auto gap-1 bg-background text-xs" aria-label={t("workspace.programme.measureOrder.filterLabel")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEASURE_FILTERS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(`workspace.programme.measureOrder.filter.${option}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      {t("workspace.programme.measureOrder.count", undefined, {
                        shown: String(shownMeasures.length),
                        total: String(measures.length),
                      })}
                    </span>
                  </div>
                </div>
              <ul className="min-h-0 flex-1 overflow-y-auto bg-background text-sm">
                {measures.length === 0 ? (
                  <li className="px-4 py-6 text-muted-foreground">
                    {t("workspace.programme.noMeasures")} {t("workspace.programme.emptyNext.measures")}
                  </li>
                ) : shownMeasures.length === 0 ? (
                  <li className="px-4 py-6 text-muted-foreground">{t("workspace.programme.measureOrder.noneShown")}</li>
                ) : null}
                {shownMeasures.map((item) => {
                  const selected = activeMeasure?.id === item.id
                  const dropped = item.decision === "drop"
                  const roleCheck = parseRoleCheck(item.role_check)
                  const priority = dropped ? null : parseMeasurePriority(item.priority)
                  return (
                    <li key={item.id} className="border-b">
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        data-guidance-target="measure-row"
                        data-guidance-state={[item.decision ? "decided" : "undecided", !dropped && !priority ? "unprioritised" : ""].join(" ").trim()}
                        className={`w-full border-l-2 px-4 py-3 text-left ${selected ? "border-l-foreground bg-background" : "border-l-transparent hover:bg-muted/30"}`}
                        onClick={() => {
                          setSelectedMeasureId(item.id)
                          if (editingMeasureId && editingMeasureId !== item.id) setEditingMeasureId(null)
                        }}
                      >
                        <span className={`block font-medium ${dropped ? "text-muted-foreground line-through" : ""}`}>
                          {item.title}
                        </span>
                        {dropped && item.decision_reason ? (
                          <span className="mt-1 block border-l-2 border-l-red-400 pl-2 text-xs text-muted-foreground">
                            {item.decision_reason}
                          </span>
                        ) : null}
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-normal",
                              !item.decision && "border-dashed text-muted-foreground",
                              item.decision === "adapt" && "border-amber-400 text-amber-900",
                              item.decision === "drop" && "border-red-300 text-red-900",
                            )}
                          >
                            {item.decision
                              ? t(`workspace.programme.decision.status.${item.decision}`)
                              : t("workspace.programme.decision.undecided")}
                          </Badge>
                          {priority ? (
                            <Badge variant={priority === "high" ? "default" : "secondary"} className="font-normal">
                              {t(`workspace.programme.priority.badge.${priority}`)}
                            </Badge>
                          ) : null}
                          {roleCheck ? (
                            <Badge variant="outline" className="font-normal text-muted-foreground" title={roleCheck.reason}>
                              {t(`workspace.programme.roleCheck.actor.${roleCheck.actor}`)}
                            </Badge>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              </div>
            }
            detail={
              <div className="space-y-3 p-6 text-sm">
            {(activeMeasure ? [activeMeasure] : []).map((m) => (
              <div key={m.id} className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3 className={cn("text-base font-semibold", m.decision === "drop" && "text-muted-foreground line-through")}>
                      {m.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {[
                        chapterTitle(m.outline_node_id) || t("workspace.programme.measureField.chapterNone"),
                        t(`workspace.programme.measureType.${m.measure_type}`, m.measure_type),
                        t(`workspace.programme.chapterListStatus.${m.workflow_status}`, m.workflow_status),
                      ].join(" · ")}
                    </p>
                  </div>
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
                          outlineNodeId: m.outline_node_id || "",
                          challenge: m.challenge || "",
                          resources: m.resources || "",
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
                <section className="space-y-3 rounded-lg border bg-muted/20 p-4" data-guidance-target="measure-staff">
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t("workspace.programme.measureStaffTitle")}
                  </h4>
                  <MeasureDecisionControl
                    workspaceId={workspaceId}
                    measureId={m.id}
                    decision={m.decision ?? null}
                    reason={m.decision_reason ?? null}
                    decidedAt={m.decided_at ?? null}
                    decidedByName={personName(m.decided_by)}
                    disabled={pending || accessRole === "viewer"}
                    onMessage={notify}
                    onSaved={refresh}
                  />
                  {m.decision !== "drop" ? (
                    <MeasurePriorityControl
                      workspaceId={workspaceId}
                      measureId={m.id}
                      priority={parseMeasurePriority(m.priority)}
                      reason={m.priority_reason ?? null}
                      disabled={pending || accessRole === "viewer"}
                      onMessage={notify}
                      onSaved={refresh}
                    />
                  ) : null}
                </section>
                <MeasureSummaryLines
                  measure={m}
                  interests={programmeInterests}
                  sourceLabel={(documentId, pageNumber) =>
                    formatCitationLabel({ documentId, pageNumber }, citationCatalog.documents, citationCatalog.sections)
                  }
                  citationLabel={(citation) =>
                    formatCitationLabel(citation, citationCatalog.documents, citationCatalog.sections)
                  }
                />
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
                          <SelectItem value="ambition">{t("workspace.programme.measureType.ambition")}</SelectItem>
                          <SelectItem value="goal">{t("workspace.programme.measureType.goal")}</SelectItem>
                          <SelectItem value="measure">{t("workspace.programme.measureType.measure")}</SelectItem>
                          <SelectItem value="implementation">{t("workspace.programme.measureType.implementation")}</SelectItem>
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
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.challenge")}</span>
                      <Input
                        value={measureDraft.challenge}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, challenge: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs sm:col-span-2">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.resources")}</span>
                      <Input
                        value={measureDraft.resources}
                        onChange={(e) => setMeasureDraft((p) => ({ ...p, resources: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs sm:col-span-2">
                      <span className="text-muted-foreground">{t("workspace.programme.measureField.chapter")}</span>
                      <Select
                        value={measureDraft.outlineNodeId || "none"}
                        onValueChange={(value) =>
                          setMeasureDraft((p) => ({ ...p, outlineNodeId: value === "none" ? "" : value }))
                        }
                      >
                        <SelectTrigger className="w-full" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("workspace.programme.measureField.chapterNone")}</SelectItem>
                          {outlineChapters.map((chapter) => (
                            <SelectItem key={chapter.id} value={chapter.id}>
                              {chapter.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                            outlineNodeId: measureDraft.outlineNodeId || null,
                            challenge: measureDraft.challenge,
                            resources: measureDraft.resources,
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
              </div>
            ))}
            {activeMeasure ? null : (
              <p className="text-sm text-muted-foreground">
                {t("workspace.programme.noMeasures")} {t("workspace.programme.emptyNext.measures")}
              </p>
            )}
              </div>
            }
          />
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="effects" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            fill
            title={t("workspace.programme.nav.effects")}
            purpose={t("workspace.programme.purpose.effects")}
            actions={
              <Button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await runBoundAgentAnalysis({ workspaceId, kind: "oer" })
                    notifyResult(result.error, t("workspace.programme.oerDone"))
                    if (!result.error) refresh()
                  })
                }
              >
                {t("workspace.programme.runOer")}
              </Button>
            }
          >
          <ProgrammeEffectsPanel
            workspaceId={workspaceId}
            measures={measures}
            reports={reports}
            onMessage={notify}
            onRefresh={refresh}
            onGoMeasures={() => setSection("measures")}
            recordedIds={policies.effectsCheckedIds}
          />
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="provenance" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            fill
            title={t("workspace.programme.provenanceTitle")}
            purpose={t("workspace.programme.purpose.provenance")}
          >
          <div className="flex min-h-0 flex-1 flex-col">
          {observability ? (
            <section className="shrink-0 border-b px-6 py-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("workspace.programme.provenanceOverview")}
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  [t("workspace.programme.provenanceRunsLabel"), String(observability.generationRunCount)],
                  [
                    t("workspace.programme.provenanceCoverageLabel"),
                    observability.citationCoverageRate == null ? "—" : `${Math.round(observability.citationCoverageRate * 100)}%`,
                  ],
                  [
                    t("workspace.programme.provenanceUnusedLabel"),
                    observability.unusedSourceRate == null ? "—" : `${Math.round(observability.unusedSourceRate * 100)}%`,
                  ],
                  [
                    t("workspace.programme.provenanceExportLabel"),
                    observability.exportFailureRate == null ? "—" : `${Math.round(observability.exportFailureRate * 100)}%`,
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-muted/40 px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("workspace.programme.provenanceModelsLabel")}
                {": "}
                {observability.modelsUsed.join(", ") || t("workspace.programme.none")}
              </p>
            </section>
          ) : null}
          <ProgrammeToolSplit
            list={
              <div className="flex h-full min-h-0 flex-col">
                <div className="shrink-0 border-b bg-muted px-4 py-3">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t("workspace.programme.provenanceRunListTitle")}
                  </h3>
                  <p className="mt-1 text-xs text-foreground">{t("workspace.programme.provenanceRunListHint")}</p>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto bg-background text-sm">
                  {runs.length === 0 ? (
                    <li className="px-4 py-6 text-muted-foreground">
                      {t("workspace.programme.noRuns")} {t("workspace.programme.emptyNext.provenance")}
                    </li>
                  ) : null}
                  {runs.map((run) => {
                    const selected = (selectedRunId ? run.id === selectedRunId : run.id === runs[0]?.id)
                    return (
                      <li key={run.id} className="border-b">
                        <button
                          type="button"
                          aria-current={selected ? "true" : undefined}
                          className={`w-full border-l-2 px-4 py-3 text-left ${selected ? "border-l-foreground bg-background" : "border-l-transparent hover:bg-muted/30"}`}
                          onClick={() => setSelectedRunId(run.id)}
                          data-guidance-target="provenance-run"
                          data-guidance-state={run.kind}
                        >
                          <span className="block font-medium">
                            {t(`workspace.programme.provenanceKind.${run.kind}`, run.kind)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {run.created_at ? new Date(run.created_at).toLocaleString() : ""}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            }
            detail={
              <div className="space-y-4 p-6">
                {(() => {
                  const run = runs.find((item) => item.id === selectedRunId) ?? runs[0]
                  if (!run) {
                    return (
                      <p className="text-sm text-muted-foreground">
                        {t("workspace.programme.noRuns")} {t("workspace.programme.emptyNext.provenance")}
                      </p>
                    )
                  }
                  const groundedness = run.citations?.groundedness
                  const issues = Array.isArray(groundedness?.issues) ? groundedness.issues : []
                  const score = typeof groundedness?.score === "number" ? `${Math.round(groundedness.score * 100)}%` : null
                  const unused = Array.isArray(run.citations?.unusedSources) ? run.citations.unusedSources : []
                  const unusedGroups = [
                    ["excluded", "workspace.programme.unusedExcluded"],
                    ["not_cited", "workspace.programme.unusedNotCited"],
                    ["should_have_used", "workspace.programme.unusedShouldUse"],
                  ] as const
                  return (
                    <>
                      <section className="overflow-hidden rounded-lg border bg-background">
                        <div className="border-b bg-muted px-4 py-3">
                          <h3 className="text-sm font-semibold">
                            {t(`workspace.programme.provenanceKind.${run.kind}`, run.kind)}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {run.created_at ? new Date(run.created_at).toLocaleString() : ""}
                            {" · "}
                            {run.model || t("workspace.programme.provenanceNoModel")}
                          </p>
                        </div>
                        <div className="space-y-4 px-4 py-4">
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">{t("workspace.programme.provenanceGroundednessTitle")}</h4>
                            <p className="text-sm text-muted-foreground">{t("workspace.programme.provenanceGroundednessHint")}</p>
                            {score == null ? (
                              <p className="text-sm text-muted-foreground">{t("workspace.programme.provenanceNoGroundedness")}</p>
                            ) : (
                              <dl className="grid grid-cols-2 gap-3">
                                <div className="rounded-md border px-3 py-2">
                                  <dt className="text-xs text-muted-foreground">{t("workspace.programme.provenanceScoreLabel")}</dt>
                                  <dd className="mt-1 text-lg font-semibold">{score}</dd>
                                </div>
                                <div className="rounded-md border px-3 py-2">
                                  <dt className="text-xs text-muted-foreground">{t("workspace.programme.provenanceIssuesLabel")}</dt>
                                  <dd className="mt-1 text-lg font-semibold">{issues.length}</dd>
                                </div>
                              </dl>
                            )}
                            {issues.length === 0 && score != null ? (
                              <p className="text-sm text-muted-foreground">{t("workspace.programme.provenanceNoIssues")}</p>
                            ) : null}
                            {issues.length > 0 ? (
                              <ul className="space-y-2">
                                {issues.map((issue: { claim?: string; reason?: string }, index: number) => (
                                  <li key={`${run.id}-issue-${index}`} className="rounded-md border px-3 py-2 text-sm">
                                    <p>{issue.claim}</p>
                                    {issue.reason ? (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {t(`workspace.programme.provenanceIssue.${issue.reason}`, issue.reason)}
                                      </p>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                          <div className="space-y-2 border-t pt-4">
                            <h4 className="text-sm font-semibold">{t("workspace.programme.provenanceUnusedTitle")}</h4>
                            {unused.length === 0 ? (
                              <p className="text-sm text-muted-foreground">{t("workspace.programme.unusedNone")}</p>
                            ) : (
                              unusedGroups.map(([kind, labelKey]) => {
                                const items = unused.filter((item: { kind: string }) =>
                                  kind === "should_have_used"
                                    ? item.kind !== "excluded" && item.kind !== "not_cited"
                                    : item.kind === kind,
                                )
                                if (items.length === 0) return null
                                return (
                                  <div key={kind} className="space-y-2">
                                    <div>
                                      <p className="text-sm font-medium">{t(labelKey)}</p>
                                      <p className="text-xs text-muted-foreground">{t(`${labelKey}Hint`)}</p>
                                    </div>
                                    <ul className="divide-y rounded-md border">
                                      {items.map((item: { id: string; title: string; role?: string | null }) => {
                                        const file = item.title.match(/^(.*)\.(md|markdown|pdf|docx?|txt)$/i)
                                        const name = file
                                          ? file[1].replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
                                          : item.title
                                        const roleValue =
                                          item.role ||
                                          citationCatalog.documents.find((document) => document.id === item.id)?.documentRole
                                        const role = roleValue
                                          ? t(`workspace.programme.documentRoles.${roleValue}`, roleValue)
                                          : ""
                                        const meta = [role, file ? file[2].toLowerCase() : ""].filter(Boolean).join(" · ")
                                        return (
                                          <li key={`${run.id}-${item.id}`} className="px-3 py-2">
                                            <p className="text-sm">{name}</p>
                                            {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      </section>
                    </>
                  )
                })()}
              </div>
            }
          />
          </div>
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="review" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            title={t("workspace.programme.nav.review")}
            purpose={t("workspace.programme.purpose.review")}
          >
          <ProgrammeToolSwitch
            label={t("workspace.programme.reviewPaneLabel")}
            value={reviewPane}
            onChange={setReviewPane}
            options={[
              { id: "chapters", label: t("workspace.programme.reviewPane.chapters") },
              { id: "measures", label: t("workspace.programme.reviewPane.measures") },
              { id: "notes", label: t("workspace.programme.reviewPane.notes") },
            ]}
          />
          {reviewPane === "notes" ? (
            <section className="overflow-hidden rounded-lg border">
              <div className="border-b bg-muted px-4 py-3">
                <h3 className="text-sm font-semibold">{t("workspace.programme.colleagueThemesTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("workspace.programme.colleagueThemesHint")}</p>
              </div>
              <div className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">{t("workspace.programme.colleagueNotConsultation")}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await clusterColleagueComments(workspaceId)
                  notifyResult(result.error, t("workspace.programme.colleagueClustered"))
                  setCommentRefreshKey((key) => key + 1)
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
                  <li key={theme.id} className={cn("space-y-1 rounded-md border p-2", theme.addressed && "opacity-70")}>
                    <p className="text-sm font-medium">{theme.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("workspace.programme.colleagueThemeComments", undefined, { count: String(theme.commentCount) })}
                    </p>
                    {theme.summary ? <p className="text-xs">{theme.summary}</p> : null}
                    {!theme.addressed ? (
                      <div className="space-y-1.5 pt-1">
                        <Textarea
                          rows={3}
                          className="text-xs"
                          value={themeReplies[theme.id] ?? theme.suggestedReply ?? ""}
                          placeholder={t("workspace.programme.colleagueThemeReplyPlaceholder")}
                          onChange={(event) => setThemeReplies((current) => ({ ...current, [theme.id]: event.target.value }))}
                          aria-label={t("workspace.programme.colleagueThemeSuggestedReply")}
                        />
                        <Button
                          size="sm"
                          disabled={pending || !(themeReplies[theme.id] ?? theme.suggestedReply ?? "").trim()}
                          data-guidance-target="theme-reply-all"
                          data-guidance-state="open"
                          onClick={() =>
                            startTransition(async () => {
                              const result = await replyToColleagueTheme(
                                workspaceId,
                                theme.id,
                                themeReplies[theme.id] ?? theme.suggestedReply ?? "",
                              )
                              notifyResult(
                                result.error,
                                t("workspace.programme.colleagueThemeReplied", undefined, {
                                  count: String(result.data?.replied ?? theme.commentCount),
                                }),
                              )
                              setCommentRefreshKey((key) => key + 1)
                              refresh()
                            })
                          }
                        >
                          {t("workspace.programme.colleagueThemeReplyAll", undefined, { count: String(theme.commentCount) })}
                        </Button>
                      </div>
                    ) : theme.suggestedReply ? (
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
            </section>
          ) : null}
          {reviewPane === "chapters" ? (
            <section className="overflow-hidden rounded-lg border">
              {LOCAL_SHORTCUTS ? (
                <div className="border-b bg-muted px-4 py-3">
                  <p className="text-sm text-muted-foreground">{t("workspace.programme.reviewLocalHint")}</p>
                </div>
              ) : null}
              <div className="space-y-3 p-4">
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
          {LOCAL_SHORTCUTS ? (
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
          ) : null}
              </div>
            </section>
          ) : null}
          {reviewPane === "measures" ? (
          <section className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted px-4 py-3">
              <p className="text-xs font-semibold tracking-wide uppercase">{t("workspace.programme.measuresListTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("workspace.programme.reviewMeasuresHint")}</p>
            </div>
          <ul className="divide-y text-sm">
            {pendingMeasures.length === 0 && (
              <li className="px-4 py-6 text-muted-foreground">
                {reviewHasArtefacts
                  ? t("workspace.programme.reviewEmpty")
                  : `${t("workspace.programme.reviewEmptyNone")} ${t("workspace.programme.emptyNext.review")}`}
              </li>
            )}
            {pendingMeasures.map((m) => (
                <li key={m.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="block font-medium">{m.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {t(`workspace.programme.chapterListStatus.${m.workflow_status}`, m.workflow_status)}
                        {m.assigned_reviewer_id
                          ? ` · ${reviewers.find((reviewer) => reviewer.id === m.assigned_reviewer_id)?.name || t("workspace.programme.reviewerUnassigned")}`
                          : ""}
                      </span>
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
          </section>
          ) : null}
          {reviewPane === "chapters" ? (
          <section className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted px-4 py-3">
              <p className="text-xs font-semibold tracking-wide uppercase">{t("workspace.programme.chapterReviewTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("workspace.programme.reviewChaptersHint")}</p>
            </div>
          <ul className="divide-y text-sm">
            {chapters.map((chapter) => (
                <li key={chapter.documentId} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {chapter.title}
                      <span className="text-muted-foreground">
                        {" "}
                        · {t(`workspace.programme.chapterListStatus.${chapter.workflowStatus}`, chapter.workflowStatus)}
                      </span>
                    </span>
                    {chapter.workflowStatus === "approved" ? (
                      <span className="text-xs text-muted-foreground">{t("workspace.programme.chapterApproved")}</span>
                    ) : (
                    <div className="flex gap-1">
                      {(chapter.workflowStatus === "generated" || chapter.workflowStatus === "revised") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          data-guidance-target="request-review"
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
                        data-guidance-target="approve-chapter"
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
                    )}
                  </div>
                  {chapter.workflowStatus === "approved" ? null : (
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
                  )}
                </li>
              ))}
          </ul>
          </section>
          ) : null}
          {reviewPane === "notes" ? (
          <section className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted px-4 py-3">
              <p className="text-xs font-semibold tracking-wide uppercase">{t("workspace.programme.chapterComments")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("workspace.programme.chapterCommentHint")}</p>
            </div>
          <ul className="divide-y text-sm">
            {nestColleagueComments(
              comments.map((c) => ({ ...c, parentId: c.parentId ?? null })),
            ).map((c) => (
              <li key={c.id} className="space-y-1 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <UserAvatar name={c.authorName} url={c.authorAvatarUrl} className="h-6 w-6 shrink-0" />
                    <span className={c.resolved ? "line-through text-muted-foreground" : ""}>
                      {c.authorName ? `${c.authorName} · ` : ""}
                      {c.themeLabel ? `${c.themeLabel} · ` : ""}
                      {c.artefact_type === "section"
                        ? t("workspace.programme.reviewPane.chapters")
                        : c.artefact_type === "document"
                          ? t("workspace.programme.nav.editor")
                          : c.artefact_type === "measure"
                            ? t("workspace.programme.nav.measures")
                            : c.artefact_type}
                      {": "}
                      {c.body}
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
          </section>
          ) : null}
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="consultation" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            title={t("workspace.programme.nav.consultation")}
            purpose={t("workspace.programme.purpose.consultation")}
            actions={
              publication ? (
                <Button variant="outline" asChild>
                  <Link href={`/published/${publication.id}`} target="_blank">
                    {t("workspace.programme.publishOpenRoom")}
                  </Link>
                </Button>
              ) : snapshotLoaded ? (
                <Button variant="outline" onClick={() => setSection("publish")}>
                  {t("workspace.programme.setupGoPublish")}
                </Button>
              ) : null
            }
          >
          {snapshotLoaded && !publication ? (
            <p className="text-sm text-muted-foreground">{t("workspace.programme.emptyNext.consultation")}</p>
          ) : null}
          <ConsultationOwnerPanel
            workspaceId={workspaceId}
            publicationId={publication?.id || null}
            canAdminister={canAdminister}
            queue={consultationQueue}
            onChanged={refresh}
            demo={demo}
          />
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="export" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            title={t("workspace.programme.exportTitle")}
            purpose={t("workspace.programme.purpose.export")}
            actions={
              <>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending}
                data-guidance-target="export-docx"
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
                      pageChrome: documentLayout.pageChrome,
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
                data-guidance-target="export-pdf"
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
                      pageChrome: documentLayout.pageChrome,
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
                disabled={pending || !canAdminister}
                variant="outline"
                data-guidance-target="audit-pack"
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
              </>
            }
          >
          {!observability?.hasSuccessfulExport && (
            <p className="text-sm text-muted-foreground">{t("workspace.programme.emptyNext.export")}</p>
          )}
          {demo && chapters.some((chapter) => chapter.workflowStatus !== "approved") ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="min-w-0 flex-1">{t("workspace.programme.demoApproveHint")}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                data-guidance-target="demo-approve-rest"
                onClick={() =>
                  startTransition(async () => {
                    const result = await approveAllProgrammeLocally(workspaceId)
                    if (result.error) {
                      notify(result.error, "error")
                      return
                    }
                    notify(t("workspace.programme.demoApproveDone"))
                    refresh()
                  })
                }
              >
                {t("workspace.programme.demoApproveAction")}
              </Button>
            </div>
          ) : null}
          <section className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted px-4 py-3">
              <p className="text-sm text-muted-foreground">{t("workspace.programme.exportComposeHint")}</p>
            </div>
            <div className="space-y-3 p-4">
          <label className="flex items-center gap-2 text-sm">
            <Select
              value={classification}
              onValueChange={(value) => setClassification(value as typeof classification)}
            >
              <SelectTrigger size="sm" className="min-w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{t("workspace.programme.classificationOption.public")}</SelectItem>
                <SelectItem value="internal">{t("workspace.programme.classificationOption.internal")}</SelectItem>
                <SelectItem value="confidential">{t("workspace.programme.classificationOption.confidential")}</SelectItem>
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
            </div>
          </section>
          <ProgrammeToolExtra label={t("workspace.programme.exportOverrideLabel")}>
            <Textarea
              value={exportMd}
              onChange={(e) => setExportMd(e.target.value)}
              rows={6}
              placeholder={t("workspace.programme.exportOverridePlaceholder")}
            />
          </ProgrammeToolExtra>
          </ProgrammeToolPage>
        </TabsContent>

        <TabsContent value="publish" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProgrammeToolPage
            title={t("workspace.programme.nav.publish")}
            purpose={t("workspace.programme.purpose.publish")}
            actions={
              <>
            <Button
              disabled={pending || chromeJob === "reviewer" || !policies.hasFreeze || !canAdminister}
              data-guidance-target="publish-snapshot"
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
                <Button variant="outline" asChild data-guidance-target="publish-open-room">
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
            ) : !policies.hasFreeze ? (
              <Button variant="outline" onClick={() => setSection("export")}>
                {t("workspace.programme.setupGoExport")}
              </Button>
            ) : null}
              </>
            }
          >
          <section className="overflow-hidden rounded-lg border">
            <div className="space-y-3 p-4">
          {snapshotLoaded && !publication ? (
            <p className="text-sm text-muted-foreground">{t("workspace.programme.emptyNext.publish")}</p>
          ) : null}
          <p className="text-sm">
            {publication
              ? t("workspace.programme.publishCurrent", undefined, { at: publication.publishedAt })
              : t("workspace.programme.publishNone")}
          </p>
          <p className="text-sm text-muted-foreground">
            {policies.hasFreeze
              ? t("workspace.programme.freezePresent", undefined, { at: policies.freezeAt || "—" })
              : t("workspace.programme.freezeMissing")}
          </p>
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
          {revealedAccessCode ? (
            <p className="text-sm">
              {t("workspace.programme.publishCodeOnce", undefined, { code: revealedAccessCode })}
            </p>
          ) : null}
            </div>
          </section>
          </ProgrammeToolPage>
        </TabsContent>
      </Tabs>
          </ProgrammeToolSheet>
        </ErrorBoundary>
        </DialogContent>
      </Dialog>
    </div>
    </>
    </ProgrammeTextHistoryProvider>
  )
}
