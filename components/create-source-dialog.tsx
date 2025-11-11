"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createSource } from "@/lib/actions/source"
import { Plus } from "lucide-react"

interface CreateSourceDialogProps {
  workspaceId: string
  onSuccess?: () => void
}

const SOURCE_TYPES = [
  { value: "google_drive", label: "Google Drive", description: "Sync documents from Google Drive" },
  { value: "notion", label: "Notion", description: "Connect your Notion workspace" },
  { value: "confluence", label: "Confluence", description: "Import Confluence pages" },
  { value: "sharepoint", label: "SharePoint", description: "Connect to SharePoint" },
  { value: "dropbox", label: "Dropbox", description: "Sync files from Dropbox" },
  { value: "overheid_nl", label: "Overheid.nl", description: "Search Dutch government publications and regulations" },
] as const

export function CreateSourceDialog({ workspaceId, onSuccess }: CreateSourceDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState<string>("")
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    let config: Record<string, any> = {}

    if (type === "overheid_nl") {
      // Overheid.nl doesn't need a query in config - users search when adding documents
      config = {}
    } else {
      config = {
        api_key: apiKey,
      }
    }

    const result = await createSource(workspaceId, name, type as any, config)

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      setOpen(false)
      setName("")
      setType("")
      setApiKey("")
      setIsLoading(false)
      onSuccess?.()
    }
  }

  const selectedSource = SOURCE_TYPES.find((c) => c.value === type)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Source
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a new source</DialogTitle>
            <DialogDescription>Connect external document sources to your workspace</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="source-type">Source Type</Label>
              <Select value={type} onValueChange={setType} required>
                <SelectTrigger id="source-type">
                  <SelectValue placeholder="Select a source type" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((source) => (
                    <SelectItem key={source.value} value={source.value}>
                      <div>
                        <div className="font-medium">{source.label}</div>
                        <div className="text-xs text-muted-foreground">{source.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="source-name">Source Name</Label>
                  <Input
                    id="source-name"
                    placeholder={`My ${selectedSource?.label} Source`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                {type === "overheid_nl" ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Overheid.nl source allows you to search and add Dutch government publications on demand.
                      No configuration needed - you'll search when adding documents.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="api-key">API Key / Token</Label>
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="Enter your API key or access token"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">This will be encrypted and stored securely</p>
                  </div>
                )}
              </>
            )}

            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !type || (type !== "overheid_nl" && !apiKey)}
            >
              {isLoading ? "Connecting..." : "Add Source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
