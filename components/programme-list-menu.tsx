"use client"

import { useEffect, useState, type FormEvent } from "react"
import { FilePenLine, Mail, MoreVertical, PencilLine, Trash2, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { WorkspaceSettings } from "@/components/workspace-settings"
import { useI18n } from "@/lib/i18n/use-i18n"
import { deleteWorkspace, getWorkspaceAccessSettings, updateWorkspace } from "@/lib/actions/workspace"

export type ProgrammeAccessPanel = "rename" | "edit" | "members" | "invitations" | "delete" | null

type AccessData = {
  workspace: { id: string; name: string; space_id: string }
  members: any[]
  invitations: any[]
  authorityCandidates?: Array<{ userId: string; name: string; email: string }>
  currentUserId: string
}

export function ProgrammeAccessMenuItems({
  onPick,
}: {
  onPick: (panel: Exclude<ProgrammeAccessPanel, null>) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <DropdownMenuItem onSelect={() => onPick("edit")}>
        <FilePenLine className="h-4 w-4" />
        {t("space.workspaces.menuEdit")}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onPick("rename")}>
        <PencilLine className="h-4 w-4" />
        {t("space.workspaces.menuRename")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onPick("members")} data-guidance-target="programme-members">
        <Users className="h-4 w-4" />
        {t("space.workspaces.menuMembers")}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onPick("invitations")}>
        <Mail className="h-4 w-4" />
        {t("space.workspaces.menuInvitations")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => onPick("delete")}>
        <Trash2 className="h-4 w-4" />
        {t("space.workspaces.menuDelete")}
      </DropdownMenuItem>
    </>
  )
}

export function ProgrammeAccessDialogs({
  workspace,
  panel,
  onClose,
  onDeleted,
}: {
  workspace: { id: string; name: string; summary?: string | null; description?: string | null }
  panel: ProgrammeAccessPanel
  onClose: () => void
  onDeleted?: () => void
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [name, setName] = useState(workspace.name)
  const [summary, setSummary] = useState(workspace.summary ?? "")
  const [description, setDescription] = useState(workspace.description ?? "")
  const [isRenaming, setIsRenaming] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [access, setAccess] = useState<AccessData | null>(null)
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)

  useEffect(() => {
    if (panel === "rename") {
      setName(workspace.name)
      setRenameError(null)
    }
    if (panel === "edit") {
      setSummary(workspace.summary ?? "")
      setDescription(workspace.description ?? "")
      setEditError(null)
    }
    if (panel === "delete") setNeedsConfirmation(false)
  }, [panel, workspace.name, workspace.summary, workspace.description])

  useEffect(() => {
    if (panel !== "members" && panel !== "invitations") return
    let cancelled = false
    setAccessLoading(true)
    setAccessError(null)
    void getWorkspaceAccessSettings(workspace.id).then((result) => {
      if (cancelled) return
      setAccessLoading(false)
      if (result.error || !result.data) {
        setAccess(null)
        setAccessError(result.error || t("space.workspaces.accessError"))
        return
      }
      setAccess(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [panel, workspace.id, t])

  const handleRename = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.replace(/\s+/g, " ").trim()
    if (!trimmed) {
      setRenameError(t("space.workspaces.dialog.errorRequired"))
      return
    }
    setIsRenaming(true)
    setRenameError(null)
    const result = await updateWorkspace(workspace.id, trimmed)
    setIsRenaming(false)
    if (result.error) {
      setRenameError(result.error)
      toast.error(t("space.workspaces.rename.toastError"), { description: result.error })
      return
    }
    toast.success(t("space.workspaces.rename.toastSuccess"))
    onClose()
    router.refresh()
  }

  const handleEdit = async (event: FormEvent) => {
    event.preventDefault()
    setIsEditing(true)
    setEditError(null)
    const result = await updateWorkspace(
      workspace.id,
      workspace.name,
      description.trim() || null,
      undefined,
      undefined,
      summary.trim() || null,
    )
    setIsEditing(false)
    if (result.error) {
      setEditError(result.error)
      toast.error(t("space.workspaces.edit.toastError"), { description: result.error })
      return
    }
    toast.success(t("space.workspaces.edit.toastSuccess"))
    onClose()
    router.refresh()
  }

  const handleDelete = async () => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    setIsDeleting(true)
    const result = await deleteWorkspace(workspace.id)
    setIsDeleting(false)
    if (result?.error) {
      toast.error(t("workspace.settings.danger.toastError"), { description: result.error })
      return
    }
    toast.success(t("workspace.settings.danger.toastSuccess"), {
      description: t("workspace.settings.danger.toastSuccessDescription", undefined, { name: workspace.name }),
    })
    onClose()
    if (onDeleted) onDeleted()
    else router.refresh()
  }

  return (
    <>
      <Dialog open={panel === "rename"} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <form onSubmit={handleRename} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("space.workspaces.rename.title")}</DialogTitle>
              <DialogDescription>{t("space.workspaces.rename.description")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`rename-${workspace.id}`}>{t("space.workspaces.dialog.nameLabel")}</Label>
              <Input
                id={`rename-${workspace.id}`}
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  if (renameError) setRenameError(null)
                }}
                autoFocus
              />
              {renameError ? <p className="text-sm text-destructive">{renameError}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isRenaming}>
                {t("space.workspaces.dialog.cancel")}
              </Button>
              <Button type="submit" disabled={isRenaming || name.trim().length === 0}>
                {isRenaming ? t("space.workspaces.rename.saving") : t("space.workspaces.rename.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === "edit"} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <form onSubmit={handleEdit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("space.workspaces.edit.title")}</DialogTitle>
              <DialogDescription>{t("space.workspaces.edit.description")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`edit-summary-${workspace.id}`}>{t("workspace.overview.edit.summaryLabel")}</Label>
              <Textarea
                id={`edit-summary-${workspace.id}`}
                value={summary}
                onChange={(event) => {
                  setSummary(event.target.value)
                  if (editError) setEditError(null)
                }}
                placeholder={t("workspace.overview.edit.summaryPlaceholder")}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-description-${workspace.id}`}>{t("workspace.overview.edit.descriptionLabel")}</Label>
              <Textarea
                id={`edit-description-${workspace.id}`}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value)
                  if (editError) setEditError(null)
                }}
                placeholder={t("workspace.overview.edit.descriptionPlaceholder")}
                rows={5}
              />
              {editError ? <p className="text-sm text-destructive">{editError}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isEditing}>
                {t("space.workspaces.dialog.cancel")}
              </Button>
              <Button type="submit" disabled={isEditing}>
                {isEditing ? t("space.workspaces.edit.saving") : t("space.workspaces.edit.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === "members" || panel === "invitations"} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {panel === "invitations"
                ? t("workspace.settings.invitations.title")
                : t("workspace.settings.members.title")}
            </DialogTitle>
            <DialogDescription>
              {panel === "invitations"
                ? t("workspace.settings.invitations.description")
                : t("workspace.settings.members.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {accessLoading ? (
              <p className="text-sm text-muted-foreground">{t("space.workspaces.accessLoading")}</p>
            ) : accessError ? (
              <p className="text-sm text-destructive">{accessError}</p>
            ) : access && (panel === "members" || panel === "invitations") ? (
              <WorkspaceSettings
                workspace={access.workspace}
                members={access.members}
                invitations={access.invitations}
                authorityCandidates={access.authorityCandidates}
                currentUserId={access.currentUserId}
                section={panel}
                onMutated={async () => {
                  const result = await getWorkspaceAccessSettings(workspace.id)
                  if (result.data) setAccess(result.data)
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={panel === "delete"} onOpenChange={(open) => !open && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.settings.danger.dialogTitle", undefined, { name: workspace.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.settings.danger.dialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsConfirmation ? (
            <p className="text-sm font-medium text-destructive">{t("workspace.settings.danger.cannotUndo")}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("workspace.settings.actions.cancel")}</AlertDialogCancel>
            {needsConfirmation ? (
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  void handleDelete()
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={isDeleting}
              >
                {isDeleting ? t("workspace.settings.danger.deleting") : t("workspace.settings.danger.deleteConfirm")}
              </AlertDialogAction>
            ) : (
              <Button
                type="button"
                onClick={() => setNeedsConfirmation(true)}
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={isDeleting}
              >
                {t("workspace.settings.danger.deleteButton")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function ProgrammeListMenu({
  workspace,
  canManage,
}: {
  workspace: { id: string; name: string }
  canManage: boolean
}) {
  const { t } = useI18n()
  const [panel, setPanel] = useState<ProgrammeAccessPanel>(null)
  if (!canManage) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("space.workspaces.dropdownMenuSr")}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <ProgrammeAccessMenuItems onPick={setPanel} />
        </DropdownMenuContent>
      </DropdownMenu>
      <ProgrammeAccessDialogs workspace={workspace} panel={panel} onClose={() => setPanel(null)} />
    </>
  )
}
