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
import { updateWorkspace, enhanceContextText } from "@/lib/actions/workspace"
import { MapPin, FileText, Wand2, RotateCcw, Loader2, BookOpen } from "lucide-react"
import { AddOverheidDocumentsDialog } from "@/components/add-overheid-documents-dialog"

interface WelcomeWorkspaceDialogProps {
  workspace: {
    id: string
    name: string
    description?: string | null
    context?: string | null
    location?: string | null
  }
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WelcomeWorkspaceDialog({ workspace, open, onOpenChange }: WelcomeWorkspaceDialogProps) {
  const router = useRouter()
  const [location, setLocation] = useState(workspace.location || "")
  const [context, setContext] = useState(workspace.context || "")
  const [isSaving, setIsSaving] = useState(false)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [originalContext, setOriginalContext] = useState<string | null>(null)
  const [enhancementCompleted, setEnhancementCompleted] = useState(false)
  const [focusedField, setFocusedField] = useState<"context" | null>(null)
  const [overheidDialogOpen, setOverheidDialogOpen] = useState(false)

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

    const result = await updateWorkspace(
      workspace.id,
      workspace.name,
      workspace.description || undefined,
      context || undefined,
      location || undefined
    )

    if (result.error) {
      setError(result.error)
      setIsSaving(false)
    } else {
      setIsSaving(false)
      handleClose(false)
      router.refresh()
    }
  }

  const handleSkip = () => {
    handleClose(false)
  }

  const handleEnhance = async () => {
    if (!context || context.trim().length === 0) {
      return
    }

    // Store original text before enhancement
    setOriginalContext(context)

    setIsEnhancing(true)
    setError(null)

    const result = await enhanceContextText(context)

    if (result.error) {
      setError(result.error)
      // Clear original text if enhancement failed
      setOriginalContext(null)
    } else if (result.enhanced) {
      setContext(result.enhanced)
      setEnhancementCompleted(true)
    }

    setIsEnhancing(false)
  }

  const handleUndo = () => {
    if (originalContext !== null) {
      setContext(originalContext)
      setOriginalContext(null)
      setEnhancementCompleted(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome to {workspace.name}</DialogTitle>
          <DialogDescription className="text-sm">
            Help us understand your workspace better by adding some context. This will improve AI search and
            understanding of your documents.
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
              <Label htmlFor="welcome-context" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Workspace Scope
              </Label>
              <div className="relative">
                <Textarea
                  id="welcome-context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g., This workspace focuses on municipal policy documents for Amsterdam. Documents include city council decisions, policy proposals, and public consultations..."
                  rows={8}
                  className="pb-10"
                  onFocus={() => setFocusedField("context")}
                  onBlur={() => setFocusedField(null)}
                />
                {(focusedField === "context" || isEnhancing) && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-2">
                    {enhancementCompleted && originalContext !== null && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleUndo}
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
                            onClick={handleEnhance}
                            disabled={isEnhancing || !context || context.trim().length === 0}
                            onMouseDown={(e) => e.preventDefault()}
                            className="h-8 w-8 p-0 hover:bg-transparent group"
                          >
                            {isEnhancing ? (
                              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                            ) : (
                              <Wand2 className="h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-600" />
                            )}
                            <span className="sr-only">Enhance with AI</span>
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
                Describe the focus, document types, and key themes for this workspace. This helps the AI understand and search your documents.
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
                          disabled={!location.trim() || !context.trim()}
                          className="w-fit justify-start text-xs"
                        >
                          <FileText className="mr-2 h-3 w-3" />
                          Add Documents from Overheid.nl
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {(!location.trim() || !context.trim()) && (
                      <TooltipContent>
                        <p>Please add both Jurisdiction and Workspace Scope to enable this feature</p>
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
          workspaceLocation={location || workspace.location}
          workspaceContext={context || workspace.context}
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
