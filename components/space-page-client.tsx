"use client"

import { useEffect, useMemo, useState, useTransition } from "react"

import { SpaceSetupWizard } from "@/components/space-setup-wizard"
import { SpaceDocumentsPanel, type SpaceDocumentItem } from "@/components/space-documents-panel"
import { SpaceWorkspaceList, type SpaceWorkspace } from "@/components/space-workspace-list"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { PencilLine, X, Loader2, Wand2, RotateCcw, Save, MoreVertical, Settings, ArrowLeft } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import Link from "next/link"

import { updateSpaceScope, updateSpace, enhanceScopeText } from "@/lib/actions/space"
import { useI18n } from "@/lib/i18n/use-i18n"
import { GuidanceCoach } from "@/components/guidance-coach"
import { IconTooltip } from "@/components/icon-tooltip"
import { UserMenu } from "@/components/user-menu"
import type { GuidanceMode } from "@/lib/guidance/jobs"

type SpaceScope = {
  summary?: string | null
  description?: string | null
  timeframe?: string | null
}

type SetupWizardState = {
  current_step?: number
  completed?: boolean
  dismissed?: boolean
}

interface SpacePageClientProps {
  spaceId: string
  spaceName: string
  initialSpaceType?: string | null
  initialVisibility?: string | null
  initialJurisdiction?: Record<string, any> | null
  initialScope: SpaceScope
  initialDocuments: SpaceDocumentItem[]
  initialWorkspaces: SpaceWorkspace[]
  canManage: boolean
  canAccessSettings: boolean
  wizardState?: SetupWizardState | null
  spaceJob?: string | null
  userRole?: string | null
  guidanceMode?: GuidanceMode
  helpAiEnabled?: boolean
}

export function SpacePageClient({
  spaceId,
  spaceName,
  initialSpaceType,
  initialVisibility,
  initialJurisdiction,
  initialScope,
  initialDocuments,
  initialWorkspaces,
  canManage,
  canAccessSettings,
  wizardState,
  spaceJob = "none",
  userRole = null,
  guidanceMode = "guided",
  helpAiEnabled = false,
}: SpacePageClientProps) {
  const { t } = useI18n()
  const [guidanceOpen, setGuidanceOpen] = useState(guidanceMode === "guided")
  const [spaceTitle, setSpaceTitle] = useState(spaceName)
  const [spaceTitleDraft, setSpaceTitleDraft] = useState(spaceName)
  const [spaceDetails, setSpaceDetails] = useState({
    spaceType: initialSpaceType ?? "municipal",
    visibility: initialVisibility ?? "internal",
    jurisdiction: initialJurisdiction ?? null,
  })
  const [scopeState, setScopeState] = useState<SpaceScope>(initialScope)
  const [documents, setDocuments] = useState<SpaceDocumentItem[]>(initialDocuments)
  const [workspaces, setWorkspaces] = useState<SpaceWorkspace[]>(initialWorkspaces)
  const [wizardOpen, setWizardOpen] = useState(
    canManage && !(wizardState?.completed || wizardState?.dismissed),
  )
  const [isEditingScope, setIsEditingScope] = useState(false)
  const formatJurisdiction = (jurisdiction?: Record<string, any> | null) => {
    if (!jurisdiction) {
      return ""
    }
    const values = Object.values(jurisdiction).filter((value) => typeof value === "string")
    if (values.length === 0) {
      return ""
    }
    return values.join(" • ")
  }
  const capitalizeFirst = (str: string | null | undefined) => {
    if (!str) return ""
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }

const translateScopeBadge = (value: string | null | undefined, t: ReturnType<typeof useI18n>["t"]) => {
  if (!value) return ""
  return t(`space.wizard.basics.scopeOptions.${value}`, capitalizeFirst(value))
}

const translateVisibilityBadge = (value: string | null | undefined, t: ReturnType<typeof useI18n>["t"]) => {
  if (!value) return ""
  return t(`space.wizard.basics.visibilityOptions.${value}`, capitalizeFirst(value))
}
  const [summaryDraft, setSummaryDraft] = useState(initialScope.summary ?? "")
  const [descriptionDraft, setDescriptionDraft] = useState(initialScope.description ?? "")
  const [spaceTypeDraft, setSpaceTypeDraft] = useState(initialSpaceType ?? "municipal")
  const [visibilityDraft, setVisibilityDraft] = useState(initialVisibility ?? "internal")
  const [timeframeDraft, setTimeframeDraft] = useState(initialScope.timeframe ?? "")
  const [jurisdictionDraft, setJurisdictionDraft] = useState(formatJurisdiction(initialJurisdiction))
  const [timeframeError, setTimeframeError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSavingScope, startSavingScope] = useTransition()
  const [isEnhancing, startEnhancing] = useTransition()
  const [enhancingField, setEnhancingField] = useState<"summary" | "description" | null>(null)
  const [activeField, setActiveField] = useState<"summary" | "description" | null>(null)
  const [summaryPrevious, setSummaryPrevious] = useState<string | null>(null)
  const [descriptionPrevious, setDescriptionPrevious] = useState<string | null>(null)

  const summaryText = useMemo(() => {
    const value = scopeState.summary?.trim()
    return value && value.length > 0 ? value : null
  }, [scopeState.summary])
  const descriptionText = useMemo(() => {
    const value = scopeState.description?.trim()
    return value && value.length > 0 ? value : null
  }, [scopeState.description])
  const timeframeText = useMemo(() => {
    const value = scopeState.timeframe?.trim()
    return value && value.length > 0 ? value : null
  }, [scopeState.timeframe])
  const jurisdictionText = useMemo(() => formatJurisdiction(spaceDetails.jurisdiction), [spaceDetails.jurisdiction])

  useEffect(() => {
    if (!isEditingScope) {
      setSpaceTitleDraft(spaceTitle)
      setSummaryDraft(scopeState.summary ?? "")
      setDescriptionDraft(scopeState.description ?? "")
      setSpaceTypeDraft(spaceDetails.spaceType)
      setVisibilityDraft(spaceDetails.visibility)
      setTimeframeDraft(scopeState.timeframe ?? "")
      setJurisdictionDraft(jurisdictionText)
      setTimeframeError(null)
      setSaveError(null)
    }
  }, [isEditingScope, scopeState, spaceDetails, jurisdictionText, spaceTitle])

  const handleDocumentUploaded = (document: SpaceDocumentItem) => {
    setDocuments((prev) => {
      if (prev.some((item) => item.id === document.id)) {
        return prev
      }
      return [document, ...prev]
    })
  }

  const handleDocumentDeleted = (documentId: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== documentId))
  }

  const handleWorkspaceCreated = (workspace: SpaceWorkspace) => {
    setWorkspaces((prev) => {
      if (prev.some((item) => item.id === workspace.id)) {
        return prev
      }
      return [workspace, ...prev]
    })
  }

  const renderScopeOverview = () => {
    return (
      <section className="shrink-0 space-y-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{spaceTitle}</h2>
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
              {spaceDetails.spaceType && (
                <Badge variant="outline">{translateScopeBadge(spaceDetails.spaceType, t)}</Badge>
              )}
              {spaceDetails.visibility && (
                <Badge variant="outline">{translateVisibilityBadge(spaceDetails.visibility, t)}</Badge>
              )}
              {timeframeText && <Badge variant="secondary">{timeframeText}</Badge>}
              {jurisdictionText && jurisdictionText.length > 0 && (
                <span className="text-muted-foreground">{jurisdictionText}</span>
              )}
            </div>
          </div>
          {canManage && !isEditingScope && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <span className="inline-flex">
                  <IconTooltip label={t("space.overview.menu.more")}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={t("space.overview.menu.more")}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </IconTooltip>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEditClick}>
                  <PencilLine className="h-4 w-4" />
                  {t("space.overview.menu.edit")}
                </DropdownMenuItem>
                {canAccessSettings && (
                  <DropdownMenuItem asChild>
                    <Link href={`/spaces/${spaceId}/settings`}>
                      <Settings className="h-4 w-4" />
                      {t("space.overview.menu.settings")}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setWizardOpen(true)}>
                  <Wand2 className="h-4 w-4" />
                  {t("guidance.coach.reopenWizard")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="space-y-5">
          <p className="whitespace-pre-line text-base font-semibold text-foreground">
            {summaryText ?? t("space.overview.summaryEmpty")}
          </p>
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {descriptionText ?? t("space.overview.descriptionEmpty")}
          </p>
        </div>

        <Separator className="bg-border mt-4" />
      </section>
    )
  }

  const validateTimeframe = () => {
    if (!timeframeDraft || timeframeDraft.trim().length === 0) {
      setTimeframeError(null)
      return true
    }

    const trimmed = timeframeDraft.trim()
    const pattern = /^\d{4}(?:\s?[–-]\s?\d{4})?$/

    if (!pattern.test(trimmed)) {
      setTimeframeError(t("space.overview.timeframeError"))
      return false
    }

    setTimeframeError(null)
    return true
  }

  const sanitizeJurisdiction = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return null
    }
    return { label: trimmed }
  }

  const handleTimeframeDraftChange = (value: string, inputType?: string | null) => {
    if (!value) {
      setTimeframeDraft("")
      if (timeframeError) {
        setTimeframeError(null)
      }
      return
    }

    const sanitized = value.replace(/[^\d\s–-]/g, "").replace(/\s+/g, " ")
    const normalized = sanitized.replace("-", "–").replace(/\s*–\s*/, " – ")
    const compactDigits = sanitized.replace(/\s|–|-/g, "")
    const isDeleting = inputType?.startsWith("delete")

    if (isDeleting) {
      setTimeframeDraft(value)
      if (timeframeError) {
        setTimeframeError(null)
      }
      return
    }

    let nextValue = normalized

    if (!sanitized.includes("–") && !sanitized.includes("-")) {
      if (/^\d{4}$/.test(compactDigits)) {
        nextValue = `${compactDigits} – `
      } else {
        nextValue = compactDigits
      }
    } else {
      const [start, end = ""] = sanitized.split(/[–-]/)
      const trimmedEnd = end.replace(/\s/g, "")
      if (trimmedEnd.length > 4) {
        const clipped = trimmedEnd.slice(0, 4)
        const normalizedStart = start.trim()
        nextValue = `${normalizedStart} – ${clipped}`
      }
    }

    setTimeframeDraft(nextValue)
    if (timeframeError) {
      setTimeframeError(null)
    }
  }

  const handleEditClick = () => {
    setSpaceTitleDraft(spaceTitle)
    setSummaryDraft(scopeState.summary ?? "")
    setDescriptionDraft(scopeState.description ?? "")
    setSpaceTypeDraft(spaceDetails.spaceType)
    setVisibilityDraft(spaceDetails.visibility)
    setTimeframeDraft(scopeState.timeframe ?? "")
    setJurisdictionDraft(jurisdictionText)
    setTimeframeError(null)
    setSaveError(null)
    setActiveField(null)
    setSummaryPrevious(null)
    setDescriptionPrevious(null)
    setIsEditingScope(true)
  }

  const handleCancelEdit = () => {
    setSpaceTitleDraft(spaceTitle)
    setSummaryDraft(scopeState.summary ?? "")
    setDescriptionDraft(scopeState.description ?? "")
    setSpaceTypeDraft(spaceDetails.spaceType)
    setVisibilityDraft(spaceDetails.visibility)
    setTimeframeDraft(scopeState.timeframe ?? "")
    setJurisdictionDraft(jurisdictionText)
    setTimeframeError(null)
    setSaveError(null)
    setActiveField(null)
    setSummaryPrevious(null)
    setDescriptionPrevious(null)
    setIsEditingScope(false)
  }

  const handleSaveScope = () => {
    if (!validateTimeframe()) {
      return
    }

    const nameValue = spaceTitleDraft.trim()
    const normalizedTimeframe = timeframeDraft.trim().length > 0 ? timeframeDraft.trim().replace(/-/g, "–") : null
    const jurisdictionPayload = sanitizeJurisdiction(jurisdictionDraft)

    startSavingScope(async () => {
      const scopeResult = await updateSpaceScope(spaceId, {
        summary: summaryDraft.trim().length > 0 ? summaryDraft : null,
        description: descriptionDraft.trim().length > 0 ? descriptionDraft : null,
        timeframe: normalizedTimeframe,
      })

      if (scopeResult.error) {
        setSaveError(scopeResult.error)
        return
      }

      const updates: Record<string, any> = {
        space_type: spaceTypeDraft,
        visibility: visibilityDraft as any,
        jurisdiction: jurisdictionPayload ?? {},
      }

      if (nameValue.length > 0) {
        updates.name = nameValue
      }

      const spaceResult = await updateSpace(spaceId, updates)

      if (spaceResult?.error) {
        setSaveError(spaceResult.error)
        return
      }

      setScopeState({
        summary: summaryDraft.trim().length > 0 ? summaryDraft : null,
        description: descriptionDraft.trim().length > 0 ? descriptionDraft : null,
        timeframe: normalizedTimeframe,
      })
      setSpaceDetails({
        spaceType: spaceTypeDraft,
        visibility: visibilityDraft,
        jurisdiction: jurisdictionPayload,
      })
      if (nameValue.length > 0) {
        setSpaceTitle(nameValue)
      }
      setActiveField(null)
      setSummaryPrevious(null)
      setDescriptionPrevious(null)
      setIsEditingScope(false)
      setSaveError(null)
    })
  }

  const handleEnhance = (field: "summary" | "description") => {
    const targetText = field === "summary" ? summaryDraft : descriptionDraft
    if (!targetText || targetText.trim().length === 0) {
      return
    }

    setSaveError(null)
    setEnhancingField(field)

    startEnhancing(async () => {
      try {
        const result = await enhanceScopeText(targetText, {
          field,
          spaceName: field === "summary" ? spaceTitle : undefined,
          missionStatement: field === "description" ? summaryDraft : undefined,
        })
        if (result.error) {
          setSaveError(result.error)
          return
        }
        if (result.enhanced) {
          if (field === "summary") {
            setSummaryPrevious(summaryDraft)
            setSummaryDraft(result.enhanced)
          } else {
            setDescriptionPrevious(descriptionDraft)
            setDescriptionDraft(result.enhanced)
          }
        }
      } finally {
        setEnhancingField(null)
      }
    })
  }

  const handleUndoEnhance = (field: "summary" | "description") => {
    if (field === "summary" && summaryPrevious !== null) {
      setSummaryDraft(summaryPrevious)
      setSummaryPrevious(null)
    }
    if (field === "description" && descriptionPrevious !== null) {
      setDescriptionDraft(descriptionPrevious)
      setDescriptionPrevious(null)
    }
  }

  return (
    <>
    <div
      className="guidance-content-shift flex h-dvh min-h-0 flex-col overflow-hidden bg-white"
      data-open={guidanceOpen ? "true" : undefined}
    >
      <header className="shrink-0 bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <Button variant="ghost" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-3 w-3" />
              <span className="text-xs font-normal">{t("space.page.backToDashboard")}</span>
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            {spaceJob === "administrator" && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {t("guidance.jobs.administrator")}
              </span>
            )}
            {userRole ? (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {t(`space.common.roles.${userRole.toLowerCase()}`, userRole)}
              </span>
            ) : null}
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden contain-paint bg-white">
    <div className="container mx-auto flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-8 pb-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {canManage && (
        <SpaceSetupWizard
          open={wizardOpen}
          spaceId={spaceId}
          spaceName={spaceTitle}
          spaceType={spaceDetails.spaceType}
          visibility={spaceDetails.visibility}
          jurisdiction={spaceDetails.jurisdiction}
          scope={scopeState}
          documents={documents}
          workspaces={workspaces}
          initialWizardState={wizardState ?? undefined}
          onDismissed={() => setWizardOpen(false)}
          onCompleted={() => setWizardOpen(false)}
          onDocumentUploaded={handleDocumentUploaded}
          onWorkspaceCreated={handleWorkspaceCreated}
          onScopeUpdated={(nextScope) => setScopeState(nextScope)}
          onSpaceDetailsChange={(details) =>
            setSpaceDetails((prev) => ({
              spaceType: details.spaceType ?? prev.spaceType,
              visibility: details.visibility ?? prev.visibility,
              jurisdiction:
                details.jurisdiction !== undefined ? details.jurisdiction : prev.jurisdiction,
            }))
          }
        />
      )}

      {isEditingScope ? (
        <div className="max-h-[42vh] shrink-0 space-y-4 overflow-y-auto rounded-lg border border-border bg-card/50 p-4 shadow-lg">
          <h2 className="text-lg font-semibold text-foreground">
            {t("common.labels.editing")}{" "}
            <span className="text-primary">{spaceTitle}</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="space-title">{t("space.overview.edit.spaceTitleLabel")}</Label>
              <Input
                id="space-title"
                value={spaceTitleDraft}
                onChange={(event) => setSpaceTitleDraft(event.target.value)}
                placeholder={t("space.overview.edit.spaceTitlePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="space-jurisdiction">{t("space.overview.edit.jurisdictionLabel")}</Label>
              <Input
                id="space-jurisdiction"
                value={jurisdictionDraft}
                onChange={(event) => setJurisdictionDraft(event.target.value)}
                placeholder={t("space.overview.edit.jurisdictionPlaceholder")}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="space-scope">{t("space.wizard.basics.scopeLabel")}</Label>
              <Select value={spaceTypeDraft} onValueChange={setSpaceTypeDraft}>
                <SelectTrigger id="space-scope">
                  <SelectValue
                    aria-label={t("space.wizard.basics.scopeLabel")}
                    placeholder={t("space.wizard.basics.scopePlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="national">{t("space.wizard.basics.scopeOptions.national")}</SelectItem>
                  <SelectItem value="regional">{t("space.wizard.basics.scopeOptions.regional")}</SelectItem>
                  <SelectItem value="municipal">{t("space.wizard.basics.scopeOptions.municipal")}</SelectItem>
                  <SelectItem value="party">{t("space.wizard.basics.scopeOptions.party")}</SelectItem>
                  <SelectItem value="other">{t("space.wizard.basics.scopeOptions.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="space-visibility">{t("space.wizard.basics.visibilityLabel")}</Label>
              <Select value={visibilityDraft} onValueChange={setVisibilityDraft}>
                <SelectTrigger id="space-visibility">
                  <SelectValue
                    aria-label={t("space.wizard.basics.visibilityLabel")}
                    placeholder={t("space.wizard.basics.visibilityPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t("space.wizard.basics.visibilityOptions.public")}</SelectItem>
                  <SelectItem value="internal">{t("space.wizard.basics.visibilityOptions.internal")}</SelectItem>
                  <SelectItem value="confidential">{t("space.wizard.basics.visibilityOptions.confidential")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-timeframe">{t("space.overview.edit.timeframeLabel")}</Label>
            <Input
              id="space-timeframe"
              value={timeframeDraft}
              onChange={(event) =>
                handleTimeframeDraftChange(
                  event.target.value,
                  (event.nativeEvent as InputEvent | undefined)?.inputType ?? null,
                )
              }
              onBlur={validateTimeframe}
              placeholder={t("space.overview.edit.timeframePlaceholder")}
              inputMode="numeric"
              pattern="\d{4}(?:\s?–\s?\d{4})?"
            />
            {timeframeError && <p className="text-xs text-destructive">{timeframeError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-summary">{t("space.overview.edit.summaryLabel")}</Label>
            <div className="relative">
              <Textarea
                id="space-summary"
                value={summaryDraft}
                onChange={(event) => setSummaryDraft(event.target.value)}
                placeholder={t("space.overview.edit.summaryPlaceholder")}
                rows={4}
                className="pb-10"
                onFocus={() => setActiveField("summary")}
                onBlur={() => setActiveField((current) => (current === "summary" ? null : current))}
              />
              {activeField === "summary" && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  {summaryPrevious !== null && (
                    <IconTooltip label={t("space.overview.edit.undoSummary")}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleUndoEnhance("summary")}
                        className="h-8 w-8 p-0 bg-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-transparent"
                        aria-label={t("space.overview.edit.undoSummary")}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </IconTooltip>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleEnhance("summary")}
                          disabled={isEnhancing || !summaryDraft || summaryDraft.trim().length === 0}
                          className="h-8 w-8 p-0 hover:bg-transparent group"
                        >
                          {isEnhancing && enhancingField === "summary" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                          ) : (
                            <Wand2 className="h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-600" />
                          )}
                          <span className="sr-only">{t("space.overview.edit.enhanceSummary")}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" align="center">
                        {t("space.overview.edit.enhanceSummaryHelp")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-description">{t("space.overview.edit.descriptionLabel")}</Label>
            <div className="relative">
              <Textarea
                id="space-description"
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                placeholder={t("space.overview.edit.descriptionPlaceholder")}
                rows={8}
                className="pb-10"
                onFocus={() => setActiveField("description")}
                onBlur={() => setActiveField((current) => (current === "description" ? null : current))}
              />
              {activeField === "description" && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  {descriptionPrevious !== null && (
                    <IconTooltip label={t("space.overview.edit.undoDescription")}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleUndoEnhance("description")}
                        className="h-8 w-8 p-0 bg-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-transparent"
                        aria-label={t("space.overview.edit.undoDescription")}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </IconTooltip>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleEnhance("description")}
                          disabled={isEnhancing || !descriptionDraft || descriptionDraft.trim().length === 0}
                          className="h-8 w-8 p-0 hover:bg-transparent group"
                        >
                          {isEnhancing && enhancingField === "description" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                          ) : (
                            <Wand2 className="h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-600" />
                          )}
                          <span className="sr-only">{t("space.overview.edit.enhanceDescription")}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" align="center">
                        {t("space.overview.edit.enhanceDescriptionHelp")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          </div>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={handleCancelEdit} disabled={isSavingScope}>
              <X className="mr-2 h-4 w-4" />
              {t("space.overview.edit.cancel")}
            </Button>
            <Button type="button" onClick={handleSaveScope} disabled={isSavingScope}>
              {isSavingScope ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("space.overview.edit.saving")}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t("space.overview.edit.save")}
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        renderScopeOverview()
      )}

      <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SpaceWorkspaceList spaceId={spaceId} workspaces={workspaces} canCreate={canManage} spaceName={spaceTitle} />
        </div>

        <Separator className="my-8 shrink-0 bg-border" />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SpaceDocumentsPanel
          spaceId={spaceId}
          documents={documents}
          onDocumentsChange={setDocuments}
          spaceName={spaceTitle}
          canUpload={canManage}
          canManage={canManage}
        />
        </div>
      </div>
      </div>
    </div>
      </main>
    </div>
      <GuidanceCoach
        surface="organisation"
        placeName={spaceTitle}
        spaceId={spaceId}
        job={spaceJob === "administrator" ? "administrator" : "author"}
        guidanceMode={guidanceMode}
        helpAiEnabled={helpAiEnabled}
        canReopenWizard={canManage}
        onReopenWizard={() => setWizardOpen(true)}
        onOpenChange={setGuidanceOpen}
      />
    </>
  )
}

