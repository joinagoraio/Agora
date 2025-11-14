"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { deleteWorkspace } from "@/lib/actions/workspace"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
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
    space_id: string
  }
}

export function WorkspaceSettings({ workspace }: WorkspaceSettingsProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const router = useRouter()

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
      <Card className="border-destructive shadow">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Permanently delete this workspace and all its data</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
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
                </AlertDialogDescription>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  <li>All sources and synced documents</li>
                  <li>All conversations and messages</li>
                  <li>All document embeddings</li>
                </ul>
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
