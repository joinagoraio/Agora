"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateWorkspace, deleteWorkspace } from "@/lib/actions/workspace"
import { useRouter } from "next/navigation"
import { Trash2, Save } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface WorkspaceSettingsProps {
  workspace: {
    id: string
    name: string
    description?: string | null
    space_id: string
  }
}

export function WorkspaceSettings({ workspace }: WorkspaceSettingsProps) {
  const [workspaceName, setWorkspaceName] = useState(workspace.name)
  const [workspaceDescription, setWorkspaceDescription] = useState(workspace.description || "")
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const router = useRouter()

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsUpdating(true)
    setError(null)

    const result = await updateWorkspace(workspace.id, workspaceName, workspaceDescription || undefined)

    if (result.error) {
      setError(result.error)
      setIsUpdating(false)
    } else {
      setIsUpdating(false)
      router.refresh()
    }
  }

  const handleDeleteWorkspace = async () => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    
    setIsDeleting(true)
    setError(null)

    const result = await deleteWorkspace(workspace.id)

    if (result.error) {
      setError(result.error)
      setIsDeleting(false)
      setNeedsConfirmation(false)
    } else {
      router.push(`/spaces/${workspace.space_id}`)
    }
  }

  const handleDeleteDialogClose = (open: boolean) => {
    setNeedsConfirmation(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace Settings</CardTitle>
          <CardDescription>Update your workspace name and description</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateWorkspace} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace Name</Label>
              <Input
                id="workspace-name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="My Workspace"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-description">Description</Label>
              <Textarea
                id="workspace-description"
                value={workspaceDescription}
                onChange={(e) => setWorkspaceDescription(e.target.value)}
                placeholder="Workspace description..."
                rows={3}
              />
            </div>
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="flex justify-end">
              <Button type="submit" disabled={isUpdating}>
                <Save className="mr-2 h-4 w-4" />
                {isUpdating ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Permanently delete this workspace and all its data</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog onOpenChange={handleDeleteDialogClose}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting}>
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? "Deleting..." : "Delete Workspace"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the workspace and all of its data,
                  including:
                  <ul className="mt-2 list-disc pl-5 space-y-1">
                    <li>All sources and synced documents</li>
                    <li>All conversations and messages</li>
                    <li>All document embeddings</li>
                  </ul>
                </AlertDialogDescription>
              </AlertDialogHeader>
              {needsConfirmation && (
                <p className="text-sm text-destructive font-medium">
                  This action cannot be undone.
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setNeedsConfirmation(false)}>Cancel</AlertDialogCancel>
                {needsConfirmation ? (
                <AlertDialogAction onClick={handleDeleteWorkspace} className="bg-destructive text-white hover:bg-destructive/90">
                    Confirm?
                  </AlertDialogAction>
                ) : (
                  <Button onClick={() => setNeedsConfirmation(true)} className="bg-destructive text-white hover:bg-destructive/90">
                  Yes, delete workspace
                  </Button>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}

