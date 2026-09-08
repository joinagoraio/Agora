"use client"

import type React from "react"

import { useState } from "react"
import {
  AuthorityDeleteImpact,
  splitAuthorityDeleteImpact,
  type AuthorityDeleteImpactData,
} from "@/components/authority-delete-impact"
import { getWorkspacesBySpace } from "@/lib/actions/workspace"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { inviteUserToSpace, resendInvitation, revokeInvitation } from "@/lib/actions/invitation"
import { deleteSpace, removeSpaceMember, updateSpaceMemberRole } from "@/lib/actions/space"
import { useRouter } from "next/navigation"
import { Trash2, Send, MoreVertical } from "lucide-react"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n/use-i18n"
import { UserAvatar } from "@/components/user-avatar"
import { IconTooltip } from "@/components/icon-tooltip"
import { SpaceComplianceSettings } from "@/components/space-compliance-settings"
import { SpaceTemplateLibrary } from "@/components/space-template-library"

interface SpaceSettingsProps {
  space: any
  members: any[]
  invitations: any[]
  currentUserId: string
  section?: "all" | "members" | "invitations" | "compliance" | "templates"
  onMutated?: () => void
}

type SpaceAccessRole = "viewer" | "member" | "admin" | "owner"

export function SpaceSettings({
  space,
  members,
  invitations,
  currentUserId,
  section = "all",
  onMutated,
}: SpaceSettingsProps) {
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<SpaceAccessRole>("member")
  const [isInviting, setIsInviting] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [invitationAction, setInvitationAction] = useState<{ id: string; type: "resend" | "revoke" } | null>(null)
  const [isDeletingSpace, setIsDeletingSpace] = useState(false)
  const [deleteImpact, setDeleteImpact] = useState<AuthorityDeleteImpactData | null>(null)
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false)
  const [deleteImpactError, setDeleteImpactError] = useState<string | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; email: string; name: string } | null>(null)
  const [needsRemoveConfirmation, setNeedsRemoveConfirmation] = useState(false)
  const [roleChangeDialog, setRoleChangeDialog] = useState<{
    isOpen: boolean
    member: { id: string; name: string; email: string; currentRole: string } | null
    newRole: SpaceAccessRole | null
  }>({ isOpen: false, member: null, newRole: null })
  const [isChangingRole, setIsChangingRole] = useState(false)
  const router = useRouter()
  const { t } = useI18n()
  const notifyMutated = () => {
    onMutated?.()
    router.refresh()
  }

  const translateRole = (role?: string | null) => {
    if (!role) return "—"
    const normalized = role.toLowerCase()
    return t(`space.common.roles.${normalized}`, role)
  }

  const translateStatus = (status?: string | null) => {
    if (!status) return t("space.common.status.pending")
    const normalized = status.trim().toLowerCase()
    return t(`space.common.status.${normalized}`, status)
  }
  
  const handleRemoveMember = async () => {
    if (!memberToRemove) return
    
    if (!needsRemoveConfirmation) {
      setNeedsRemoveConfirmation(true)
      return
    }
    
    setRemovingMemberId(memberToRemove.id)
    const result = await removeSpaceMember(space.id, memberToRemove.id)
    setRemovingMemberId(null)
    setMemberToRemove(null)
    setNeedsRemoveConfirmation(false)

    if (result?.error) {
      toast.error(t("space.settings.members.remove.error"), { description: result.error })
      return
    }

    toast.success(t("space.settings.members.remove.success"), {
      description: t("space.settings.members.remove.successDescription"),
    })
    notifyMutated()
  }

  const handleRemoveDialogClose = (open: boolean) => {
    if (!open) {
      setNeedsRemoveConfirmation(false)
      setMemberToRemove(null)
    }
  }


  const handleDeleteSpace = async () => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    
    setIsDeletingSpace(true)
    const result = await deleteSpace(space.id)
    setIsDeletingSpace(false)

    if (result?.error) {
      toast.error(t("space.settings.danger.toastError"), { description: result.error })
      return
    }

    toast.success(t("space.settings.danger.toastSuccess"), {
      description: t("space.settings.danger.toastSuccessDescription", undefined, { name: space.name }),
    })
    router.push("/dashboard")
  }

  const handleDeleteDialogClose = (open: boolean) => {
    setNeedsConfirmation(false)
    if (!open) {
      setDeleteImpact(null)
      setDeleteImpactError(null)
      setDeleteImpactLoading(false)
      return
    }
    setDeleteImpactLoading(true)
    setDeleteImpactError(null)
    void getWorkspacesBySpace(space.id).then((result) => {
      setDeleteImpactLoading(false)
      if (result.error) {
        setDeleteImpactError(t("space.settings.danger.programmesError"))
        return
      }
      setDeleteImpact(splitAuthorityDeleteImpact(result.data ?? []))
    })
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = inviteEmail.trim()

    if (!email) {
      toast.error(t("space.settings.invitations.toastEmailRequired"), {
        description: t("space.settings.invitations.toastEmailDescription"),
      })
      return
    }

    setIsInviting(true)
    const result = await inviteUserToSpace(space.id, email, inviteRole)
    setIsInviting(false)

    if (result.error) {
      toast.error(t("space.settings.invitations.toastError"), { description: result.error })
      return
    }

    setInviteEmail("")
    toast.success(
      result.emailSkipped
        ? t("space.settings.invitations.toastSentNoEmail")
        : t("space.settings.invitations.toastSent"),
      { description: email },
    )
    notifyMutated()
  }

  const handleInvitationAction = async (invitation: { id: string; email: string }, type: "resend" | "revoke") => {
    setInvitationAction({ id: invitation.id, type })
    const result =
      type === "resend" ? await resendInvitation(invitation.id) : await revokeInvitation(invitation.id)

    setInvitationAction(null)

    if (result?.error) {
      toast.error(
        type === "resend"
          ? t("space.settings.invitations.toastResendError")
          : t("space.settings.invitations.toastRevokeError"),
        {
          description: result.error,
        },
      )
      return
    }

    toast.success(type === "resend" ? t("space.settings.invitations.toastResend") : t("space.settings.invitations.toastRevoke"), {
      description: invitation.email,
    })
    notifyMutated()
  }

  const handleRoleChangeRequest = (
    member: { user_id: string; role: string; profiles: any },
    newRole: SpaceAccessRole
  ) => {
    setRoleChangeDialog({
      isOpen: true,
      member: {
        id: member.user_id,
        name: member.profiles?.full_name || "Unknown",
        email: member.profiles?.email || "Unknown",
        currentRole: member.role,
      },
      newRole,
    })
  }

  const handleRoleChangeConfirm = async () => {
    if (!roleChangeDialog.member || !roleChangeDialog.newRole) return

    setIsChangingRole(true)
    const result = await updateSpaceMemberRole(space.id, roleChangeDialog.member.id, roleChangeDialog.newRole)
    setIsChangingRole(false)

    if (result?.error) {
      toast.error(t("space.settings.roleDialog.toastError"), { description: result.error })
      return
    }

    toast.success(t("space.settings.roleDialog.toastSuccess"), {
      description: t("space.settings.roleDialog.toastSuccessDescription", undefined, {
        name: roleChangeDialog.member.name,
        role: translateRole(roleChangeDialog.newRole),
      }),
    })
    setRoleChangeDialog({ isOpen: false, member: null, newRole: null })
    notifyMutated()
  }

  const formatStatusLabel = (status?: string | null) => translateStatus(status)

  const ownerCount = members.filter((member) => member.role === "owner").length
  const currentRole = members.find((member) => member.user_id === currentUserId)?.role
  const canDeleteAuthority = currentRole === "owner"

  return (
    <>
    <Tabs
      defaultValue="members"
      {...(section === "all" ? {} : { value: section })}
      className="flex min-h-0 flex-1 flex-col gap-6"
    >
      {section === "all" ? (
      <TabsList className="shrink-0">
        <TabsTrigger value="members">{t("space.settings.tabs.members")}</TabsTrigger>
        <TabsTrigger value="invitations">{t("space.settings.tabs.invitations")}</TabsTrigger>
        <TabsTrigger value="compliance">{t("space.settings.tabs.compliance")}</TabsTrigger>
        <TabsTrigger value="templates">{t("space.settings.tabs.templates")}</TabsTrigger>
        {canDeleteAuthority && (
          <TabsTrigger value="danger">{t("space.settings.tabs.danger")}</TabsTrigger>
        )}
      </TabsList>
      ) : null}

      {(section === "all" || section === "members") && (
      <TabsContent value="members" className={section === "all" ? "min-h-0 flex-1 overflow-y-auto" : "mt-0"}>
        <div className="space-y-4">
          {section === "all" ? (
          <div>
            <h2 className="text-lg font-medium">{t("space.settings.members.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("space.settings.members.description")}</p>
          </div>
          ) : null}
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("space.settings.members.table.name")}</TableHead>
                  <TableHead>{t("space.settings.members.table.email")}</TableHead>
                  <TableHead>{t("space.settings.members.table.role")}</TableHead>
                  <TableHead>{t("space.settings.members.table.joined")}</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">{t("space.settings.members.table.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
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
                    <TableCell>{member.profiles?.email}</TableCell>
                    <TableCell>
                      {member.user_id === currentUserId || (member.role === "owner" && ownerCount <= 1) ? (
                        <Badge>{translateRole(member.role)}</Badge>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChangeRequest(member, value as SpaceAccessRole)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder={t("space.settings.members.selectPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">{t("space.settings.members.selectOptions.viewer")}</SelectItem>
                            <SelectItem value="member">{t("space.settings.members.selectOptions.member")}</SelectItem>
                            <SelectItem value="admin">{t("space.settings.members.selectOptions.admin")}</SelectItem>
                            <SelectItem value="owner">{t("space.settings.members.selectOptions.owner")}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>{new Date(member.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {member.user_id === currentUserId || (member.role === "owner" && ownerCount <= 1) ? null : (
                        <AlertDialog onOpenChange={handleRemoveDialogClose}>
                          <IconTooltip label={t("space.settings.members.remove.button")}>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-foreground hover:bg-transparent hover:text-destructive"
                                onClick={() =>
                                  setMemberToRemove({
                                    id: member.user_id,
                                    email: member.profiles?.email || "Unknown",
                                    name: member.profiles?.full_name || "Unknown",
                                  })
                                }
                                disabled={removingMemberId === member.user_id}
                                aria-label={t("space.settings.members.remove.button")}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                          </IconTooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("space.settings.members.remove.dialogTitle", undefined, {
                                  name: memberToRemove?.name || t("space.settings.members.remove.button"),
                                })}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("space.settings.members.remove.dialogDescription", undefined, {
                                  email: memberToRemove?.email || "",
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            {needsRemoveConfirmation && (
                              <p className="text-sm text-destructive font-medium">
                                {t("space.settings.members.remove.cannotUndo")}
                              </p>
                            )}
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => {
                                setMemberToRemove(null)
                                setNeedsRemoveConfirmation(false)
                              }} disabled={removingMemberId === memberToRemove?.id}>
                                {t("space.dashboard.createSpace.cancel")}
                              </AlertDialogCancel>
                              {needsRemoveConfirmation ? (
                                <AlertDialogAction
                                  onClick={handleRemoveMember}
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                  disabled={removingMemberId === memberToRemove?.id}
                                >
                                  {removingMemberId === memberToRemove?.id
                                    ? t("space.settings.members.remove.removing")
                                    : t("space.settings.members.remove.confirm")}
                                </AlertDialogAction>
                              ) : (
                                <Button
                                  onClick={() => setNeedsRemoveConfirmation(true)}
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                  disabled={removingMemberId === memberToRemove?.id}
                                >
                                  {t("space.settings.members.remove.label")}
                                </Button>
                              )}
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </div>
      </TabsContent>
      )}

      {(section === "all" || section === "invitations") && (
      <TabsContent value="invitations" className={section === "all" ? "min-h-0 flex-1 overflow-y-auto" : "mt-0"}>
        <div className="space-y-4">
          {section === "all" ? (
          <div>
            <h2 className="text-lg font-medium">{t("space.settings.invitations.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("space.settings.invitations.description")}</p>
          </div>
          ) : null}
          <div className="space-y-6">
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  placeholder={t("space.settings.invitations.emailPlaceholder")}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Select
                  value={inviteRole}
                  onValueChange={(value) => setInviteRole(value as SpaceAccessRole)}
                >
                  <SelectTrigger className="min-w-28">
                    <SelectValue placeholder={t("space.settings.members.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">{t("space.settings.members.selectOptions.viewer")}</SelectItem>
                    <SelectItem value="member">{t("space.settings.members.selectOptions.member")}</SelectItem>
                    <SelectItem value="admin">{t("space.settings.members.selectOptions.admin")}</SelectItem>
                    <SelectItem value="owner">{t("space.settings.members.selectOptions.owner")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={isInviting}>
                  <Send className="mr-2 h-4 w-4" />
                  {t("space.settings.invitations.inviteButton")}
                </Button>
              </div>
            </form>

            {invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("space.settings.invitations.empty")}</p>
            ) : (
              <div>
                {section === "all" ? (
                  <h3 className="mb-4 font-semibold">{t("space.settings.invitations.pendingTitle")}</h3>
                ) : null}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("space.settings.invitations.table.email")}</TableHead>
                      <TableHead>{t("space.settings.invitations.table.role")}</TableHead>
                      <TableHead>{t("space.settings.invitations.table.status")}</TableHead>
                      <TableHead>{t("space.settings.invitations.table.expires")}</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">{t("space.settings.invitations.table.actions")}</span>
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
                        </TableCell>
                        <TableCell className="text-sm">{new Date(invite.expires_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <span className="inline-flex">
                                <IconTooltip label={t("common.tooltips.moreActions")}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("space.settings.invitations.table.actions")}>
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </IconTooltip>
                              </span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleInvitationAction(invite, "resend")}
                                disabled={
                                  invitationAction?.id === invite.id && invitationAction?.type === "resend"
                                }
                              >
                                {t("space.settings.invitations.resend")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleInvitationAction(invite, "revoke")}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
                                disabled={
                                  invitationAction?.id === invite.id && invitationAction?.type === "revoke"
                                }
                              >
                                {t("space.settings.invitations.revoke")}
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
          </div>
        </div>
      </TabsContent>
      )}

      {(section === "all" || section === "compliance") && (
      <TabsContent value="compliance" className={section === "all" ? "min-h-0 flex-1 overflow-y-auto" : "mt-0"}>
        <SpaceComplianceSettings spaceId={space.id} hideIntro={section !== "all"} />
      </TabsContent>
      )}

      {(section === "all" || section === "templates") && (
      <TabsContent value="templates" className={section === "all" ? "min-h-0 flex-1 overflow-y-auto" : "mt-0"}>
        <SpaceTemplateLibrary spaceId={space.id} hideIntro={section !== "all"} />
      </TabsContent>
      )}

      {section === "all" && canDeleteAuthority && (
      <TabsContent value="danger" className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-destructive">{t("space.settings.danger.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("space.settings.danger.description")}</p>
          </div>
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{t("space.settings.danger.deleteTitle")}</h4>
                  <p className="text-sm text-muted-foreground">{t("space.settings.danger.deleteDescription")}</p>
                </div>
                <AlertDialog onOpenChange={handleDeleteDialogClose}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isDeletingSpace}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("space.settings.danger.deleteButton")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("space.settings.danger.dialogTitle", undefined, { name: space.name })}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("space.settings.danger.dialogDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AuthorityDeleteImpact
                      loading={deleteImpactLoading}
                      error={deleteImpactError}
                      impact={deleteImpact}
                    />
                    {needsConfirmation && (
                      <p className="text-sm text-destructive font-medium">
                        {t("space.settings.members.remove.cannotUndo")}
                      </p>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setNeedsConfirmation(false)} disabled={isDeletingSpace}>
                        {t("space.dashboard.createSpace.cancel")}
                      </AlertDialogCancel>
                      {needsConfirmation ? (
                        <AlertDialogAction
                          onClick={handleDeleteSpace}
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={isDeletingSpace}
                        >
                          {isDeletingSpace
                            ? t("space.settings.danger.deleting")
                            : t("space.settings.danger.deleteConfirm")}
                        </AlertDialogAction>
                      ) : (
                        <Button
                          onClick={() => setNeedsConfirmation(true)}
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={isDeletingSpace}
                        >
                          {t("space.settings.danger.deleteButton")}
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
      )}
    </Tabs>

    <AlertDialog
      open={roleChangeDialog.isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setRoleChangeDialog({ isOpen: false, member: null, newRole: null })
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("space.settings.roleDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("space.settings.roleDialog.description", undefined, {
              name: roleChangeDialog.member?.name ?? "",
              email: roleChangeDialog.member?.email ?? "",
            })}{" "}
            <strong>{translateRole(roleChangeDialog.member?.currentRole)}</strong> →{" "}
            <strong>{translateRole(roleChangeDialog.newRole)}</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="text-sm text-muted-foreground space-y-2">
          {roleChangeDialog.newRole === "viewer" && (
            <p>{t("space.settings.roleDialog.viewer")}</p>
          )}
          {roleChangeDialog.newRole === "member" && (
            <p>{t("space.settings.roleDialog.member")}</p>
          )}
          {roleChangeDialog.newRole === "admin" && (
            <p>{t("space.settings.roleDialog.admin")}</p>
          )}
          {roleChangeDialog.newRole === "owner" && (
            <p>{t("space.settings.roleDialog.owner")}</p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isChangingRole}>{t("space.settings.roleDialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleRoleChangeConfirm} disabled={isChangingRole}>
            {isChangingRole ? t("space.settings.roleDialog.confirming") : t("space.settings.roleDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
