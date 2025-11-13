"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useRouter } from "next/navigation"
import { Save, Info, Wand2 } from "lucide-react"

interface WorkspacePropertiesProps {
  workspace: {
    id: string
    name: string
    description?: string | null
    context?: string | null
    location?: string | null
    space_id: string
  }
}

export function WorkspaceProperties({ workspace }: WorkspacePropertiesProps) {
  const [context, setContext] = useState(workspace.context || "")
  const [location, setLocation] = useState(workspace.location || "")
  const [isUpdating, setIsUpdating] = useState(false)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleUpdateProperties = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsUpdating(true)
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
      setIsUpdating(false)
    } else {
      setIsUpdating(false)
      router.refresh()
    }
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Workspace Properties
          </CardTitle>
          <CardDescription>
            Provide additional context about this workspace to help the AI understand search criteria and domain-specific
            information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProperties} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-location">Location</Label>
              <Input
                id="workspace-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Amsterdam, Netherlands"
              />
              <p className="text-xs text-muted-foreground">
                If you specify a location, it will be automatically included in searches and does not need to be
                mentioned in queries
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-context">Additional Context</Label>
              <div className="relative">
                <Textarea
                  id="workspace-context"
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
            <div className="flex justify-end">
              <Button type="submit" disabled={isUpdating}>
                <Save className="mr-2 h-4 w-4" />
                {isUpdating ? "Saving..." : "Save Properties"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

