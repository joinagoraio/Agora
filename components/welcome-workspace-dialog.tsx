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
import { MapPin, FileText, Wand2 } from "lucide-react"

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

    setIsEnhancing(true)
    setError(null)

    const result = await enhanceContextText(context)

    if (result.error) {
      setError(result.error)
    } else if (result.enhanced) {
      setContext(result.enhanced)
    }

    setIsEnhancing(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome to {workspace.name}!</DialogTitle>
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
                Location
              </Label>
              <Input
                id="welcome-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Amsterdam, Netherlands"
              />
              <p className="text-xs text-muted-foreground">
                If you specify a location, it will be automatically included in searches
              </p>
            </div>

            <div className="space-y-2 mt-6">
              <Label htmlFor="welcome-context" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Additional Context
              </Label>
              <div className="relative">
                <Textarea
                  id="welcome-context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g., This workspace focuses on municipal policy documents for Amsterdam. Documents include city council decisions, policy proposals, and public consultations..."
                  rows={8}
                  className="pr-12 pb-10"
                />
                <div className="absolute bottom-2 right-2 z-20">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={handleEnhance}
                          disabled={isEnhancing || !context || context.trim().length === 0}
                          className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {isEnhancing ? (
                            <Wand2 className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-pulse" />
                          ) : (
                            <Wand2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Enhance with AI</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Provide context about the workspace domain, document types, or any other information that would help the
                AI better understand and search through your documents
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
      </DialogContent>
    </Dialog>
  )
}
