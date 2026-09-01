"use client"

import { useEffect, useMemo, useState, useTransition } from "react"

import { useRouter } from "next/navigation"
import { updateSpace, updateSpaceScope, enhanceScopeText, updateSpaceSetupState } from "@/lib/actions/space"
import { createWorkspace } from "@/lib/actions/workspace"
import { workspaceHomeHref } from "@/lib/programme/domain"
import { AddOverheidDocumentsDialog } from "@/components/add-overheid-documents-dialog"
import { SpaceUploadDocumentDialog } from "@/components/space-upload-document-dialog"
import { type SpaceDocumentItem } from "@/components/space-documents-panel"
import { type SpaceWorkspace } from "@/components/space-workspace-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { CheckCircle2, ChevronLeft, ChevronRight, FileText, Loader2, RotateCcw, Sparkles, Upload, Wand2, X, Search } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/lib/i18n/use-i18n"

type SetupWizardState = {
  current_step?: number
  completed?: boolean
  dismissed?: boolean
}

type SpaceScope = {
  summary?: string | null
  description?: string | null
  timeframe?: string | null
}

type SpaceDetailsUpdate = {
  spaceType?: string | null
  visibility?: string | null
  jurisdiction?: Record<string, any> | null
}

interface SpaceSetupWizardProps {
  open: boolean
  spaceId: string
  spaceName: string
  spaceType?: string | null
  visibility?: string | null
  jurisdiction?: Record<string, any> | null
  scope: SpaceScope
  documents: SpaceDocumentItem[]
  workspaces: SpaceWorkspace[]
  initialWizardState?: SetupWizardState
  onDismissed: () => void
  onCompleted: () => void
  onDocumentUploaded: (document: SpaceDocumentItem) => void
  onWorkspaceCreated: (workspace: SpaceWorkspace) => void
  onScopeUpdated: (scope: SpaceScope) => void
  onSpaceDetailsChange: (details: SpaceDetailsUpdate) => void
}

export function SpaceSetupWizard({
  open,
  spaceId,
  spaceName,
  spaceType,
  visibility,
  jurisdiction,
  scope,
  documents,
  workspaces,
  initialWizardState,
  onDismissed,
  onCompleted,
  onDocumentUploaded,
  onWorkspaceCreated,
  onScopeUpdated,
  onSpaceDetailsChange,
}: SpaceSetupWizardProps) {
  const { t } = useI18n()
  const router = useRouter()
  const normalizedInitialWizardState = useMemo<SetupWizardState>(() => {
    if (!initialWizardState) return {}
    return {
      current_step: initialWizardState.current_step ?? 0,
      completed: initialWizardState.completed ?? false,
      dismissed: initialWizardState.dismissed ?? false,
    }
  }, [initialWizardState])

  const steps = useMemo(
    () => [
      {
        key: "welcome",
        title: t("space.wizard.steps.welcome.title"),
        description: t("space.wizard.steps.welcome.description"),
      },
      {
        key: "basics",
        title: t("space.wizard.steps.basics.title"),
        description: t("space.wizard.steps.basics.description"),
      },
      {
        key: "scope",
        title: t("space.wizard.steps.scope.title"),
        description: t("space.wizard.steps.scope.description"),
      },
      {
        key: "overheid",
        title: t("space.wizard.steps.overheid.title"),
        description: t("space.wizard.steps.overheid.description"),
      },
      {
        key: "documents",
        title: t("space.wizard.steps.documents.title"),
        description: t("space.wizard.steps.documents.description"),
      },
      {
        key: "workspace",
        title: t("space.wizard.steps.workspace.title"),
        description: t("space.wizard.steps.workspace.description"),
      },
    ],
    [t],
  )

  const welcomeCoverItems = useMemo(
    () => [
      {
        title: t("space.wizard.welcome.coverItems.basics.title"),
        description: t("space.wizard.welcome.coverItems.basics.description"),
      },
      {
        title: t("space.wizard.welcome.coverItems.scope.title"),
        description: t("space.wizard.welcome.coverItems.scope.description"),
      },
      {
        title: t("space.wizard.welcome.coverItems.official.title"),
        description: t("space.wizard.welcome.coverItems.official.description"),
      },
      {
        title: t("space.wizard.welcome.coverItems.documents.title"),
        description: t("space.wizard.welcome.coverItems.documents.description"),
      },
      {
        title: t("space.wizard.welcome.coverItems.workspace.title"),
        description: t("space.wizard.welcome.coverItems.workspace.description"),
      },
    ],
    [t],
  )

  const welcomeBenefitItems = useMemo(
    () => [
      {
        title: t("space.wizard.welcome.benefitsItems.structured.title"),
        description: t("space.wizard.welcome.benefitsItems.structured.description"),
      },
      {
        title: t("space.wizard.welcome.benefitsItems.sharedDocs.title"),
        description: t("space.wizard.welcome.benefitsItems.sharedDocs.description"),
      },
      {
        title: t("space.wizard.welcome.benefitsItems.workspace.title"),
        description: t("space.wizard.welcome.benefitsItems.workspace.description"),
      },
    ],
    [t],
  )

  const [currentStep, setCurrentStep] = useState(() => {
    const stored = normalizedInitialWizardState.current_step ?? 0
    if (stored < 0) return 0
    if (stored >= steps.length) return steps.length - 1
    return stored
  })

  const [spaceTypeValue, setSpaceTypeValue] = useState(spaceType ?? "municipal")
  const [visibilityValue, setVisibilityValue] = useState(visibility ?? "internal")

  const initialJurisdictionLabel = useMemo(() => {
    if (!jurisdiction) return ""
    if (typeof jurisdiction.label === "string") {
      return jurisdiction.label
    }
    const values = Object.values(jurisdiction).filter((value) => typeof value === "string") as string[]
    return values.join(" • ")
  }, [jurisdiction])

  const [jurisdictionLabel, setJurisdictionLabel] = useState(initialJurisdictionLabel)

  const [summary, setSummary] = useState(scope.summary ?? "")
  const [description, setDescription] = useState(scope.description ?? "")
  const [timeframe, setTimeframe] = useState(scope.timeframe ?? "")
  const [timeframeError, setTimeframeError] = useState<string | null>(null)

  const [originalSummary, setOriginalSummary] = useState<string | null>(null)
  const [originalDescription, setOriginalDescription] = useState<string | null>(null)
  const [enhancementCompleted, setEnhancementCompleted] = useState<{ summary?: boolean; description?: boolean }>({})
  const [focusedField, setFocusedField] = useState<"summary" | "description" | null>(null)
  const [enhancingField, setEnhancingField] = useState<"summary" | "description" | null>(null)
  const [isEnhancing, startEnhancing] = useTransition()

  const defaultWorkspaceName = useMemo(
    () => t("space.wizard.workspace.defaultName", undefined, { space: spaceName }),
    [spaceName, t],
  )
  const [workspaceName, setWorkspaceName] = useState(defaultWorkspaceName)
  useEffect(() => {
    setWorkspaceName((current) => (current === defaultWorkspaceName ? defaultWorkspaceName : current))
  }, [defaultWorkspaceName])
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [createdWorkspace, setCreatedWorkspace] = useState<{
    id: string
    name: string
    kind?: string | null
    metadata?: Record<string, unknown> | null
  } | null>(null)
  const [workspaceIsCreating, setWorkspaceIsCreating] = useState(false)

  const [stepError, setStepError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null)
  const [localDocuments, setLocalDocuments] = useState<SpaceDocumentItem[]>(documents)
  const [overheidDialogOpen, setOverheidDialogOpen] = useState(false)

  // Update local documents when prop changes
  useEffect(() => {
    setLocalDocuments(documents)
  }, [documents])

  const currentStepKey = steps[currentStep]?.key
  const trimmedJurisdiction = jurisdictionLabel.trim()
  const scopeContextSegments = [summary, description].map((value) => (value || "").trim()).filter((value) => value.length > 0)
  const overheidContext = scopeContextSegments.join("\n\n")
  const canLaunchOverheidSearch = trimmedJurisdiction.length > 0 && scopeContextSegments.length > 0

  useEffect(() => {
    if (currentStepKey !== "overheid") {
      setOverheidDialogOpen(false)
    }
  }, [currentStepKey])

  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  const handleSkipWizard = async () => {
    setStepError(null)
    setIsSubmitting(true)
    const result = await updateSpaceSetupState(spaceId, { dismissed: true })
    setIsSubmitting(false)
    if (result?.error) {
      setStepError(result.error)
      return
    }
    onDismissed()
  }

  const handleEnhance = (field: "summary" | "description") => {
    const targetText = field === "summary" ? summary : description
    if (!targetText || targetText.trim().length === 0) {
      setStepError(
        field === "summary" ? t("space.wizard.errors.summaryMissing") : t("space.wizard.errors.descriptionMissing"),
      )
      return
    }

    setStepError(null)
    setEnhancingField(field)
    // Store original text before enhancement
    if (field === "summary") {
      setOriginalSummary(targetText)
    } else {
      setOriginalDescription(targetText)
    }
    startEnhancing(async () => {
      const result = await enhanceScopeText(targetText, {
        field,
        spaceName: field === "summary" ? spaceName : undefined,
        missionStatement: field === "description" ? summary : undefined,
      })
      if (result.error) {
        setStepError(result.error)
        setEnhancingField(null)
        // Clear original text if enhancement failed
        if (field === "summary") {
          setOriginalSummary(null)
        } else {
          setOriginalDescription(null)
        }
        return
      }
      if (result.enhanced) {
        if (field === "summary") {
          setSummary(result.enhanced)
          setEnhancementCompleted((prev) => ({ ...prev, summary: true }))
        } else {
          setDescription(result.enhanced)
          setEnhancementCompleted((prev) => ({ ...prev, description: true }))
        }
      }
      setEnhancingField(null)
    })
  }

  const handleUndo = (field: "summary" | "description") => {
    if (field === "summary" && originalSummary !== null) {
      setSummary(originalSummary)
      setOriginalSummary(null)
      setEnhancementCompleted((prev) => ({ ...prev, summary: false }))
    } else if (field === "description" && originalDescription !== null) {
      setDescription(originalDescription)
      setOriginalDescription(null)
      setEnhancementCompleted((prev) => ({ ...prev, description: false }))
    }
  }

  const handleTimeframeChange = (value: string, inputType?: string | null) => {
    if (!value) {
      setTimeframe("")
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
      setTimeframe(value)
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

    setTimeframe(nextValue)
    if (timeframeError) {
      setTimeframeError(null)
    }
  }

  const validateTimeframe = () => {
    if (!timeframe || timeframe.trim().length === 0) {
      setTimeframeError(null)
      return true
    }

    const trimmed = timeframe.trim()
    const pattern = /^\d{4}(?:\s?[–-]\s?\d{4})?$/

    if (!pattern.test(trimmed)) {
      setTimeframeError(t("space.overview.timeframeError"))
      return false
    }

    const normalized = trimmed.replace("-", "–").replace(/\s*–\s*/, " – ").trim()
    setTimeframe(normalized)
    setTimeframeError(null)
    return true
  }

  const persistCurrentStep = async () => {
    const step = steps[currentStep]?.key
    switch (step) {
      case "basics": {
        const updates: Record<string, any> = {
          space_type: spaceTypeValue,
          visibility: visibilityValue,
        }

        const shouldUpdateJurisdiction =
          jurisdictionLabel.trim().length === 0
            ? initialJurisdictionLabel.trim().length > 0
            : jurisdictionLabel.trim() !== initialJurisdictionLabel.trim()

        if (shouldUpdateJurisdiction) {
          updates.jurisdiction =
            jurisdictionLabel.trim().length > 0 ? { label: jurisdictionLabel.trim() } : {}
        }

        const result = await updateSpace(spaceId, updates)
        if (result?.error) {
          setStepError(result.error)
          return false
        }

        onSpaceDetailsChange({
          spaceType: spaceTypeValue,
          visibility: visibilityValue,
          jurisdiction:
            jurisdictionLabel.trim().length > 0 ? { label: jurisdictionLabel.trim() } : {},
        })
        return true
      }
      case "scope": {
        if (!validateTimeframe()) {
          return false
        }
        const result = await updateSpaceScope(spaceId, {
          summary,
          description,
          timeframe,
        })
        if (result?.error) {
          setStepError(result.error)
          return false
        }

        onScopeUpdated({
          summary,
          description,
          timeframe,
        })
        return true
      }
      default:
        return true
    }
  }

  const handleNext = async () => {
    setStepError(null)
    setIsSubmitting(true)

    const canAdvance = await persistCurrentStep()
    if (!canAdvance) {
      setIsSubmitting(false)
      return
    }

    const nextStep = Math.min(currentStep + 1, steps.length - 1)
    const result = await updateSpaceSetupState(spaceId, { current_step: nextStep })
    setIsSubmitting(false)
    if (result?.error) {
      setStepError(result.error)
      return
    }
    setCurrentStep(nextStep)
  }

  const handleBack = async () => {
    setStepError(null)
    const previousStep = Math.max(currentStep - 1, 0)
    setIsSubmitting(true)
    const result = await updateSpaceSetupState(spaceId, { current_step: previousStep })
    setIsSubmitting(false)
    if (result?.error) {
      setStepError(result.error)
      return
    }
    setCurrentStep(previousStep)
  }

  const handleFinish = async () => {
    setStepError(null)
    setIsSubmitting(true)
    const canComplete = await persistCurrentStep()
    if (!canComplete) {
      setIsSubmitting(false)
      return
    }
    const result = await updateSpaceSetupState(spaceId, { completed: true })
    setIsSubmitting(false)
    if (result?.error) {
      setStepError(result.error)
      return
    }
    onCompleted()
    if (createdWorkspace) {
      router.push(workspaceHomeHref(createdWorkspace))
    }
  }

  const handleDocumentUploaded = (document: SpaceDocumentItem) => {
    onDocumentUploaded(document)
    setLocalDocuments([document, ...localDocuments])
    setStepError(null)
  }

  const handleDocumentDeleted = async (itemId: string) => {
    setDeletingDocumentId(itemId)
    setStepError(null)

    const response = await fetch(`/api/spaces/${spaceId}/items/${itemId}`, { method: "DELETE" })
    const payload = await response.json()

    if (!response.ok) {
      setStepError(payload.error || t("space.wizard.errors.deleteDocument"))
      setDeletingDocumentId(null)
      return
    }

    setLocalDocuments(localDocuments.filter((doc) => doc.id !== itemId))
    setDeletingDocumentId(null)
  }

  const handleCreateWorkspace = async () => {
    if (!workspaceName || workspaceName.trim().length === 0) {
      setWorkspaceError(t("space.wizard.errors.workspaceName"))
      return
    }

    setWorkspaceError(null)
    setWorkspaceIsCreating(true)

    const result = await createWorkspace(spaceId, workspaceName.trim(), undefined, "environmental_programme")
    setWorkspaceIsCreating(false)

    if (result?.error) {
      setWorkspaceError(result.error)
      return
    }

    if (result?.data) {
      onWorkspaceCreated(result.data)
      setCreatedWorkspace({
        id: result.data.id,
        name: result.data.name,
        kind: result.data.kind ?? "environmental_programme",
        metadata: result.data.metadata as Record<string, unknown> | null,
      })
    }
  }

  const jumpToStep = async (targetStep: number) => {
    if (targetStep === currentStep || targetStep < 0 || targetStep >= steps.length) {
      return
    }

    setStepError(null)

    if (targetStep > currentStep) {
      setIsSubmitting(true)
      const canAdvance = await persistCurrentStep()
      if (!canAdvance) {
        setIsSubmitting(false)
        return
      }
    } else {
      setIsSubmitting(true)
    }

    const result = await updateSpaceSetupState(spaceId, { current_step: targetStep })
    setIsSubmitting(false)
    if (result?.error) {
      setStepError(result.error)
      return
    }

    setCurrentStep(targetStep)
  }

  const renderStepContent = () => {
    const stepKey = currentStepKey
    switch (stepKey) {
      case "welcome":
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
              <Sparkles className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">{t("space.wizard.welcome.highlightTitle")}</p>
                <p className="text-muted-foreground">{t("space.wizard.welcome.highlightDescription")}</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <h4 className="text-sm font-semibold text-foreground">{t("space.wizard.welcome.coverTitle")}</h4>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {welcomeCoverItems.map((item) => (
                    <li key={item.title}>
                      <span className="font-semibold text-foreground">{item.title}</span> {item.description}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h4 className="text-sm font-semibold text-foreground">{t("space.wizard.welcome.benefitsTitle")}</h4>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {welcomeBenefitItems.map((item) => (
                    <li key={item.title}>
                      <span className="font-semibold text-foreground">{item.title}</span> {item.description}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )
      case "basics":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-foreground">{t("space.wizard.basics.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("space.wizard.basics.description")}</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="wizard-space-scope">{t("space.wizard.basics.scopeLabel")}</Label>
                <Select value={spaceTypeValue} onValueChange={setSpaceTypeValue}>
                  <SelectTrigger id="wizard-space-scope">
                    <SelectValue placeholder={t("space.wizard.basics.scopePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="national">{t("space.wizard.basics.scopeOptions.national")}</SelectItem>
                    <SelectItem value="regional">{t("space.wizard.basics.scopeOptions.regional")}</SelectItem>
                    <SelectItem value="municipal">{t("space.wizard.basics.scopeOptions.municipal")}</SelectItem>
                    <SelectItem value="party">{t("space.wizard.basics.scopeOptions.party")}</SelectItem>
                    <SelectItem value="other">{t("space.wizard.basics.scopeOptions.other")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("space.wizard.basics.scopeHelp")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-visibility">{t("space.wizard.basics.visibilityLabel")}</Label>
                <Select value={visibilityValue} onValueChange={setVisibilityValue}>
                  <SelectTrigger id="wizard-visibility">
                    <SelectValue placeholder={t("space.wizard.basics.visibilityPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">{t("space.wizard.basics.visibilityOptions.public")}</SelectItem>
                    <SelectItem value="internal">{t("space.wizard.basics.visibilityOptions.internal")}</SelectItem>
                    <SelectItem value="confidential">{t("space.wizard.basics.visibilityOptions.confidential")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("space.wizard.basics.visibilityHelp")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-jurisdiction">{t("space.wizard.basics.jurisdictionLabel")}</Label>
                <div className="w-fit">
                  <Input
                    id="wizard-jurisdiction"
                    value={jurisdictionLabel}
                    onChange={(event) => setJurisdictionLabel(event.target.value)}
                    placeholder={t("space.wizard.basics.jurisdictionPlaceholder")}
                    className="w-[300px]"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("space.wizard.basics.jurisdictionHelp")}</p>
              </div>
            </div>
          </div>
        )
      case "scope":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-foreground">{t("space.wizard.scopeStep.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("space.wizard.scopeStep.description")}</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-summary">{t("space.wizard.scopeStep.missionLabel")}</Label>
                <div className="relative">
                  <Textarea
                    id="wizard-summary"
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    placeholder={t("space.wizard.scopeStep.missionPlaceholder")}
                    rows={3}
                    className={cn("pb-10")}
                    onFocus={() => setFocusedField("summary")}
                    onBlur={(event) => {
                      setFocusedField((current) => (current === "summary" ? null : current))
                      setSummary(event.target.value)
                    }}
                  />
                  {(focusedField === "summary" || (enhancingField === "summary" && isEnhancing)) && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-2">
                      {enhancementCompleted.summary && originalSummary !== null && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUndo("summary")}
                                onMouseDown={(e) => e.preventDefault()}
                                className="h-8 w-8 p-0 text-muted-foreground/70 hover:text-muted-foreground hover:bg-transparent"
                              >
                                <RotateCcw className="h-4 w-4" />
                                <span className="sr-only">{t("space.wizard.scopeStep.missionUndo")}</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("space.wizard.scopeStep.missionUndo")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEnhance("summary")}
                              onMouseDown={(e) => e.preventDefault()}
                              disabled={isEnhancing || !summary || summary.trim().length === 0}
                              className="h-8 w-8 p-0 hover:bg-transparent group"
                            >
                              {isEnhancing && enhancingField === "summary" ? (
                                <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                              ) : (
                                <Wand2 className="h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-600" />
                              )}
                              <span className="sr-only">{t("space.wizard.scopeStep.missionEnhance")}</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t("space.wizard.scopeStep.missionEnhanceHelp")}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-description">{t("space.wizard.scopeStep.descriptionLabel")}</Label>
                <div className="relative">
                  <Textarea
                    id="wizard-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t("space.wizard.scopeStep.descriptionPlaceholder")}
                    rows={8}
                    className={cn("pb-10")}
                    onFocus={() => setFocusedField("description")}
                    onBlur={(event) => {
                      setFocusedField((current) => (current === "description" ? null : current))
                      setDescription(event.target.value)
                    }}
                  />
                  {(focusedField === "description" || (enhancingField === "description" && isEnhancing)) && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-2">
                      {enhancementCompleted.description && originalDescription !== null && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUndo("description")}
                                onMouseDown={(e) => e.preventDefault()}
                                className="h-8 w-8 p-0 text-muted-foreground/70 hover:text-muted-foreground hover:bg-transparent"
                              >
                                <RotateCcw className="h-4 w-4" />
                                <span className="sr-only">{t("space.wizard.scopeStep.descriptionUndo")}</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("space.wizard.scopeStep.descriptionUndo")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEnhance("description")}
                              onMouseDown={(e) => e.preventDefault()}
                              disabled={isEnhancing || !description || description.trim().length === 0}
                              className="h-8 w-8 p-0 hover:bg-transparent group"
                            >
                              {isEnhancing && enhancingField === "description" ? (
                                <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                              ) : (
                                <Wand2 className="h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-600" />
                              )}
                              <span className="sr-only">{t("space.wizard.scopeStep.descriptionEnhance")}</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t("space.wizard.scopeStep.descriptionEnhanceHelp")}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("space.wizard.scopeStep.descriptionHelp")}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-timeframe">{t("space.overview.edit.timeframeLabel")}</Label>
                <Input
                  id="wizard-timeframe"
                  value={timeframe}
                  onChange={(event) =>
                    handleTimeframeChange(
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
            </div>
          </div>
        )
      case "overheid": {
        const missingOverheidContextMessage = !trimmedJurisdiction
          ? t("space.wizard.overheid.missingJurisdiction")
          : scopeContextSegments.length === 0
            ? t("space.wizard.overheid.missingScope")
            : null

        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-semibold text-foreground">{t("space.wizard.overheid.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("space.wizard.overheid.description")}</p>
            </div>
            <div className="space-y-4 rounded-lg border border-dashed bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-purple-500" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{t("space.wizard.overheid.aiTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("space.wizard.overheid.aiDescription")}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {trimmedJurisdiction && <Badge variant="secondary">{trimmedJurisdiction}</Badge>}
                {scopeContextSegments.length > 0 && (
                  <span>
                    {t("space.wizard.overheid.scopeInputs", undefined, { count: scopeContextSegments.length })}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  onClick={() => setOverheidDialogOpen(true)}
                  disabled={!canLaunchOverheidSearch}
                  className="w-fit gap-2 bg-black text-white hover:bg-black/90"
                >
                  <Search className="h-4 w-4" />
                  {t("space.wizard.overheid.searchButton")}
                </Button>
                {missingOverheidContextMessage ? (
                  <p className="text-xs text-muted-foreground">{missingOverheidContextMessage}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("space.wizard.overheid.reopenTip")}</p>
                )}
              </div>
            </div>
          </div>
        )
      }
      case "documents": {
        const documentPluralSuffix =
          localDocuments.length === 1 ? "" : t("space.wizard.documents.stats.pluralSuffix")
        const documentCountText =
          localDocuments.length > 0
            ? t("space.wizard.documents.stats.count", undefined, {
                count: localDocuments.length,
                suffix: documentPluralSuffix,
              })
            : t("space.wizard.documents.stats.none")

        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-semibold text-foreground">{t("space.wizard.documents.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("space.wizard.documents.description")}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4">
              <div>
                <p className="text-sm font-medium text-foreground">{documentCountText}</p>
                <p className="text-xs text-muted-foreground">{t("space.wizard.documents.addMore")}</p>
              </div>
              <SpaceUploadDocumentDialog
                spaceId={spaceId}
                onUploaded={handleDocumentUploaded}
                trigger={
                  <Button className="bg-black text-white hover:bg-black/90 gap-2">
                    <Upload className="h-4 w-4" />
                    {t("space.documents.panel.emptyUploadTrigger")}
                  </Button>
                }
              />
            </div>
            {localDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8 text-muted-foreground/70" />
                <p>{t("space.wizard.documents.emptyCallout")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("space.wizard.documents.recentlyAdded")}
                </p>
                <div className="space-y-2">
                  {localDocuments.slice(0, 3).map((doc) => {
                    const title = doc.payload?.title || doc.payload?.file_name || t("space.documents.panel.untitled")
                    return (
                      <div key={doc.id} className="flex items-center justify-between rounded-md border border-border/80 px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">{title}</span>
                          <span className="text-xs text-muted-foreground">
                            {t("space.wizard.documents.addedOn", undefined, {
                              date: new Date(doc.created_at).toLocaleDateString(),
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.classification && (
                            <Badge variant="outline">
                              {t(
                                `workspace.common.classification.${doc.classification}`,
                                doc.classification,
                              )}
                            </Badge>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDocumentDeleted(doc.id)}
                            disabled={deletingDocumentId === doc.id}
                            className="h-8 w-8 hover:bg-red-100 group"
                          >
                            {deletingDocumentId === doc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4 group-hover:text-red-500" />
                            )}
                            <span className="sr-only">{t("space.wizard.documents.remove")}</span>
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  {localDocuments.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      {t("space.wizard.documents.moreCount", undefined, {
                        count: localDocuments.length - 3,
                      })}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      }
      case "workspace": {
        const workspacePluralSuffix = workspaces.length === 1 ? "" : t("space.wizard.workspace.stats.pluralSuffix")
        const workspaceStatsLabel = t("space.wizard.workspace.stats.label", undefined, {
          count: workspaces.length,
          suffix: workspacePluralSuffix,
        })

        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-semibold text-foreground">{t("space.wizard.workspace.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("space.wizard.workspace.description")}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="wizard-workspace-name">{t("space.wizard.workspace.nameLabel")}</Label>
                  <Input
                    id="wizard-workspace-name"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder={t("space.wizard.workspace.namePlaceholder")}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("space.workspaces.dialog.kindProgrammeHelp")}</p>
                <Button onClick={handleCreateWorkspace} disabled={workspaceIsCreating} className="w-fit">
                  {workspaceIsCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("space.wizard.workspace.creating")}
                    </>
                  ) : (
                    t("space.wizard.workspace.create")
                  )}
                </Button>
                {workspaceError && <p className="text-sm text-destructive">{workspaceError}</p>}
                {createdWorkspace && (
                  <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>{t("space.wizard.workspace.success", undefined, { name: createdWorkspace.name })}</span>
                  </div>
                )}
              </div>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{workspaceStatsLabel}</Badge>
              <span>{t("space.wizard.workspace.stats.addMore")}</span>
            </div>
          </div>
        )
      }
      default:
        return null
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-4xl p-0" showCloseButton={false}>
        <DialogHeader className="space-y-4 border-b border-border px-6 pt-6 pb-4">
          <div className="flex flex-col items-start gap-1">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-semibold">
                {t("space.wizard.header.title", undefined, { space: spaceName })}
              </DialogTitle>
              <DialogDescription>
                {t("space.wizard.header.progress", undefined, {
                  current: currentStep + 1,
                  total: steps.length,
                  description: steps[currentStep]?.description ?? "",
                })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 px-6 py-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {steps.map((step, index) => {
              // Don't mark any step as active when on welcome step (index 0)
              // Only mark steps as active if they're the current step AND not the welcome step
              const isActive = currentStep !== 0 && index === currentStep
              const isComplete = index < currentStep
              const showChevron = index < steps.length - 1

              const handleStepClick = () => {
                if (index === currentStep) return
                void jumpToStep(index)
              }

              // Explicitly prevent welcome step from appearing active
              const isWelcomeStep = index === 0
              const shouldAppearActive = isActive && !isWelcomeStep

              return (
                <div key={step.key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleStepClick}
                    className={cn(
                      "flex items-center gap-1 border-0 bg-transparent p-0 focus:outline-none focus:ring-0 transition-colors",
                      shouldAppearActive ? "cursor-default" : "cursor-pointer",
                      isSubmitting && !shouldAppearActive ? "pointer-events-none opacity-60" : "",
                    )}
                    aria-current={shouldAppearActive ? "step" : undefined}
                  >
                    {isComplete && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    <span
                      className={cn(
                        "uppercase tracking-wide",
                        isComplete || shouldAppearActive ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {step.title}
                    </span>
                  </button>
                  {showChevron && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                </div>
              )
            })}
          </div>

          <Separator className="bg-border" />

          {renderStepContent()}

          {stepError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {stepError}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border bg-background px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkipWizard}
            disabled={isSubmitting}
            className="justify-start px-0 text-muted-foreground hover:text-foreground sm:px-3"
          >
            {t("space.wizard.actions.skip")}
          </Button>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
            {!isFirstStep && (
              <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                {t("space.wizard.actions.back")}
              </Button>
            )}
            {isLastStep ? (
              <Button onClick={handleFinish} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("space.wizard.actions.finishing")}
                  </>
                ) : (
                  <>
                    {t("space.wizard.actions.finish")}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("space.wizard.actions.saving")}
                  </>
                ) : (
                  <>
                    {t("space.wizard.actions.continue")}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        </DialogContent>
      </Dialog>
      <AddOverheidDocumentsDialog
        spaceId={spaceId}
        workspaceLocation={trimmedJurisdiction || undefined}
        workspaceContext={overheidContext || undefined}
        open={overheidDialogOpen}
        onOpenChange={setOverheidDialogOpen}
        onSuccess={() => setStepError(null)}
        onDocumentsAdded={(items) => {
          if (Array.isArray(items) && items.length > 0) {
            const normalized = items.filter(Boolean) as SpaceDocumentItem[]
            if (normalized.length > 0) {
              normalized.forEach((doc) => {
                onDocumentUploaded(doc)
              })
              setLocalDocuments((current) => [...normalized, ...current])
              setStepError(null)
            }
          }
        }}
      />
    </>
  )
}

