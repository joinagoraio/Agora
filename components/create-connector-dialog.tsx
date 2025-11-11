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
import { createConnector } from "@/lib/actions/connector"
import { Plus } from "lucide-react"

interface CreateConnectorDialogProps {
  workspaceId: string
  onSuccess?: () => void
}

const CONNECTOR_TYPES = [
  { value: "google_drive", label: "Google Drive", description: "Sync documents from Google Drive" },
  { value: "notion", label: "Notion", description: "Connect your Notion workspace" },
  { value: "confluence", label: "Confluence", description: "Import Confluence pages" },
  { value: "sharepoint", label: "SharePoint", description: "Connect to SharePoint" },
  { value: "dropbox", label: "Dropbox", description: "Sync files from Dropbox" },
] as const

export function CreateConnectorDialog({ workspaceId, onSuccess }: CreateConnectorDialogProps) {
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

    const config = {
      api_key: apiKey,
    }

    const result = await createConnector(workspaceId, name, type as any, config)

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

  const selectedConnector = CONNECTOR_TYPES.find((c) => c.value === type)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Connector
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a new connector</DialogTitle>
            <DialogDescription>Connect external document sources to your workspace</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="connector-type">Connector Type</Label>
              <Select value={type} onValueChange={setType} required>
                <SelectTrigger id="connector-type">
                  <SelectValue placeholder="Select a connector type" />
                </SelectTrigger>
                <SelectContent>
                  {CONNECTOR_TYPES.map((connector) => (
                    <SelectItem key={connector.value} value={connector.value}>
                      <div>
                        <div className="font-medium">{connector.label}</div>
                        <div className="text-xs text-muted-foreground">{connector.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="connector-name">Connector Name</Label>
                  <Input
                    id="connector-name"
                    placeholder={`My ${selectedConnector?.label} Connection`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
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
              </>
            )}

            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !type}>
              {isLoading ? "Connecting..." : "Add Connector"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
