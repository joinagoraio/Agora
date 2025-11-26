"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { updateWorkspace, enhanceWorkspaceText } from "@/lib/actions/workspace"
import { MapPin, FileText, Wand2, RotateCcw, Loader2, BookOpen } from "lucide-react"
import { AddOverheidDocumentsDialog } from "@/components/add-overheid-documents-dialog"
import { useI18n } from "@/lib/i18n/use-i18n"

interface WelcomeWorkspaceDialogProps {
  workspace: {
    id: string
    name: string
    summary?: string | null
    description?: string | null
    context?: string | null
    location?: string | null
  }
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WelcomeWorkspaceDialog({ workspace, open, onOpenChange }: WelcomeWorkspaceDialogProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [location, setLocation] = useState(workspace.location || "")
  const [summary, setSummary] = useState(workspace.summary || "")
  const [description, setDescription] = useState(workspace.description || "")
  const [context, setContext] = useState(workspace.context || "")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<"summary" | "description" | null>(null)
  const [enhancingField, setEnhancingField] = useState<"summary" | "description" | null>(null)
  const [originalSummary, setOriginalSummary] = useState<string | null>(null)
  const [originalDescription, setOriginalDescription] = useState<string | null>(null)
  const [overheidDialogOpen, setOverheidDialogOpen] = useState(false)

  const trimmedSummary = summary.trim()
  const trimmedDescription = description.trim()
  const trimmedContext = context.trim()
  const scopeSegments = [trimmedSummary, trimmedDescription].filter((value) => value.length > 0)
  const scopeIsComplete = trimmedSummary.length > 0 && trimmedDescription.length > 0
  const hasLocation = location.trim().length > 0
  const isEnhancing = enhancingField !== null
  const overheidScopeSegments = [...scopeSegments, trimmedContext].filter((value) => value.length > 0)
  const overheidContext = overheidScopeSegments.length > 0 ? overheidScopeSegments.join("\n\n") : ""

  const handleClose = (open: boolean) => {
    if (!open) {
      // Remove the ?new=true query parameter when dialog closes
      router.replace(`/workspaces/${workspace.id}`)
    }
    onOpenChange(open)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    const normalizedSummary = trimmedSummary.length > 0 ? trimmedSummary : null
    const normalizedDescription = trimmedDescription.length > 0 ? trimmedDescription : null
    const normalizedLocation = location.trim().length > 0 ? location.trim() : null
    const normalizedContext = trimmedContext.length > 0 ? trimmedContext : null

    const result = await updateWorkspace(
      workspace.id,
      workspace.name,
      normalizedDescription,
      normalizedContext,
      normalizedLocation,
      normalizedSummary,
    )

    if (result.error) {
      setError(result.error)
      setIsSaving(false)
    } else {
      setSummary(normalizedSummary ?? "")
      setDescription(normalizedDescription ?? "")
      setContext(normalizedContext ?? "")
      setOriginalSummary(null)
      setOriginalDescription(null)
      setIsSaving(false)
      
      // Notify chat interface of workspace context update
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("workspaceContextUpdated", {
            detail: { workspaceId: workspace.id, type: "workspace", action: "updated" },
          }),
        )
      }
      
      handleClose(false)
      router.refresh()
    }
  }

  const handleSkip = () => {
    handleClose(false)
  }

  const handleEnhance = async (field: "summary" | "description") => {
    const targetText = field === "summary" ? summary : description
    if (!targetText || targetText.trim().length === 0) {
      return
    }

    if (field === "summary") {
      setOriginalSummary(summary)
    } else {
      setOriginalDescription(description)
    }

    setEnhancingField(field)
    setError(null)

    const cleanTarget = targetText.trim()
    const result = await enhanceWorkspaceText(cleanTarget, {
      field,
      workspaceName: workspace.name,
      summary: field === "description" && trimmedSummary.length > 0 ? trimmedSummary : undefined,
    })

    if (result.error) {
      setError(result.error)
      if (field === "summary") {
        setOriginalSummary(null)
      } else {
        setOriginalDescription(null)
      }
    } else if (result.enhanced) {
      if (field === "summary") {
        setSummary(result.enhanced)
      } else {
        setDescription(result.enhanced)
      }
    }

    setEnhancingField(null)
  }

  const handleUndo = (field: "summary" | "description") => {
    if (field === "summary" && originalSummary !== null) {
      setSummary(originalSummary)
      setOriginalSummary(null)
    }
    if (field === "description" && originalDescription !== null) {
      setDescription(originalDescription)
      setOriginalDescription(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome to {workspace.name}</DialogTitle>
          <DialogDescription className="text-sm">
            Help us understand your workspace by adding a concise summary and detailed description. This scope improves AI search
            and understanding of your documents.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="welcome-location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Jurisdiction
              </Label>
              <div className="w-fit">
                <Input
                  id="welcome-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Amsterdam, Netherlands"
                  className="w-[300px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The geographic or legal jurisdiction this workspace operates within.
              </p>
            </div>

            <div className="space-y-2 mt-6">
              <Label htmlFor="welcome-summary" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Workspace Summary (1-2 sentences)
              </Label>
              <div className="relative">
                <Textarea
                  id="welcome-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Capture the mission of this workspace in 1-2 sentences..."
                  rows={4}
                  className="pb-10"
                  onFocus={() => setFocusedField("summary")}
                  onBlur={() => setFocusedField((current) => (current === "summary" ? null : current))}
                />
                {(focusedField === "summary" || enhancingField === "summary") && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-2">
                    {originalSummary !== null && (
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
                              <span className="sr-only">Undo summary enhancement</span>
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
                            disabled={isEnhancing || trimmedSummary.length === 0}
                            onMouseDown={(e) => e.preventDefault()}
                            className="h-8 w-8 p-0 hover:bg-transparent group"
                          >
                            {isEnhancing && enhancingField === "summary" ? (
                              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                            ) : (
                              <Wand2 className="h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-600" />
                            )}
                            <span className="sr-only">Enhance summary with AI</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Enhance summary with AI</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Provide a crisp overview. This is the headline scope teammates and AI assistants will see first.
              </p>
            </div>

            <div className="space-y-2 mt-6">
              <Label htmlFor="welcome-description" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Workspace Description (Scope details)
              </Label>
              <div className="relative">
                <Textarea
                  id="welcome-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the documents, responsibilities, and outcomes this workspace covers..."
                  rows={8}
                  className="pb-10"
                  onFocus={() => setFocusedField("description")}
                  onBlur={() => setFocusedField((current) => (current === "description" ? null : current))}
                />
                {(focusedField === "description" || enhancingField === "description") && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-2">
                    {originalDescription !== null && (
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
                              <span className="sr-only">Undo description enhancement</span>
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
                            disabled={isEnhancing || trimmedDescription.length === 0}
                            onMouseDown={(e) => e.preventDefault()}
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
                          <p>Enhance description with AI</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Share 4-6 sentences covering key themes, document types, and responsibilities. This becomes the detailed scope
                AI search relies on.
              </p>
            </div>

            <div className="space-y-2 mt-6">
              <Label htmlFor="welcome-context" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Additional AI Context (optional)
              </Label>
              <Textarea
                id="welcome-context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Add any extra guidance, datasets, or instructions you want AI assistants to consider."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Optional: include specialized terms, ongoing initiatives, or anything else the AI should keep in mind.
              </p>
            </div>

            <div className="space-y-2 mt-6">
              <Label className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Workspace Knowledge
              </Label>
              <div className="w-fit">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setOverheidDialogOpen(true)}
                          disabled={!hasLocation || !scopeIsComplete}
                          className="w-fit justify-start text-xs"
                        >
                          <FileText className="mr-2 h-3 w-3" />
                          {t("workspace.sources.overheidDialog.title")}
                        </Button>
                      </span>
                    </TooltipTrigger>
                      {(!hasLocation || !scopeIsComplete) && (
                        <TooltipContent>
                          <p>Please add Jurisdiction plus both Summary and Description to enable this feature</p>
                        </TooltipContent>
                      )}
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground">
                Add relevant Dutch government publications and regulations to your workspace knowledge base. Documents will be filtered by your jurisdiction and workspace scope.
              </p>
            </div>

            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button type="button" variant="ghost" onClick={handleSkip} disabled={isSaving}>
              Skip for now
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Properties"}
            </Button>
          </DialogFooter>
        </form>

        <AddOverheidDocumentsDialog
          workspaceId={workspace.id}
          workspaceLocation={hasLocation ? location.trim() : workspace.location}
          workspaceContext={overheidContext || undefined}
          open={overheidDialogOpen}
          onOpenChange={setOverheidDialogOpen}
          onSuccess={() => {
            // Optionally refresh or show success message
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
