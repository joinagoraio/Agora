"use client"

import { useEffect, useMemo, useState, useTransition } from "react"

import { updateSpace, updateSpaceScope, enhanceScopeText, updateSpaceSetupState } from "@/lib/actions/space"
import { createWorkspace } from "@/lib/actions/workspace"
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
import { CheckCircle2, ChevronLeft, ChevronRight, FileText, Loader2, RotateCcw, Sparkles, Upload, Wand2, X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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

const steps = [
  {
    key: "welcome",
    title: "Welcome",
    description: "See what you can do with a space",
  },
  {
    key: "basics",
    title: "Space basics",
    description: "Set how Agora labels and shares this space",
  },
  {
    key: "scope",
    title: "Scope",
    description: "Write the summary everyone will inherit",
  },
  {
    key: "documents",
    title: "Documents",
    description: "Attach the references that define this scope",
  },
  {
    key: "workspace",
    title: "Workspace",
    description: "Spin up your first workspace",
  },
] as const

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
  const normalizedInitialWizardState = useMemo<SetupWizardState>(() => {
    if (!initialWizardState) return {}
    return {
      current_step: initialWizardState.current_step ?? 0,
      completed: initialWizardState.completed ?? false,
      dismissed: initialWizardState.dismissed ?? false,
    }
  }, [initialWizardState])

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

  const [workspaceName, setWorkspaceName] = useState(`${spaceName} workspace`)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [createdWorkspace, setCreatedWorkspace] = useState<{ id: string; name: string } | null>(null)
  const [workspaceIsCreating, setWorkspaceIsCreating] = useState(false)

  const [stepError, setStepError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null)
  const [localDocuments, setLocalDocuments] = useState<SpaceDocumentItem[]>(documents)

  // Update local documents when prop changes
  useEffect(() => {
    setLocalDocuments(documents)
  }, [documents])

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
        field === "summary" ? "Add a mission statement before enhancing with AI." : "Add a description before enhancing with AI.",
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
      const result = await enhanceScopeText(targetText)
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
      setTimeframeError("Enter a 4-digit year or a range like 2024 – 2027.")
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
      setStepError(payload.error || "Failed to delete document.")
      setDeletingDocumentId(null)
      return
    }

    setLocalDocuments(localDocuments.filter((doc) => doc.id !== itemId))
    setDeletingDocumentId(null)
  }

  const handleCreateWorkspace = async () => {
    if (!workspaceName || workspaceName.trim().length === 0) {
      setWorkspaceError("Enter a workspace name.")
      return
    }

    setWorkspaceError(null)
    setWorkspaceIsCreating(true)

    const result = await createWorkspace(spaceId, workspaceName.trim())
    setWorkspaceIsCreating(false)

    if (result?.error) {
      setWorkspaceError(result.error)
      return
    }

    if (result?.data) {
      onWorkspaceCreated(result.data)
      setCreatedWorkspace({ id: result.data.id, name: result.data.name })
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
    const stepKey = steps[currentStep]?.key
    switch (stepKey) {
      case "welcome":
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
              <Sparkles className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Spaces set the mandate for every workspace underneath.</p>
                <p className="text-muted-foreground">
                  We&apos;ll capture the essentials so your team and AI assistant share the same context from the start.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <h4 className="text-sm font-semibold text-foreground">What we&apos;ll cover</h4>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>• Label and visibility of the space</li>
                  <li>• Mission statement and description</li>
                  <li>• Key documents everyone should see</li>
                  <li>• Your first workspace to start collaborating</li>
                </ul>
              </div>
              <div className="rounded-lg border border-border p-4">
                <h4 className="text-sm font-semibold text-foreground">What you&apos;ll get</h4>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>• Consistent context for AI assistance</li>
                  <li>• Shared document library for the space</li>
                  <li>• Workspace templates ready to launch</li>
                  <li>• A repeatable onboarding checklist</li>
                </ul>
              </div>
            </div>
          </div>
        )
      case "basics":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-foreground">Set the basics for this space</h3>
              <p className="text-sm text-muted-foreground">
                Choose the scope, visibility, and jurisdiction of your space.
              </p>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
              <Label htmlFor="wizard-space-scope">Scope</Label>
              <Select value={spaceTypeValue} onValueChange={setSpaceTypeValue}>
                <SelectTrigger id="wizard-space-scope">
                  <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="national">National</SelectItem>
                    <SelectItem value="regional">Regional</SelectItem>
                    <SelectItem value="municipal">Municipal</SelectItem>
                    <SelectItem value="party">Party</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">The administrative level or type of this space.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-visibility">Visibility</Label>
                <Select value={visibilityValue} onValueChange={setVisibilityValue}>
                  <SelectTrigger id="wizard-visibility">
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public – discoverable by all tenants</SelectItem>
                    <SelectItem value="internal">Internal – visible to your organisation</SelectItem>
                    <SelectItem value="confidential">Confidential – invite-only</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Control who can discover and access this space.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-jurisdiction">Jurisdiction (optional)</Label>
                <div className="w-fit">
                  <Input
                    id="wizard-jurisdiction"
                    value={jurisdictionLabel}
                    onChange={(event) => setJurisdictionLabel(event.target.value)}
                    placeholder="e.g., City of Amsterdam"
                    className="w-[300px]"
                  />
                </div>
                <p className="text-xs text-muted-foreground">The geographic or legal jurisdiction this space operates within.</p>
              </div>
            </div>
          </div>
        )
      case "scope":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-foreground">Summarise the mandate</h3>
              <p className="text-sm text-muted-foreground">
                This mandate is inherited by every workspace in the space and feeds the AI assistant automatically.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-summary">Mission Statement</Label>
                <div className="relative">
                  <Textarea
                    id="wizard-summary"
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    placeholder="High-level statement to align everyone on the mission."
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
                                <span className="sr-only">Undo enhancement</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Undo enhancement</p>
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
                              <span className="sr-only">Enhance mission statement with AI</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Enhance with AI</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-description">Description</Label>
                <div className="relative">
                  <Textarea
                    id="wizard-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Describe the policy remit, stakeholders, and success criteria driving this programme."
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
                                <span className="sr-only">Undo enhancement</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Undo enhancement</p>
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
                              <span className="sr-only">Enhance description with AI</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Enhance with AI</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Keep it concise but rich enough for colleagues and the assistant to act accurately.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-timeframe">Timeframe</Label>
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
                  placeholder="e.g., 2024 – 2027"
                  inputMode="numeric"
                  pattern="\d{4}(?:\s?–\s?\d{4})?"
                />
                {timeframeError && <p className="text-xs text-destructive">{timeframeError}</p>}
              </div>
            </div>
          </div>
        )
      case "documents":
        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-semibold text-foreground">Add supporting documents</h3>
              <p className="text-sm text-muted-foreground">
                Upload policies, briefing notes, or supporting research. Public documents are inherited by every workspace.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {localDocuments.length > 0 ? `${localDocuments.length} document${localDocuments.length === 1 ? "" : "s"} uploaded` : "No documents yet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  You can add more later from the Documents section.
                </p>
              </div>
              <SpaceUploadDocumentDialog
                spaceId={spaceId}
                onUploaded={handleDocumentUploaded}
                trigger={
                  <Button className="bg-black text-white hover:bg-black/90 gap-2">
                    <Upload className="h-4 w-4" />
                    Upload document
                  </Button>
                }
              />
            </div>
            {localDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8 text-muted-foreground/70" />
                <p>add the policies or directives that define this scope.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recently added</p>
                <div className="space-y-2">
                  {localDocuments.slice(0, 3).map((doc) => {
                    const title = doc.payload?.title || doc.payload?.file_name || "Untitled document"
                    return (
                      <div key={doc.id} className="flex items-center justify-between rounded-md border border-border/80 px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">{title}</span>
                          <span className="text-xs text-muted-foreground">
                            Added {new Date(doc.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.classification && <Badge variant="outline">{doc.classification}</Badge>}
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
                            <span className="sr-only">Remove document</span>
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  {localDocuments.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{localDocuments.length - 3} more documents will appear in the panel below.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      case "workspace":
        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-semibold text-foreground">Create your first workspace</h3>
              <p className="text-sm text-muted-foreground">
                Workspaces inherit this scope and give your team a sandbox to chat, analyse documents, and launch tasks.
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="wizard-workspace-name">Workspace name</Label>
                  <Input
                    id="wizard-workspace-name"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="e.g., Climate Action Dossier"
                  />
                </div>
                <Button onClick={handleCreateWorkspace} disabled={workspaceIsCreating} className="w-fit">
                  {workspaceIsCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create workspace"
                  )}
                </Button>
                {workspaceError && <p className="text-sm text-destructive">{workspaceError}</p>}
                {createdWorkspace && (
                  <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>
                      Workspace <span className="font-medium">{createdWorkspace.name}</span> is ready. You can open it after finishing the setup.
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{workspaces.length} workspace{workspaces.length === 1 ? "" : "s"} in this space</Badge>
              <span>You can add more later from the Workspaces section.</span>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-4xl p-0" showCloseButton={false}>
        <DialogHeader className="space-y-4 border-b border-border px-6 pt-6 pb-4">
          <div className="flex flex-col items-start gap-1">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-semibold">Set up your {spaceName} space</DialogTitle>
              <DialogDescription>
                Step {currentStep + 1} of {steps.length} · {steps[currentStep]?.description}
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
            Skip setup
          </Button>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
            {!isFirstStep && (
              <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
            {isLastStep ? (
              <Button onClick={handleFinish} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Finishing…
                  </>
                ) : (
                  <>
                    Finish setup
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

