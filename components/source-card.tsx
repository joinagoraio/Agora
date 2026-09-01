"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { deleteSource } from "@/lib/actions/source"
import { Cloud, MoreVertical, Trash2, TestTube, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { formatSourceType } from "@/lib/utils"
import { fetchCsrfToken } from "@/lib/utils/csrf"
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
} from "@/components/ui/alert-dialog"
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"

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
  const isWorkspaceSource = source.type === "workspace_generated"
  const { t } = useI18n()
  const sourceTypeLabel = t(
    `workspace.sources.card.type.${source.type}`,
    formatSourceType(source.type),
  )
  const normalizedStatus = (source.status || "default").toLowerCase()
  const sourceStatusLabel = t(
    `workspace.sources.card.status.${normalizedStatus}`,
    (source.status || "").replaceAll("_", " ") || t("workspace.sources.card.status.default"),
  )

  const handleDelete = async () => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    
    setIsDeleting(true)
    try {
      const result = await deleteSource(source.id)
      
      if (result.error) {
        window.alert(`${t("workspace.sources.card.deleteError")}: ${result.error}`)
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
      window.alert(t("workspace.sources.card.deleteError"))
      setIsDeleting(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      const csrfToken = await fetchCsrfToken()
      if (!csrfToken) {
        setTestResult({
          success: false,
          message: t("workspace.sources.card.testErrorSession"),
        })
        return
      }

      const response = await fetch(`/api/connectors/${source.id}/test`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ testConnection: true }),
      })

      let payload: { success: boolean; message: string; error?: string } | null = null
      try {
        payload = await response.json()
      } catch (parseError) {
        console.error("[SourceCard] Failed to parse connector test response:", parseError)
      }

      if (!response.ok || !payload) {
        setTestResult({
          success: false,
          message: payload?.message || payload?.error || t("workspace.sources.card.testFailure"),
        })
        return
      }

      setTestResult(payload)
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : t("workspace.sources.card.testGenericError"),
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
    <div className="px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
            <Cloud className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium leading-tight">{source.name}</p>
            <p className="text-xs text-muted-foreground leading-tight">{sourceTypeLabel}</p>
            {source.last_sync_at && (
              <p className="text-xs text-muted-foreground leading-tight">
                {t("workspace.sources.card.lastSync")}: {new Date(source.last_sync_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {sourceStatusLabel}
          </span>
          {!isWorkspaceSource && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <span className="inline-flex">
                  <IconTooltip label={t("common.tooltips.moreActions")}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isDeleting} aria-label={t("common.tooltips.moreActions")}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </IconTooltip>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleTest} disabled={isTesting}>
                  {isTesting ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      <span>{t("workspace.sources.card.testing")}</span>
                    </>
                  ) : (
                    <>
                      <TestTube className="mr-2 h-3.5 w-3.5" />
                      <span>{t("workspace.sources.card.test")}</span>
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDeleteDialogOpen(true)}
                  className="hover:!bg-destructive/10 hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive [&:hover_svg]:!text-destructive [&:focus_svg]:!text-destructive [&:hover_span]:!text-destructive [&:focus_span]:!text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  <span>{t("workspace.sources.card.delete")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {testResult && (
        <div className="pt-3">
          <Alert
            variant={testResult.success ? "default" : "destructive"}
            className={
              testResult.success ? "border-none bg-green-50 text-green-800 [&>svg]:text-green-600" : undefined
            }
          >
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{testResult.message}</AlertDescription>
          </Alert>
        </div>
      )}

      {!isWorkspaceSource && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogClose}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("workspace.sources.card.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("workspace.sources.card.deleteDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {needsConfirmation && (
              <p className="text-sm font-medium text-destructive">
                {t("workspace.sources.card.deleteWarning")}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>{t("workspace.sources.manage.cancel")}</AlertDialogCancel>
              {needsConfirmation ? (
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {isDeleting ? t("workspace.sources.card.deleteSubmitting") : t("workspace.sources.card.deleteConfirm")}
                </AlertDialogAction>
              ) : (
                <Button
                  onClick={() => setNeedsConfirmation(true)}
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {t("workspace.sources.card.delete")}
                </Button>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
