"use client"

import { useEffect, useState } from "react"
import { LayoutTemplate, Mail, Shield, Trash2, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { SpaceComplianceSettings } from "@/components/space-compliance-settings"
import { SpaceSettings } from "@/components/space-settings"
import { SpaceTemplateLibrary } from "@/components/space-template-library"
import { useI18n } from "@/lib/i18n/use-i18n"
import { deleteSpace, getSpaceAccessSettings } from "@/lib/actions/space"

export type AuthorityAccessPanel = "templates" | "members" | "invitations" | "compliance" | "delete" | null

type AccessData = {
  space: { id: string; name: string }
  members: any[]
  invitations: any[]
  currentUserId: string
}

export function AuthorityAccessMenuItems({
  canDelete,
  onPick,
}: {
  canDelete: boolean
  onPick: (panel: Exclude<AuthorityAccessPanel, null>) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onPick("templates")}>
        <LayoutTemplate className="h-4 w-4" />
        {t("space.overview.menu.templates")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onPick("members")}>
        <Users className="h-4 w-4" />
        {t("space.overview.menu.members")}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onPick("invitations")}>
        <Mail className="h-4 w-4" />
        {t("space.overview.menu.invitations")}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onPick("compliance")}>
        <Shield className="h-4 w-4" />
        {t("space.overview.menu.compliance")}
      </DropdownMenuItem>
      {canDelete ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onPick("delete")}>
            <Trash2 className="h-4 w-4" />
            {t("space.overview.menu.delete")}
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  )
}

export function AuthorityAccessDialogs({
  space,
  panel,
  onClose,
}: {
  space: { id: string; name: string }
  panel: AuthorityAccessPanel
  onClose: () => void
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [access, setAccess] = useState<AccessData | null>(null)
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)

  useEffect(() => {
    if (panel === "delete") setNeedsConfirmation(false)
  }, [panel])

  useEffect(() => {
    if (panel !== "members" && panel !== "invitations") return
    let cancelled = false
    setAccessLoading(true)
    setAccessError(null)
    void getSpaceAccessSettings(space.id).then((result) => {
      if (cancelled) return
      setAccessLoading(false)
      if (result.error || !result.data) {
        setAccess(null)
        setAccessError(result.error || t("space.overview.menu.accessError"))
        return
      }
      setAccess(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [panel, space.id, t])

  const handleDelete = async () => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    setIsDeleting(true)
    const result = await deleteSpace(space.id)
    setIsDeleting(false)
    if (result?.error) {
      toast.error(t("space.settings.danger.toastError"), { description: result.error })
      return
    }
    toast.success(t("space.settings.danger.toastSuccess"), {
      description: t("space.settings.danger.toastSuccessDescription", undefined, { name: space.name }),
    })
    onClose()
    router.push("/dashboard")
  }

  const contentOpen = panel === "templates" || panel === "members" || panel === "invitations" || panel === "compliance"
  const title =
    panel === "templates"
      ? t("space.settings.tabs.templates")
      : panel === "members"
        ? t("space.settings.members.title")
        : panel === "invitations"
          ? t("space.settings.invitations.title")
          : t("space.settings.compliance.title")
  const description =
    panel === "templates"
      ? t("space.settings.templates.hint")
      : panel === "members"
        ? t("space.settings.members.description")
        : panel === "invitations"
          ? t("space.settings.invitations.description")
          : t("space.settings.compliance.description")

  return (
    <>
      <Dialog open={contentOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {panel === "templates" ? <SpaceTemplateLibrary spaceId={space.id} hideIntro /> : null}
            {panel === "compliance" ? <SpaceComplianceSettings spaceId={space.id} hideIntro /> : null}
            {panel === "members" || panel === "invitations" ? (
              accessLoading ? (
                <p className="text-sm text-muted-foreground">{t("space.overview.menu.accessLoading")}</p>
              ) : accessError ? (
                <p className="text-sm text-destructive">{accessError}</p>
              ) : access ? (
                <SpaceSettings
                  space={access.space}
                  members={access.members}
                  invitations={access.invitations}
                  currentUserId={access.currentUserId}
                  section={panel}
                  onMutated={async () => {
                    const result = await getSpaceAccessSettings(space.id)
                    if (result.data) setAccess(result.data)
                  }}
                />
              ) : null
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={panel === "delete"} onOpenChange={(open) => !open && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("space.settings.danger.dialogTitle", undefined, { name: space.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("space.settings.danger.dialogDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          {needsConfirmation ? (
            <p className="text-sm font-medium text-destructive">{t("space.settings.members.remove.cannotUndo")}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("space.dashboard.createSpace.cancel")}</AlertDialogCancel>
            {needsConfirmation ? (
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  void handleDelete()
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={isDeleting}
              >
                {isDeleting ? t("space.settings.danger.deleting") : t("space.settings.danger.deleteConfirm")}
              </AlertDialogAction>
            ) : (
              <Button
                type="button"
                onClick={() => setNeedsConfirmation(true)}
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={isDeleting}
              >
                {t("space.settings.danger.deleteButton")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
