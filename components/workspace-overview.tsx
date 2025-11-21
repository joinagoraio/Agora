"use client"

import { useState } from "react"

import { PencilLine, Save, X, Loader2, Wand2, MoreVertical, Settings, RotateCcw } from "lucide-react"
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
import { enhanceContextText, updateWorkspace } from "@/lib/actions/workspace"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

type ParentSpace = {
  id: string
  name: string
  space_type?: string | null
}

interface WorkspaceOverviewProps {
  workspaceId: string
  initialName: string
  initialDescription?: string | null
  initialContext?: string | null
  initialLocation?: string | null
  parentSpaces: ParentSpace[]
  canManage?: boolean
  canAccessSettings?: boolean
}

export function WorkspaceOverview({
  workspaceId,
  initialName,
  initialDescription,
  initialContext,
  initialLocation,
  parentSpaces,
  canManage = true,
  canAccessSettings = true,
}: WorkspaceOverviewProps) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? "")
  const [context, setContext] = useState(initialContext ?? "")
  const [location, setLocation] = useState(initialLocation ?? "")

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [enhancingField, setEnhancingField] = useState<"description" | "context" | null>(null)
  const [activeField, setActiveField] = useState<"description" | "context" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [descriptionPrevious, setDescriptionPrevious] = useState<string | null>(null)
  const [contextPrevious, setContextPrevious] = useState<string | null>(null)

  const [draftName, setDraftName] = useState(initialName)
  const [draftDescription, setDraftDescription] = useState(initialDescription ?? "")
  const [draftContext, setDraftContext] = useState(initialContext ?? "")
  const [draftLocation, setDraftLocation] = useState(initialLocation ?? "")

  const handleStartEditing = () => {
    setDraftName(name)
    setDraftDescription(description)
    setDraftContext(context)
    setDraftLocation(location)
    setError(null)
    setActiveField(null)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setDraftName(name)
    setDraftDescription(description)
    setDraftContext(context)
    setDraftLocation(location)
    setError(null)
    setActiveField(null)
    setDescriptionPrevious(null)
    setContextPrevious(null)
    setIsEditing(false)
  }

  const handleEnhance = async (field: "description" | "context") => {
    const targetText = field === "description" ? draftDescription : draftContext
    if (!targetText || targetText.trim().length === 0) {
      return
    }

    setError(null)
    setEnhancingField(field)

    setIsEnhancing(true)
    try {
      const result = await enhanceContextText(targetText.trim())
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.enhanced) {
        if (field === "description") {
          setDescriptionPrevious(draftDescription)
          setDraftDescription(result.enhanced)
        } else {
          setContextPrevious(draftContext)
          setDraftContext(result.enhanced)
        }
      }
    } finally {
      setIsEnhancing(false)
      setEnhancingField(null)
    }
  }

  const handleUndoEnhance = (field: "description" | "context") => {
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

    const normalizedDescription = draftDescription.trim().length > 0 ? draftDescription.trim() : null
    const normalizedContext = draftContext.trim().length > 0 ? draftContext.trim() : null
    const normalizedLocation = draftLocation.trim().length > 0 ? draftLocation.trim() : null

    const result = await updateWorkspace(
      workspaceId,
      trimmedName,
      normalizedDescription,
      normalizedContext,
      normalizedLocation,
    )

    if (result.error) {
      setError(result.error)
      setIsSaving(false)
      return
    }

    setName(trimmedName)
    setDescription(normalizedDescription ?? "")
    setContext(normalizedContext ?? "")
    setLocation(normalizedLocation ?? "")
    setIsSaving(false)
    setActiveField(null)
    setDescriptionPrevious(null)
    setContextPrevious(null)
    setIsEditing(false)
    router.refresh()
  }

  return (
    <section className="space-y-4">
      {isEditing ? (
        <div className="space-y-4 rounded-lg border border-border bg-card/50 p-4 shadow-lg">
          <h2 className="text-lg font-semibold text-foreground">
            Editing: <span className="text-primary">{name}</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="workspace-title">Workspace title</Label>
              <Input
                id="workspace-title"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Workspace name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-location">Location</Label>
              <Input
                id="workspace-location"
                value={draftLocation}
                onChange={(event) => setDraftLocation(event.target.value)}
                placeholder="e.g., Amsterdam, Netherlands"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-description">Summary</Label>
            <div className="relative">
              <Textarea
                id="workspace-description"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                onFocus={() => setActiveField("description")}
                onBlur={() => setActiveField((current) => (current === "description" ? null : current))}
                placeholder="Give a quick summary of this workspace…"
                rows={4}
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
                      <span className="sr-only">Undo summary enhancement</span>
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
                          <span className="sr-only">Enhance summary with AI</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" align="center">
                        Generate an improved summary with AI.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-context">Description</Label>
            <div className="relative">
              <Textarea
                id="workspace-context"
                value={draftContext}
                onChange={(event) => setDraftContext(event.target.value)}
                onFocus={() => setActiveField("context")}
                onBlur={() => setActiveField((current) => (current === "context" ? null : current))}
                placeholder="Describe the focus, document types, and key themes for this workspace…"
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
                      <span className="sr-only">Undo description enhancement</span>
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
                          <span className="sr-only">Enhance description with AI</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" align="center">
                        Ask AI to develop the description for you.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Describe the focus, document types, and key themes for this workspace. This helps the AI understand and search your documents.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={isSaving}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
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
              {location && (
                <span className="text-sm font-medium text-muted-foreground">{location}</span>
              )}
            </div>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="More options">
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">More options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleStartEditing}>
                  <PencilLine className="h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {canAccessSettings && (
                  <DropdownMenuItem asChild>
                    <Link href={`/workspaces/${workspaceId}/settings`}>
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="space-y-2">
            {description.trim().length > 0 && (
              <p className="whitespace-pre-line text-sm font-bold text-foreground">{description}</p>
            )}
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {context.trim().length > 0 ? context : "No workspace context provided yet."}
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

