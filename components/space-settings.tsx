"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { inviteUserToSpace, resendInvitation, revokeInvitation } from "@/lib/actions/invitation"
import { deleteSpace, removeSpaceMember, updateSpaceMemberRole } from "@/lib/actions/space"
import { updateSpaceMemberJob } from "@/lib/actions/guidance"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n/use-i18n"
import { SpaceComplianceSettings } from "@/components/space-compliance-settings"
import { SpaceTemplateLibrary } from "@/components/space-template-library"
import { SpaceAgentAdmin } from "@/components/space-agent-admin"

interface SpaceSettingsProps {
  space: any
  members: any[]
  invitations: any[]
  currentUserId: string
}

export function SpaceSettings({ space, members, invitations, currentUserId }: SpaceSettingsProps) {
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin" | "viewer">("member")
  const [inviteJob, setInviteJob] = useState<"administrator" | "none">("none")
  const [isInviting, setIsInviting] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [invitationAction, setInvitationAction] = useState<{ id: string; type: "resend" | "revoke" } | null>(null)
  const [isDeletingSpace, setIsDeletingSpace] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; email: string; name: string } | null>(null)
  const [needsRemoveConfirmation, setNeedsRemoveConfirmation] = useState(false)
  const [roleChangeDialog, setRoleChangeDialog] = useState<{
    isOpen: boolean
    member: { id: string; name: string; email: string; currentRole: string } | null
    newRole: "admin" | "member" | "viewer" | null
  }>({ isOpen: false, member: null, newRole: null })
  const [isChangingRole, setIsChangingRole] = useState(false)
  const router = useRouter()
  const { t } = useI18n()

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
    router.refresh()
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
    const result = await inviteUserToSpace(space.id, email, inviteRole, inviteJob)
    setIsInviting(false)

    if (result.error) {
      toast.error(t("space.settings.invitations.toastError"), { description: result.error })
      return
    }

    setInviteEmail("")
    toast.success(t("space.settings.invitations.toastSent"), { description: email })
    router.refresh()
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
    router.refresh()
  }

  const handleRoleChangeRequest = (
    member: { user_id: string; role: string; profiles: any },
    newRole: "admin" | "member" | "viewer"
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
    router.refresh()
  }

  const handleJobChange = async (memberUserId: string, nextJob: "administrator" | "none") => {
    const result = await updateSpaceMemberJob(space.id, memberUserId, nextJob)
    if (result?.error) {
      toast.error(t("guidance.jobs.lastAdministrator"), { description: result.error })
      return
    }
    router.refresh()
  }

  const formatStatusLabel = (status?: string | null) => translateStatus(status)

  return (
    <>
    <Tabs defaultValue="members" className="space-y-6">
      <TabsList>
        <TabsTrigger value="members">{t("space.settings.tabs.members")}</TabsTrigger>
        <TabsTrigger value="invitations">{t("space.settings.tabs.invitations")}</TabsTrigger>
        <TabsTrigger value="compliance">{t("space.settings.tabs.compliance")}</TabsTrigger>
        <TabsTrigger value="templates">{t("space.settings.tabs.templates")}</TabsTrigger>
        <TabsTrigger value="agents">{t("space.settings.tabs.agents")}</TabsTrigger>
        <TabsTrigger value="danger">{t("space.settings.tabs.danger")}</TabsTrigger>
      </TabsList>

      <TabsContent value="members">
        <Card className="shadow">
          <CardHeader>
            <CardTitle>{t("space.settings.members.title")}</CardTitle>
            <CardDescription>{t("space.settings.members.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("space.settings.members.table.name")}</TableHead>
                  <TableHead>{t("space.settings.members.table.email")}</TableHead>
                  <TableHead>{t("space.settings.members.table.role")}</TableHead>
                  <TableHead>{t("guidance.jobs.spaceJobLabel")}</TableHead>
                  <TableHead>{t("space.settings.members.table.joined")}</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">{t("space.settings.members.table.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.profiles?.full_name || "—"}</TableCell>
                    <TableCell>{member.profiles?.email}</TableCell>
                    <TableCell>
                      {member.role === "owner" || member.user_id === currentUserId ? (
                        <Badge>{translateRole(member.role)}</Badge>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChangeRequest(member, value as "admin" | "member" | "viewer")}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder={t("space.settings.members.selectPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">{t("space.settings.members.selectOptions.viewer")}</SelectItem>
                            <SelectItem value="member">{t("space.settings.members.selectOptions.member")}</SelectItem>
                            <SelectItem value="admin">{t("space.settings.members.selectOptions.admin")}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={member.job === "administrator" ? "administrator" : "none"}
                        onValueChange={(value) => handleJobChange(member.user_id, value as "administrator" | "none")}
                        disabled={member.role === "owner"}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="administrator">{t("guidance.jobs.administrator")}</SelectItem>
                          <SelectItem value="none">{t("guidance.jobs.none")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{new Date(member.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {member.user_id === currentUserId || member.role === "owner" ? null : (
                        <AlertDialog onOpenChange={handleRemoveDialogClose}>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() =>
                                setMemberToRemove({
                                  id: member.user_id,
                                  email: member.profiles?.email || "Unknown",
                                  name: member.profiles?.full_name || "Unknown",
                                })
                              }
                              disabled={removingMemberId === member.user_id}
                            >
                              <UserMinus className="mr-1 h-4 w-4" />
                              {t("space.settings.members.remove.button")}
                            </Button>
                          </AlertDialogTrigger>
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
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="invitations">
        <Card className="shadow">
          <CardHeader>
            <CardTitle>{t("space.settings.invitations.title")}</CardTitle>
            <CardDescription>{t("space.settings.invitations.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleInvite} className="space-y-4">
              <p className="text-xs text-muted-foreground">{t("guidance.jobs.accessHint")}</p>
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
                  onValueChange={(value) => {
                    const role = value as "member" | "admin" | "viewer"
                    setInviteRole(role)
                    setInviteJob(role === "admin" ? "administrator" : "none")
                  }}
                >
                  <SelectTrigger className="min-w-28">
                    <SelectValue placeholder={t("space.settings.members.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">{t("space.settings.members.selectOptions.viewer")}</SelectItem>
                    <SelectItem value="member">{t("space.settings.members.selectOptions.member")}</SelectItem>
                    <SelectItem value="admin">{t("space.settings.members.selectOptions.admin")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={inviteJob} onValueChange={(value) => setInviteJob(value as "administrator" | "none")}>
                  <SelectTrigger className="min-w-36">
                    <SelectValue placeholder={t("guidance.jobs.spaceJobLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("guidance.jobs.none")}</SelectItem>
                    <SelectItem value="administrator">{t("guidance.jobs.administrator")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={isInviting}>
                  <Send className="mr-2 h-4 w-4" />
                  {t("space.settings.invitations.inviteButton")}
                </Button>
              </div>
            </form>

            {invitations.length > 0 && (
              <div>
                <h3 className="mb-4 font-semibold">{t("space.settings.invitations.title")}</h3>
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
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("space.settings.invitations.table.actions")}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
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
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="compliance">
        <SpaceComplianceSettings spaceId={space.id} />
      </TabsContent>

      <TabsContent value="templates">
        <SpaceTemplateLibrary spaceId={space.id} />
      </TabsContent>

      <TabsContent value="agents">
        <SpaceAgentAdmin spaceId={space.id} />
      </TabsContent>

      <TabsContent value="danger">
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
