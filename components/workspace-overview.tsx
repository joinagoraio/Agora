"use client"

import { useEffect, useState } from "react"

import { PencilLine, Save, X, Loader2, Wand2, MoreVertical, Settings, RotateCcw, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { enhanceContextText, enhanceWorkspaceText, updateWorkspace } from "@/lib/actions/workspace"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { useI18n } from "@/lib/i18n/use-i18n"
import { GuidanceCoach } from "@/components/guidance-coach"

type ParentSpace = {
  id: string
  name: string
  space_type?: string | null
}

interface WorkspaceOverviewProps {
  workspaceId: string
  initialName: string
  initialDescription?: string | null
  initialSummary?: string | null
  initialContext?: string | null
  initialLocation?: string | null
  parentSpaces: ParentSpace[]
  canManage?: boolean
  canAccessSettings?: boolean
  showProgrammeWorkbench?: boolean
}

export function WorkspaceOverview({
  workspaceId,
  initialName,
  initialDescription,
  initialSummary,
  initialContext,
  initialLocation,
  parentSpaces,
  canManage = true,
  canAccessSettings = true,
  showProgrammeWorkbench = false,
}: WorkspaceOverviewProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [name, setName] = useState(initialName)
  const [summary, setSummary] = useState(initialSummary ?? "")
  const [description, setDescription] = useState(initialDescription ?? "")
  const [context, setContext] = useState(initialContext ?? "")
  const [location, setLocation] = useState(initialLocation ?? "")

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [enhancingField, setEnhancingField] = useState<"summary" | "description" | "context" | null>(null)
  const [activeField, setActiveField] = useState<"summary" | "description" | "context" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summaryPrevious, setSummaryPrevious] = useState<string | null>(null)
  const [descriptionPrevious, setDescriptionPrevious] = useState<string | null>(null)
  const [contextPrevious, setContextPrevious] = useState<string | null>(null)

  const [draftName, setDraftName] = useState(initialName)
  const [draftSummary, setDraftSummary] = useState(initialSummary ?? "")
  const [draftDescription, setDraftDescription] = useState(initialDescription ?? "")
  const [draftContext, setDraftContext] = useState(initialContext ?? "")
  const [draftLocation, setDraftLocation] = useState(initialLocation ?? "")
  const [guidanceOpen, setGuidanceOpen] = useState(true)

  useEffect(() => {
    if (isEditing) return

    setName(initialName)
    setSummary(initialSummary ?? "")
    setDescription(initialDescription ?? "")
    setContext(initialContext ?? "")
    setLocation(initialLocation ?? "")

    setDraftName(initialName)
    setDraftSummary(initialSummary ?? "")
    setDraftDescription(initialDescription ?? "")
    setDraftContext(initialContext ?? "")
    setDraftLocation(initialLocation ?? "")
  }, [initialName, initialSummary, initialDescription, initialContext, initialLocation, isEditing])

  const handleStartEditing = () => {
    setDraftName(name)
    setDraftSummary(summary)
    setDraftDescription(description)
    setDraftContext(context)
    setDraftLocation(location)
    setError(null)
    setActiveField(null)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setDraftName(name)
    setDraftSummary(summary)
    setDraftDescription(description)
    setDraftContext(context)
    setDraftLocation(location)
    setError(null)
    setActiveField(null)
    setSummaryPrevious(null)
    setDescriptionPrevious(null)
    setContextPrevious(null)
    setIsEditing(false)
  }

  const handleEnhance = async (field: "summary" | "description" | "context") => {
    const targetText =
      field === "summary" ? draftSummary : field === "description" ? draftDescription : draftContext
    if (!targetText || targetText.trim().length === 0) {
      return
    }

    setError(null)
    setEnhancingField(field)

    setIsEnhancing(true)
    try {
      if (field === "context") {
        const result = await enhanceContextText(targetText.trim())
        if (result.error) {
          setError(result.error)
          return
        }
        if (result.enhanced) {
          setContextPrevious(draftContext)
          setDraftContext(result.enhanced)
        }
      } else {
        const result = await enhanceWorkspaceText(targetText.trim(), {
          field,
          workspaceName: draftName,
          summary: field === "description" ? draftSummary : undefined,
        })
        if (result.error) {
          setError(result.error)
          return
        }
        if (result.enhanced) {
          if (field === "summary") {
            setSummaryPrevious(draftSummary)
            setDraftSummary(result.enhanced)
          } else {
            setDescriptionPrevious(draftDescription)
            setDraftDescription(result.enhanced)
          }
        }
      }
    } finally {
      setIsEnhancing(false)
      setEnhancingField(null)
    }
  }

  const handleUndoEnhance = (field: "summary" | "description" | "context") => {
    if (field === "summary" && summaryPrevious !== null) {
      setDraftSummary(summaryPrevious)
      setSummaryPrevious(null)
    }
    if (field === "description" && descriptionPrevious !== null) {
      setDraftDescription(descriptionPrevious)
      setDescriptionPrevious(null)
    }
    if (field === "context" && contextPrevious !== null) {
      setDraftContext(contextPrevious)
      setContextPrevious(null)
    }
  }

  const handleSave = async () => {
    const trimmedName = draftName.trim()
    if (trimmedName.length === 0) {
      setError("Workspace title is required.")
      return
    }

    setIsSaving(true)
    setError(null)

    const normalizedSummary = draftSummary.trim().length > 0 ? draftSummary.trim() : null
    const normalizedDescription = draftDescription.trim().length > 0 ? draftDescription.trim() : null
    const normalizedContext = draftContext.trim().length > 0 ? draftContext.trim() : null
    const normalizedLocation = draftLocation.trim().length > 0 ? draftLocation.trim() : null

    const result = await updateWorkspace(
      workspaceId,
      trimmedName,
      normalizedDescription,
      normalizedContext,
      normalizedLocation,
      normalizedSummary,
    )

    if (result.error) {
      setError(result.error)
      setIsSaving(false)
      return
    }

    setName(trimmedName)
    setSummary(normalizedSummary ?? "")
    setDescription(normalizedDescription ?? "")
    setContext(normalizedContext ?? "")
    setLocation(normalizedLocation ?? "")
    setIsSaving(false)
    setActiveField(null)
    setSummaryPrevious(null)
    setDescriptionPrevious(null)
    setContextPrevious(null)
    setIsEditing(false)
    
    // Notify chat interface of workspace context update
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("workspaceContextUpdated", {
          detail: { workspaceId, type: "workspace", action: "updated" },
        }),
      )
    }
    
    router.refresh()
  }

  return (
    <section
      className="guidance-content-shift space-y-4"
      data-open={guidanceOpen ? "true" : undefined}
    >
      <GuidanceCoach
        surface={showProgrammeWorkbench ? "programme" : "research"}
        placeName={name}
        workspaceId={workspaceId}
        spaceId={parentSpaces[0]?.id}
        job="author"
        guidanceMode="guided"
        onOpenChange={setGuidanceOpen}
      />
      {isEditing ? (
        <div className="space-y-4 rounded-lg border border-border bg-card/50 p-4 shadow-lg">
          <h2 className="text-lg font-semibold text-foreground">
            {t("common.labels.editing")}{" "}
            <span className="text-primary">{name}</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="workspace-title">{t("workspace.overview.edit.titleLabel")}</Label>
              <Input
                id="workspace-title"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder={t("workspace.overview.edit.titlePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-location">{t("workspace.overview.edit.jurisdictionLabel")}</Label>
              <Input
                id="workspace-location"
                value={draftLocation}
                onChange={(event) => setDraftLocation(event.target.value)}
                placeholder={t("workspace.overview.edit.jurisdictionPlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-summary">{t("workspace.overview.edit.summaryLabel")}</Label>
            <div className="relative">
              <Textarea
                id="workspace-summary"
                value={draftSummary}
                onChange={(event) => setDraftSummary(event.target.value)}
                onFocus={() => setActiveField("summary")}
                onBlur={() => setActiveField((current) => (current === "summary" ? null : current))}
                placeholder={t("workspace.overview.edit.summaryPlaceholder")}
                rows={4}
                className="pb-10"
              />
              {activeField === "summary" && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  {summaryPrevious !== null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleUndoEnhance("summary")}
                      className="h-8 w-8 p-0 bg-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-transparent"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span className="sr-only">{t("workspace.overview.edit.summaryUndo")}</span>
                    </Button>
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
                          disabled={isEnhancing || !draftSummary || draftSummary.trim().length === 0}
                          className="h-8 w-8 p-0 hover:bg-transparent group"
                        >
                          {isEnhancing && enhancingField === "summary" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                          ) : (
                            <Wand2 className="h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-600" />
                          )}
                          <span className="sr-only">{t("workspace.overview.edit.summaryEnhance")}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" align="center">
                        {t("workspace.overview.edit.summaryEnhanceHelp")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-description">{t("workspace.overview.edit.descriptionLabel")}</Label>
            <div className="relative">
              <Textarea
                id="workspace-description"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                onFocus={() => setActiveField("description")}
                onBlur={() => setActiveField((current) => (current === "description" ? null : current))}
                placeholder={t("workspace.overview.edit.descriptionPlaceholder")}
                rows={6}
                className="pb-10"
              />
              {activeField === "description" && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  {descriptionPrevious !== null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleUndoEnhance("description")}
                      className="h-8 w-8 p-0 bg-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-transparent"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span className="sr-only">{t("workspace.overview.edit.descriptionUndo")}</span>
                    </Button>
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
                          disabled={isEnhancing || !draftDescription || draftDescription.trim().length === 0}
                          className="h-8 w-8 p-0 hover:bg-transparent group"
                        >
                          {isEnhancing && enhancingField === "description" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                          ) : (
                            <Wand2 className="h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-600" />
                          )}
                          <span className="sr-only">{t("workspace.overview.edit.descriptionEnhance")}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" align="center">
                        {t("workspace.overview.edit.descriptionEnhanceHelp")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-context">{t("workspace.overview.edit.contextLabel")}</Label>
            <div className="relative">
              <Textarea
                id="workspace-context"
                value={draftContext}
                onChange={(event) => setDraftContext(event.target.value)}
                onFocus={() => setActiveField("context")}
                onBlur={() => setActiveField((current) => (current === "context" ? null : current))}
                placeholder={t("workspace.overview.edit.contextPlaceholder")}
                rows={8}
                className="pb-10"
              />
              {activeField === "context" && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  {contextPrevious !== null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleUndoEnhance("context")}
                      className="h-8 w-8 p-0 bg-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-transparent"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span className="sr-only">{t("workspace.overview.edit.contextUndo")}</span>
                    </Button>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleEnhance("context")}
                          disabled={isEnhancing || !draftContext || draftContext.trim().length === 0}
                          className="h-8 w-8 p-0 hover:bg-transparent group"
                        >
                          {isEnhancing && enhancingField === "context" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                          ) : (
                            <Wand2 className="h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-600" />
                          )}
                          <span className="sr-only">{t("workspace.overview.edit.contextEnhance")}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" align="center">
                        {t("workspace.overview.edit.contextEnhanceHelp")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("workspace.overview.edit.contextHelper")}</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={isSaving}>
              <X className="mr-2 h-4 w-4" />
              {t("common.actions.cancel")}
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("workspace.overview.edit.saving")}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t("common.actions.save")}
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground">{name}</h1>
              <Badge variant="outline">
                {showProgrammeWorkbench
                  ? t("space.workspaces.kindProgramme")
                  : t("space.workspaces.kindResearch")}
              </Badge>
              {location && (
                <span className="text-sm font-medium text-muted-foreground">{location}</span>
              )}
            </div>
            {(canManage || showProgrammeWorkbench) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={t("workspace.overview.menu.more")}
                  >
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">{t("workspace.overview.menu.more")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canManage && (
                    <DropdownMenuItem onClick={handleStartEditing}>
                      <PencilLine className="h-4 w-4" />
                      {t("workspace.overview.menu.edit")}
                    </DropdownMenuItem>
                  )}
                  {showProgrammeWorkbench && (
                    <DropdownMenuItem asChild>
                      <Link href={`/workspaces/${workspaceId}/programme`}>
                        <FileText className="h-4 w-4" />
                        {t("workspace.overview.menu.programme")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {canAccessSettings && (
                    <DropdownMenuItem asChild>
                      <Link href={`/workspaces/${workspaceId}/settings`}>
                        <Settings className="h-4 w-4" />
                        {t("workspace.overview.menu.settings")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {showProgrammeWorkbench
                ? t("workspace.overview.kindProgrammeHint")
                : t("workspace.overview.kindResearchHint")}
            </p>
            <p className="whitespace-pre-line text-sm font-semibold text-foreground">
              {summary.trim().length > 0 ? summary : t("space.overview.summaryEmpty")}
            </p>
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {description.trim().length > 0 ? description : t("space.overview.descriptionEmpty")}
            </p>
          </div>
        </div>
      )}

      {parentSpaces.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {parentSpaces.map((parent) => (
            <Badge key={parent.id} variant="outline">
              {parent.name}
              {parent.space_type ? ` · ${capitalize(parent.space_type)}` : ""}
            </Badge>
          ))}
        </div>
      )}
    </section>
  )
}

function capitalize(value?: string | null) {
  if (!value) {
    return ""
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

