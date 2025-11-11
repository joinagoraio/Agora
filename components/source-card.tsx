"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { syncSource, deleteSource } from "@/lib/actions/source"
import { Cloud, MoreVertical, RefreshCw, Trash2, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
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

interface SourceCardProps {
  source: {
    id: string
    name: string
    type: string
    status: string
    last_sync_at: string | null
  }
}

const SOURCE_ICONS: Record<string, string> = {
  google_drive: "Google Drive",
  notion: "Notion",
  confluence: "Confluence",
  sharepoint: "SharePoint",
  dropbox: "Dropbox",
  direct_upload: "Direct Upload",
  overheid_nl: "Overheid.nl",
}

export function SourceCard({ source }: SourceCardProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const router = useRouter()

  const handleSync = async () => {
    setIsSyncing(true)
    await syncSource(source.id)
    setIsSyncing(false)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    
    setIsDeleting(true)
    await deleteSource(source.id)
    setIsDeleting(false)
    setDeleteDialogOpen(false)
    setNeedsConfirmation(false)
    router.refresh()
  }

  const handleDeleteDialogClose = (open: boolean) => {
    if (!open) {
      setDeleteDialogOpen(false)
      setNeedsConfirmation(false)
    }
  }

  const getStatusIcon = () => {
    switch (source.status) {
      case "active":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />
      case "inactive":
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />
      default:
        return null
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Cloud className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{source.name}</CardTitle>
              <CardDescription>{SOURCE_ICONS[source.type] || source.type}</CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isDeleting}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleSync} disabled={isSyncing}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge variant={source.status === "active" ? "default" : "secondary"}>{source.status}</Badge>
          </div>
          {source.last_sync_at && (
            <p className="text-xs text-muted-foreground">
              Last sync: {new Date(source.last_sync_at).toLocaleString()}
            </p>
          )}
        </div>
        {isSyncing && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Syncing...</span>
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Source?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this source? All associated documents will be removed.
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
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90" disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Confirm?"}
              </AlertDialogAction>
            ) : (
              <Button onClick={() => setNeedsConfirmation(true)} className="bg-destructive text-white hover:bg-destructive/90" disabled={isDeleting}>
                Delete
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
