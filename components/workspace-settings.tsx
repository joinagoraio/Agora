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

interface WorkspaceSettingsProps {
  workspace: {
    id: string
    name: string
    space_id: string
  }
  space: any
  members: any[]
  invitations: any[]
  currentUserId: string
}

export function WorkspaceSettings({ workspace, space, members, invitations, currentUserId }: WorkspaceSettingsProps) {
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin" | "viewer">("member")
  const [isInviting, setIsInviting] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false)
  const [invitationAction, setInvitationAction] = useState<{ id: string; type: "resend" | "revoke" } | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const router = useRouter()

  const formatStatusLabel = (status?: string | null) => {
    const normalized = status?.trim()
    if (!normalized) return "Pending"
    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
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
      toast.error("Failed to delete workspace", { description: result.error })
      return
    }

    toast.success("Workspace deleted", { description: `${workspace.name} has been removed.` })
    router.push(`/spaces/${workspace.space_id}`)
  }

  const handleDeleteDialogClose = (open: boolean) => {
    setNeedsConfirmation(false)
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = inviteEmail.trim()

    if (!email) {
      toast.error("Email required", { description: "Please enter who you want to invite." })
      return
    }

    setIsInviting(true)
    const result = await inviteUserToWorkspace(workspace.id, email, inviteRole)
    setIsInviting(false)

    if (result.error) {
      toast.error("Invitation failed", { description: result.error })
      return
    }

    setInviteEmail("")
    toast.success("Invitation sent", { description: `Sent to ${email}.` })
    router.refresh()
  }

  const handleRemoveMember = async (memberId: string) => {
    setRemovingMemberId(memberId)
    const result = await removeWorkspaceMember(workspace.id, memberId)
    setRemovingMemberId(null)

    if (result?.error) {
      toast.error("Failed to remove member", { description: result.error })
      return
    }

    toast.success("Member removed", { description: "They no longer have access to this workspace." })
    router.refresh()
  }

  const handleWorkspaceRoleChange = async (userId: string, newRole: "admin" | "member" | "viewer") => {
    const result = await updateWorkspaceMemberRole(workspace.id, userId, newRole)

    if (result?.error) {
      toast.error("Failed to update role", { description: result.error })
      return
    }

    toast.success("Role updated", { description: `Member role has been changed to ${newRole}.` })
    router.refresh()
  }

  const handleInvitationAction = async (invitation: { id: string; email: string }, type: "resend" | "revoke") => {
    setInvitationAction({ id: invitation.id, type })
    const result =
      type === "resend" ? await resendWorkspaceInvitation(invitation.id) : await revokeWorkspaceInvitation(invitation.id)

    setInvitationAction(null)

    if (result?.error) {
      toast.error(`Failed to ${type === "resend" ? "resend" : "revoke"} invitation`, {
        description: result.error,
      })
      return
    }

    toast.success(
      type === "resend" ? "Invitation resent" : "Invitation revoked",
      { description: `${invitation.email}` },
    )
    router.refresh()
  }

  return (
    <Tabs defaultValue="members" className="space-y-6">
      <TabsList>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="invitations">Invitations</TabsTrigger>
        <TabsTrigger value="danger">Danger Zone</TabsTrigger>
      </TabsList>

      <TabsContent value="members">
        <Card className="shadow">
          <CardHeader>
            <CardTitle>Workspace Members</CardTitle>
            <CardDescription>
              All users with access to this workspace, including space members and direct workspace invitations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
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
                      <TableCell>{member.profiles?.full_name || "—"}</TableCell>
                      <TableCell>{member.profiles?.email || "—"}</TableCell>
                      <TableCell>
                        {isWorkspaceMember && (
                          <Select
                            value={displayRole}
                            onValueChange={(newRole) => handleWorkspaceRoleChange(member.user_id, newRole as "admin" | "member" | "viewer")}
                            disabled={member.user_id === currentUserId}
                          >
                            <SelectTrigger className="w-[120px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {isSpaceMember && (
                          <span className="capitalize">{displayRole}</span>
                        )}
                      </TableCell>
                      <TableCell>{new Date(member.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        {isSpaceMember ? (
                          <span className="text-xs text-muted-foreground">
                            Managed in Space
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
                            Remove
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

      <TabsContent value="invitations">
        <Card className="shadow">
          <CardHeader>
            <CardTitle>Invite Workspace Members</CardTitle>
            <CardDescription>Send invitations to join this workspace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as "member" | "admin" | "viewer")}>
                  <SelectTrigger className="min-w-28">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={isInviting}>
                  <Send className="mr-2 h-4 w-4" />
                  Invite
                </Button>
              </div>
            </form>

            {invitations.length > 0 && (
              <div>
                <h3 className="mb-4 font-semibold">Pending Invitations</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell>{invite.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{invite.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{formatStatusLabel(invite.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{new Date(invite.expires_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Invitation actions">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleInvitationAction(invite, "resend")}
                                disabled={invitationAction?.id === invite.id && invitationAction?.type === "resend"}
                              >
                                Resend invitation
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleInvitationAction(invite, "revoke")}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
                                disabled={invitationAction?.id === invite.id && invitationAction?.type === "revoke"}
                              >
                                Revoke invitation
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

      <TabsContent value="danger">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-destructive">Danger Zone</h3>
            <p className="text-sm text-muted-foreground">Irreversible actions that affect this workspace</p>
          </div>
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Delete Workspace</h4>
                  <p className="text-sm text-muted-foreground">Permanently delete this workspace and all its data</p>
                </div>
                <AlertDialog onOpenChange={handleDeleteDialogClose}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isDeletingWorkspace}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Workspace
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {workspace.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete all documents and conversations in this workspace.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {needsConfirmation && (
                      <p className="text-sm text-destructive font-medium">
                        This action cannot be undone.
                      </p>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setNeedsConfirmation(false)} disabled={isDeletingWorkspace}>
                        Cancel
                      </AlertDialogCancel>
                      {needsConfirmation ? (
                        <AlertDialogAction
                          onClick={handleDeleteWorkspace}
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={isDeletingWorkspace}
                        >
                          {isDeletingWorkspace ? "Deleting..." : "Confirm?"}
                        </AlertDialogAction>
                      ) : (
                        <Button
                          onClick={() => setNeedsConfirmation(true)}
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={isDeletingWorkspace}
                        >
                          Delete Workspace
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
  )
}
