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
import { deleteSpace, removeSpaceMember } from "@/lib/actions/space"
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

interface SpaceSettingsProps {
  space: any
  members: any[]
  invitations: any[]
  currentUserId: string
}

export function SpaceSettings({ space, members, invitations, currentUserId }: SpaceSettingsProps) {
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin" | "viewer">("member")
  const [isInviting, setIsInviting] = useState(false)
  const [inviteLinkInfo, setInviteLinkInfo] = useState<{ link: string; email: string } | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [invitationAction, setInvitationAction] = useState<{ id: string; type: "resend" | "revoke" } | null>(null)
  const [isDeletingSpace, setIsDeletingSpace] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const router = useRouter()
  const handleRemoveMember = async (memberId: string) => {
    setRemovingMemberId(memberId)
    const result = await removeSpaceMember(space.id, memberId)
    setRemovingMemberId(null)

    if (result?.error) {
      toast.error("Failed to remove member", { description: result.error })
      return
    }

    toast.success("Member removed", { description: "They no longer have access to this space." })
    router.refresh()
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
      toast.error("Failed to delete space", { description: result.error })
      return
    }

    toast.success("Space deleted", { description: `${space.name} and all related workspaces were removed.` })
    router.push("/dashboard")
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
    const result = await inviteUserToSpace(space.id, email, inviteRole)
    setIsInviting(false)

    if (result.error) {
      toast.error("Invitation failed", { description: result.error })
      return
    }

    if ("inviteLink" in result && result.inviteLink) {
      setInviteLinkInfo({ link: result.inviteLink, email })
    }
    setInviteEmail("")
    toast.success("Invitation sent", { description: `Sent to ${email}.` })
    router.refresh()
  }

  const handleInvitationAction = async (invitation: { id: string; email: string }, type: "resend" | "revoke") => {
    setInvitationAction({ id: invitation.id, type })
    const result =
      type === "resend" ? await resendInvitation(invitation.id) : await revokeInvitation(invitation.id)

    if (type === "resend" && result && "inviteLink" in result && result.inviteLink) {
      setInviteLinkInfo({ link: result.inviteLink, email: invitation.email })
    }

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

  const formatStatusLabel = (status?: string | null) => {
    const normalized = status?.trim()
    if (!normalized) return "Pending"
    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
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
            <CardTitle>Space Members</CardTitle>
            <CardDescription>Manage who has access to this space</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.profiles?.email}</TableCell>
                    <TableCell>{member.profiles?.full_name || "—"}</TableCell>
                    <TableCell>
                      <Badge>{member.role}</Badge>
                    </TableCell>
                    <TableCell>{new Date(member.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveMember(member.user_id)}
                        disabled={removingMemberId === member.user_id || member.user_id === currentUserId}
                      >
                        <UserMinus className="mr-1 h-4 w-4" />
                        Remove
                      </Button>
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
            <CardTitle>Invite Members</CardTitle>
            <CardDescription>Send invitations to join this space</CardDescription>
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

            {inviteLinkInfo && (
              <div className="rounded-md bg-muted p-4">
                <p className="mb-1 text-sm font-medium">Latest Invitation Link</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  Sent to <span className="font-semibold">{inviteLinkInfo.email}</span>
                </p>
                <code className="block break-all text-xs">{inviteLinkInfo.link}</code>
              </div>
            )}

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
                                disabled={
                                  invitationAction?.id === invite.id && invitationAction?.type === "resend"
                                }
                              >
                                Resend invitation
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleInvitationAction(invite, "revoke")}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
                                disabled={
                                  invitationAction?.id === invite.id && invitationAction?.type === "revoke"
                                }
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
            <p className="text-sm text-muted-foreground">Irreversible actions that affect this space</p>
          </div>
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Delete Space</h4>
                  <p className="text-sm text-muted-foreground">Permanently delete this space and all its data</p>
                </div>
                <AlertDialog onOpenChange={handleDeleteDialogClose}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isDeletingSpace}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Space
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {space.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete all workspaces, documents, and conversations in this space.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {needsConfirmation && (
                      <p className="text-sm text-destructive font-medium">
                        This action cannot be undone.
                      </p>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setNeedsConfirmation(false)} disabled={isDeletingSpace}>
                        Cancel
                      </AlertDialogCancel>
                      {needsConfirmation ? (
                        <AlertDialogAction
                          onClick={handleDeleteSpace}
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={isDeletingSpace}
                        >
                          {isDeletingSpace ? "Deleting..." : "Confirm?"}
                        </AlertDialogAction>
                      ) : (
                        <Button
                          onClick={() => setNeedsConfirmation(true)}
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={isDeletingSpace}
                        >
                          Delete Space
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
