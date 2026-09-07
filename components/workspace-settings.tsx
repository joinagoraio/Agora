
"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { inviteUserToWorkspace, resendWorkspaceInvitation, revokeWorkspaceInvitation } from "@/lib/actions/workspace-invitation"
import { deleteWorkspace, removeWorkspaceMember, updateWorkspaceMemberRole } from "@/lib/actions/workspace"
import { updateWorkspaceMemberJob } from "@/lib/actions/guidance"
import { useRouter } from "next/navigation"
import { Trash2, Send, MoreVertical, UserMinus } from "lucide-react"
import { toast } from "sonner"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n/use-i18n"
import { UserAvatar } from "@/components/user-avatar"
import { IconTooltip } from "@/components/icon-tooltip"

interface WorkspaceSettingsProps {
  workspace: {
    id: string
    name: string
    space_id: string
  }
  space?: any
  members: any[]
  invitations: any[]
  authorityCandidates?: Array<{ userId: string; name: string; email: string }>
  currentUserId: string
  section?: "all" | "members" | "invitations"
  onMutated?: () => void
}

export function WorkspaceSettings({
  workspace,
  space: _space,
  members,
  invitations,
  authorityCandidates = [],
  currentUserId,
  section = "all",
  onMutated,
}: WorkspaceSettingsProps) {
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteFromAuthority, setInviteFromAuthority] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin" | "viewer">("member")
  const [inviteJob, setInviteJob] = useState<"author" | "reviewer">("author")
  const [isInviting, setIsInviting] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false)
  const [invitationAction, setInvitationAction] = useState<{ id: string; type: "resend" | "revoke" } | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const router = useRouter()
  const { t } = useI18n()
  const notifyMutated = () => {
    onMutated?.()
    router.refresh()
  }

  const translateRole = (role?: string | null) => {
    if (!role) return "—"
    return t(`space.common.roles.${role.toLowerCase()}`, role)
  }

  const formatStatusLabel = (status?: string | null) => {
    if (!status) return t("space.common.status.pending")
    const normalized = status.trim().toLowerCase()
    return t(`space.common.status.${normalized}`, status)
  }

  const handleDeleteWorkspace = async () => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }

    setIsDeletingWorkspace(true)
    const result = await deleteWorkspace(workspace.id)
    setIsDeletingWorkspace(false)

    if (result?.error) {
      toast.error(t("workspace.settings.danger.toastError"), { description: result.error })
      return
    }

    toast.success(t("workspace.settings.danger.toastSuccess"), {
      description: t("workspace.settings.danger.toastSuccessDescription", undefined, { name: workspace.name }),
    })
    router.push(`/spaces/${workspace.space_id}`)
  }

  const handleDeleteDialogClose = (open: boolean) => {
    if (!open) {
      setNeedsConfirmation(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = inviteEmail.trim()

    if (!email) {
      toast.error(t("workspace.settings.invitations.toastEmailRequired"), {
        description: t("workspace.settings.invitations.toastEmailDescription"),
      })
      return
    }

    setIsInviting(true)
    const result = await inviteUserToWorkspace(workspace.id, email, inviteRole, inviteJob)
    setIsInviting(false)

    if (result.error) {
      toast.error(t("workspace.settings.invitations.toastError"), { description: result.error })
      return
    }

    setInviteEmail("")
    toast.success(
      result.channel === "in_app"
        ? t("workspace.settings.invitations.toastInApp")
        : t("workspace.settings.invitations.toastSent"),
      { description: email },
    )
    notifyMutated()
  }

  const handleInviteFromAuthority = async () => {
    const selected = authorityCandidates.find((row) => row.userId === inviteFromAuthority)
    if (!selected?.email) return
    setIsInviting(true)
    const result = await inviteUserToWorkspace(workspace.id, selected.email, inviteRole, inviteJob)
    setIsInviting(false)
    if (result.error) {
      toast.error(t("workspace.settings.invitations.toastError"), { description: result.error })
      return
    }
    setInviteFromAuthority("")
    toast.success(t("workspace.settings.invitations.toastInApp"), { description: selected.name || selected.email })
    notifyMutated()
  }

  const handleRemoveMember = async (memberId: string) => {
    setRemovingMemberId(memberId)
    const result = await removeWorkspaceMember(workspace.id, memberId)
    setRemovingMemberId(null)

    if (result?.error) {
      toast.error(t("workspace.settings.members.remove.error"), { description: result.error })
      return
    }

    toast.success(t("workspace.settings.members.remove.success"), {
      description: t("workspace.settings.members.remove.successDescription"),
    })
    notifyMutated()
  }

  const handleWorkspaceRoleChange = async (userId: string, newRole: "admin" | "member" | "viewer") => {
    const result = await updateWorkspaceMemberRole(workspace.id, userId, newRole)

    if (result?.error) {
      toast.error(t("workspace.settings.members.updateRole.error"), { description: result.error })
      return
    }

    toast.success(t("workspace.settings.members.updateRole.success"), {
      description: t("workspace.settings.members.updateRole.successDescription", undefined, {
        role: translateRole(newRole),
      }),
    })
    notifyMutated()
  }

  const handleInvitationAction = async (invitation: { id: string; email: string }, type: "resend" | "revoke") => {
    setInvitationAction({ id: invitation.id, type })
    const result =
      type === "resend" ? await resendWorkspaceInvitation(invitation.id) : await revokeWorkspaceInvitation(invitation.id)

    setInvitationAction(null)

    if (result?.error) {
      toast.error(
        type === "resend"
          ? t("workspace.settings.invitations.toastResendError")
          : t("workspace.settings.invitations.toastRevokeError"),
        { description: result.error },
      )
      return
    }

    toast.success(
      type === "resend"
        ? "channel" in result && result.channel === "in_app"
          ? t("workspace.settings.invitations.toastInApp")
          : t("workspace.settings.invitations.toastResend")
        : t("workspace.settings.invitations.toastRevoke"),
      { description: invitation.email },
    )
    notifyMutated()
  }

  const handleWorkspaceJobChange = async (userId: string, nextJob: "author" | "reviewer") => {
    const result = await updateWorkspaceMemberJob(workspace.id, userId, nextJob)
    if (result?.error) {
      toast.error(t("workspace.settings.members.updateRole.error"), { description: result.error })
      return
    }
    notifyMutated()
  }

  return (
    <Tabs
      defaultValue="members"
      {...(section === "all" ? {} : { value: section })}
      className="space-y-6"
    >
      {section === "all" ? (
        <TabsList>
          <TabsTrigger value="members">{t("workspace.settings.tabs.members")}</TabsTrigger>
          <TabsTrigger value="invitations">{t("workspace.settings.tabs.invitations")}</TabsTrigger>
          <TabsTrigger value="danger">{t("workspace.settings.tabs.danger")}</TabsTrigger>
        </TabsList>
      ) : null}

      {(section === "all" || section === "members") && (
      <TabsContent value="members" className={section === "all" ? undefined : "mt-0"}>
        <Card className={section === "all" ? "shadow" : "border-0 shadow-none"}>
          {section === "all" ? (
          <CardHeader>
            <CardTitle>{t("workspace.settings.members.title")}</CardTitle>
            <CardDescription>{t("workspace.settings.members.description")}</CardDescription>
          </CardHeader>
          ) : null}
          <CardContent className={section === "all" ? undefined : "px-0"}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("workspace.settings.members.table.name")}</TableHead>
                  <TableHead>{t("workspace.settings.members.table.email")}</TableHead>
                  <TableHead>{t("workspace.settings.members.table.role")}</TableHead>
                  <TableHead>{t("guidance.jobs.workspaceJobLabel")}</TableHead>
                  <TableHead>{t("workspace.settings.members.table.joined")}</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">{t("workspace.settings.members.table.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isSpaceMember = member.source === "space"
                  const isWorkspaceMember = member.source === "workspace"
                  const canRemove = !isSpaceMember && member.user_id !== currentUserId
                  const displayRole = member.workspace_role || member.role

                  return (
                    <TableRow key={member.user_id}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <UserAvatar
                            name={member.profiles?.full_name || member.profiles?.email}
                            url={member.profiles?.avatar_url}
                            className="h-7 w-7"
                          />
                          {member.profiles?.full_name || "—"}
                        </span>
                      </TableCell>
                      <TableCell>{member.profiles?.email || "—"}</TableCell>
                      <TableCell>
                        {isWorkspaceMember ? (
                          <Select
                            value={displayRole}
                            onValueChange={(newRole) =>
                              handleWorkspaceRoleChange(member.user_id, newRole as "admin" | "member" | "viewer")
                            }
                            disabled={member.user_id === currentUserId}
                          >
                            <SelectTrigger className="w-[120px] h-8">
                              <SelectValue placeholder={t("workspace.settings.members.selectPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">{t("workspace.settings.members.selectOptions.admin")}</SelectItem>
                              <SelectItem value="member">{t("workspace.settings.members.selectOptions.member")}</SelectItem>
                              <SelectItem value="viewer">{t("workspace.settings.members.selectOptions.viewer")}</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="capitalize">{translateRole(displayRole)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={member.workspace_job === "reviewer" ? "reviewer" : "author"}
                          onValueChange={(value) =>
                            handleWorkspaceJobChange(member.user_id, value as "author" | "reviewer")
                          }
                        >
                          <SelectTrigger className="w-[120px] h-8">
                            <SelectValue placeholder={t("guidance.jobs.workspaceJobLabel")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="author">{t("guidance.jobs.author")}</SelectItem>
                            <SelectItem value="reviewer">{t("guidance.jobs.reviewer")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{new Date(member.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        {isSpaceMember ? (
                          <span className="text-xs text-muted-foreground">
                            {t("workspace.settings.members.managedInSpace")}
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMember(member.user_id)}
                            disabled={removingMemberId === member.user_id || !canRemove}
                          >
                            <UserMinus className="mr-1 h-4 w-4" />
                            {t("workspace.settings.members.remove.button")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
      )}

      {(section === "all" || section === "invitations") && (
      <TabsContent value="invitations" className={section === "all" ? undefined : "mt-0"}>
        <Card className={section === "all" ? "shadow" : "border-0 shadow-none"}>
          {section === "all" ? (
          <CardHeader>
            <CardTitle>{t("workspace.settings.invitations.title")}</CardTitle>
            <CardDescription>{t("workspace.settings.invitations.description")}</CardDescription>
          </CardHeader>
          ) : null}
          <CardContent className={section === "all" ? "space-y-6" : "space-y-6 px-0"}>
            {authorityCandidates.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">{t("workspace.settings.invitations.fromAuthorityTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("workspace.settings.invitations.fromAuthorityHint")}</p>
                <div className="flex flex-wrap gap-2">
                  <Select value={inviteFromAuthority} onValueChange={setInviteFromAuthority}>
                    <SelectTrigger className="min-w-56 flex-1">
                      <SelectValue placeholder={t("workspace.settings.invitations.fromAuthorityPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {authorityCandidates.map((candidate) => (
                        <SelectItem key={candidate.userId} value={candidate.userId}>
                          {candidate.name || candidate.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as "member" | "admin" | "viewer")}>
                    <SelectTrigger className="min-w-28">
                      <SelectValue placeholder={t("workspace.settings.members.selectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">{t("workspace.settings.members.selectOptions.viewer")}</SelectItem>
                      <SelectItem value="member">{t("workspace.settings.members.selectOptions.member")}</SelectItem>
                      <SelectItem value="admin">{t("workspace.settings.members.selectOptions.admin")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={inviteJob} onValueChange={(value) => setInviteJob(value as "author" | "reviewer")}>
                    <SelectTrigger className="min-w-32">
                      <SelectValue placeholder={t("guidance.jobs.workspaceJobLabel")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="author">{t("guidance.jobs.author")}</SelectItem>
                      <SelectItem value="reviewer">{t("guidance.jobs.reviewer")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" disabled={isInviting || !inviteFromAuthority} onClick={() => void handleInviteFromAuthority()}>
                    {t("workspace.settings.invitations.fromAuthorityButton")}
                  </Button>
                </div>
              </div>
            ) : null}
            <form onSubmit={handleInvite} className="space-y-4">
              <p className="text-sm font-medium">{t("workspace.settings.invitations.byEmailTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("workspace.settings.invitations.byEmailHint")}</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  placeholder={t("workspace.settings.invitations.emailPlaceholder")}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as "member" | "admin" | "viewer")}>
                  <SelectTrigger className="min-w-28">
                    <SelectValue placeholder={t("workspace.settings.members.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">{t("workspace.settings.members.selectOptions.viewer")}</SelectItem>
                    <SelectItem value="member">{t("workspace.settings.members.selectOptions.member")}</SelectItem>
                    <SelectItem value="admin">{t("workspace.settings.members.selectOptions.admin")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={inviteJob} onValueChange={(value) => setInviteJob(value as "author" | "reviewer")}>
                  <SelectTrigger className="min-w-32">
                    <SelectValue placeholder={t("guidance.jobs.workspaceJobLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="author">{t("guidance.jobs.author")}</SelectItem>
                    <SelectItem value="reviewer">{t("guidance.jobs.reviewer")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={isInviting}>
                  <Send className="mr-2 h-4 w-4" />
                  {t("workspace.settings.invitations.inviteButton")}
                </Button>
              </div>
            </form>

            {invitations.length > 0 && (
              <div>
                <h3 className="mb-4 font-semibold">{t("workspace.settings.invitations.pendingTitle")}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("workspace.settings.invitations.table.email")}</TableHead>
                      <TableHead>{t("workspace.settings.invitations.table.role")}</TableHead>
                      <TableHead>{t("workspace.settings.invitations.table.status")}</TableHead>
                      <TableHead>{t("workspace.settings.invitations.table.expires")}</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">{t("workspace.settings.invitations.table.actions")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell>{invite.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{translateRole(invite.role)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{formatStatusLabel(invite.status)}</Badge>
                          {invite.channel === "in_app" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("workspace.settings.invitations.waitingAccept")}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">{new Date(invite.expires_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <span className="inline-flex">
                                <IconTooltip label={t("common.tooltips.moreActions")}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label={t("workspace.settings.invitations.table.actions")}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </IconTooltip>
                              </span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleInvitationAction(invite, "resend")}
                                disabled={invitationAction?.id === invite.id && invitationAction?.type === "resend"}
                              >
                                {t("workspace.settings.invitations.resend")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleInvitationAction(invite, "revoke")}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
                                disabled={invitationAction?.id === invite.id && invitationAction?.type === "revoke"}
                              >
                                {t("workspace.settings.invitations.revoke")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      )}

      {section === "all" ? (
      <TabsContent value="danger">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-destructive">{t("workspace.settings.danger.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("workspace.settings.danger.description")}</p>
          </div>
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{t("workspace.settings.danger.deleteTitle")}</h4>
                  <p className="text-sm text-muted-foreground">{t("workspace.settings.danger.deleteDescription")}</p>
                </div>
                <AlertDialog onOpenChange={handleDeleteDialogClose}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isDeletingWorkspace}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("workspace.settings.danger.deleteButton")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("workspace.settings.danger.dialogTitle", undefined, { name: workspace.name })}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("workspace.settings.danger.dialogDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {needsConfirmation && (
                      <p className="text-sm text-destructive font-medium">
                        {t("workspace.settings.danger.cannotUndo")}
                      </p>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setNeedsConfirmation(false)} disabled={isDeletingWorkspace}>
                        {t("workspace.settings.actions.cancel")}
                      </AlertDialogCancel>
                      {needsConfirmation ? (
                        <AlertDialogAction
                          onClick={handleDeleteWorkspace}
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={isDeletingWorkspace}
                        >
                          {isDeletingWorkspace
                            ? t("workspace.settings.danger.deleting")
                            : t("workspace.settings.danger.deleteConfirm")}
                        </AlertDialogAction>
                      ) : (
                        <Button
                          onClick={() => setNeedsConfirmation(true)}
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={isDeletingWorkspace}
                        >
                          {t("workspace.settings.danger.deleteButton")}
                        </Button>
                      )}
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
      ) : null}
    </Tabs>
  )
}
