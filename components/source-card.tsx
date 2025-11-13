"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { deleteSource } from "@/lib/actions/source"
import { Cloud, MoreVertical, Trash2, TestTube, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { formatSourceType } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
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


export function SourceCard({ source }: SourceCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleDelete = async () => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    
    setIsDeleting(true)
    try {
      const result = await deleteSource(source.id)
      
      if (result.error) {
        alert(`Failed to delete source: ${result.error}`)
    setIsDeleting(false)
        return
      }
      
      // Close dialog first
    setDeleteDialogOpen(false)
    setNeedsConfirmation(false)
      setIsDeleting(false)
      
      // Force remove all overlays and portals immediately
      const removeOverlays = () => {
        // Remove all Radix portals
        document.querySelectorAll('[data-radix-portal]').forEach(portal => portal.remove())
        // Also remove any elements with the overlay classes
        document.querySelectorAll('[class*="fixed inset-0 z-50 bg-black/50"]').forEach(el => el.remove())
        // Remove any backdrop elements
        document.querySelectorAll('[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay]').forEach(el => el.remove())
      }
      
      // Remove overlays immediately
      removeOverlays()
      
      // Also remove after a short delay to catch any that appear during animation
      setTimeout(() => {
        removeOverlays()
        // Use window.location.reload instead of router.refresh for a clean refresh
        window.location.reload()
      }, 100)
    } catch (error) {
      console.error("Error deleting source:", error)
      alert("Failed to delete source")
      setIsDeleting(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      const response = await fetch(`/api/connectors/${source.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testConnection: true }),
      })

      const result = await response.json()
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Test failed",
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleDeleteDialogClose = (open: boolean) => {
    if (open) {
      setDeleteDialogOpen(open)
    } else {
      // Defer state updates to allow the close animation to complete
      setTimeout(() => {
        if (!isDeleting) {
          setDeleteDialogOpen(false)
        }
        setNeedsConfirmation(false)
      }, 150)
    }
  }

  return (
    <Card className="pt-6 pb-6 gap-0">
      <CardHeader className="pb-0 mb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Cloud className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{source.name}</CardTitle>
              <CardDescription>{formatSourceType(source.type)}</CardDescription>
              {source.last_sync_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last sync: {new Date(source.last_sync_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isDeleting}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleTest} disabled={isTesting}>
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <TestTube className="mr-2 h-3.5 w-3.5" />
                    <span>Test Connection</span>
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setDeleteDialogOpen(true)} 
                className="hover:!bg-destructive/10 hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive [&:hover_svg]:!text-destructive [&:focus_svg]:!text-destructive [&:hover_span]:!text-destructive [&:focus_span]:!text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      {testResult && (
        <div className="px-6 pb-4">
          <Alert variant={testResult.success ? "default" : "destructive"}>
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{testResult.message}</AlertDescription>
          </Alert>
        </div>
      )}

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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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

