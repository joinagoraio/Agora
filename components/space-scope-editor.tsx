"use client"

import { useState, useTransition } from "react"

import { updateSpaceScope, enhanceScopeText, updateSpace } from "@/lib/actions/space"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { Wand2, Save, Loader2, RotateCcw } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type SpaceScope = {
  summary?: string | null
  description?: string | null
  timeframe?: string | null
}

interface SpaceScopeEditorProps {
  spaceId: string
  spaceName: string
  spaceType?: string | null
  visibility?: string | null
  jurisdiction?: Record<string, any> | null
  initialScope: SpaceScope
  onScopeUpdated?: (scope: SpaceScope) => void
  onSpaceDetailsChange?: (details: { spaceType: string; visibility: string }) => void
}

export function SpaceScopeEditor({
  spaceId,
  spaceName,
  spaceType,
  visibility,
  jurisdiction,
  initialScope,
  onScopeUpdated,
  onSpaceDetailsChange,
}: SpaceScopeEditorProps) {
  const [summary, setSummary] = useState(initialScope.summary ?? "")
  const [description, setDescription] = useState(initialScope.description ?? "")
  const [timeframe, setTimeframe] = useState(initialScope.timeframe ?? "")
  const [spaceTypeValue, setSpaceTypeValue] = useState(spaceType ?? "municipal")
  const [visibilityValue, setVisibilityValue] = useState(visibility ?? "internal")
  const [timeframeError, setTimeframeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()
  const [isEnhancing, startEnhancing] = useTransition()
  const [enhancingField, setEnhancingField] = useState<"summary" | "description" | null>(null)
  const [focusedField, setFocusedField] = useState<"summary" | "description" | null>(null)
  const [originalSummary, setOriginalSummary] = useState<string | null>(null)
  const [originalDescription, setOriginalDescription] = useState<string | null>(null)
  const [enhancementCompleted, setEnhancementCompleted] = useState<{ summary?: boolean; description?: boolean }>({})

  const handleSave = () => {
    setError(null)
    setSuccess(null)
    startSaving(async () => {
      const scopeResult = await updateSpaceScope(spaceId, {
        summary,
        description,
        timeframe,
      })

      if (scopeResult.error) {
        setError(scopeResult.error)
        return
      }

      const spaceResult = await updateSpace(spaceId, {
        space_type: spaceTypeValue,
        visibility: visibilityValue,
      })

      if (spaceResult?.error) {
        setError(spaceResult.error)
        return
      }

      setSuccess("Scope updated")
      onScopeUpdated?.({ summary, description, timeframe })
      onSpaceDetailsChange?.({ spaceType: spaceTypeValue, visibility: visibilityValue })
    })
  }

  const handleEnhance = (target: "summary" | "description") => {
    const targetText = target === "summary" ? summary : description

    if (!targetText || targetText.trim().length === 0) {
      return
    }

    setError(null)
    setSuccess(null)
    // Store original text before enhancement
    if (target === "summary") {
      setOriginalSummary(targetText)
    } else {
      setOriginalDescription(targetText)
    }
    setEnhancingField(target)
    startEnhancing(async () => {
      try {
        const result = await enhanceScopeText(targetText, {
          field: target,
          spaceName: target === "summary" ? spaceName : undefined,
          missionStatement: target === "description" ? summary : undefined,
        })

        if (result.error) {
          setError(result.error)
          // Clear original text if enhancement failed
          if (target === "summary") {
            setOriginalSummary(null)
          } else {
            setOriginalDescription(null)
          }
        } else if (result.enhanced) {
          if (target === "summary") {
            setSummary(result.enhanced)
            setEnhancementCompleted((prev) => ({ ...prev, summary: true }))
          } else {
            setDescription(result.enhanced)
            setEnhancementCompleted((prev) => ({ ...prev, description: true }))
          }
        }
      } finally {
        setEnhancingField(null)
      }
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

  const jurisdictionLabel =
    jurisdiction && Object.keys(jurisdiction).length > 0
      ? Object.values(jurisdiction).join(" • ")
      : undefined

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

    // Normalize stored value (en dash with spaces)
    const normalized = trimmed
      .replace("-", "–")
      .replace(/\s*–\s*/, " – ")
      .trim()

    setTimeframe(normalized)
    setTimeframeError(null)
    return true
  }

  const handleSaveClick = () => {
    if (!validateTimeframe()) {
      return
    }
    handleSave()
  }

  return (
    <section className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="space-scope">Scope</Label>
          <Select value={spaceTypeValue} onValueChange={setSpaceTypeValue}>
            <SelectTrigger id="space-scope">
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
        </div>

        <div className="space-y-2">
          <Label htmlFor="space-visibility">Visibility</Label>
          <Select value={visibilityValue} onValueChange={setVisibilityValue}>
            <SelectTrigger id="space-visibility">
              <SelectValue placeholder="Select visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="confidential">Confidential</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="space-summary">Mission Statement</Label>
          <div className="relative">
            <Textarea
              id="space-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="High-level mission statement that appears at the top of the space."
              rows={3}
              className="pb-10"
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
                          className="h-8 w-8 p-0 bg-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-transparent"
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
          <Label htmlFor="space-description">Description</Label>
          <div className="relative">
            <Textarea
              id="space-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the policy mandate, stakeholders, datasets, or directives that define this scope."
              rows={8}
              className="pb-10"
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
                          className="h-8 w-8 p-0 bg-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-transparent"
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
            This description is inherited by every workspace in the space and is used as context for the assistant.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="space-timeframe">Timeframe</Label>
          <Input
            id="space-timeframe"
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

      {(error || success) && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
          }`}
        >
          {error || success}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSaveClick} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save scope
            </>
          )}
        </Button>
      </div>

      <Separator className="bg-border" />
    </section>
  )
}
