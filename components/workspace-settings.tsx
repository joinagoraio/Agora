"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { inviteUserToSpace } from "@/lib/actions/invitation"
import { deleteWorkspace } from "@/lib/actions/workspace"
import { useRouter } from "next/navigation"
import { Trash2, Send } from "lucide-react"
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

interface WorkspaceSettingsProps {
  workspace: {
    id: string
    name: string
    space_id: string
  }
  space: any
  members: any[]
  invitations: any[]
}

export function WorkspaceSettings({ workspace, space, members, invitations }: WorkspaceSettingsProps) {
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin" | "viewer">("member")
  const [isInviting, setIsInviting] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const router = useRouter()

  const handleDeleteWorkspace = async () => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    
    await deleteWorkspace(workspace.id)
    router.push(`/spaces/${workspace.space_id}`)
  }

  const handleDeleteDialogClose = (open: boolean) => {
    setNeedsConfirmation(false)
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsInviting(true)
    const result = await inviteUserToSpace(space.id, inviteEmail, inviteRole)
    if (result.inviteLink) {
      setInviteLink(result.inviteLink)
    }
    setInviteEmail("")
    setIsInviting(false)
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
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="rounded-md border px-3 py-2"
                >
                  <option value="viewer">Viewer</option>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <Button type="submit" disabled={isInviting}>
                  <Send className="mr-2 h-4 w-4" />
                  Invite
                </Button>
              </div>
            </form>

            {inviteLink && (
              <div className="rounded-md bg-muted p-4">
                <p className="mb-2 text-sm font-medium">Invitation Link:</p>
                <code className="block break-all text-xs">{inviteLink}</code>
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
                          <Badge>{invite.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{new Date(invite.expires_at).toLocaleDateString()}</TableCell>
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
                    <Button variant="destructive">
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
                      <AlertDialogCancel onClick={() => setNeedsConfirmation(false)}>Cancel</AlertDialogCancel>
                      {needsConfirmation ? (
                        <AlertDialogAction onClick={handleDeleteWorkspace} className="bg-destructive text-white hover:bg-destructive/90">
                          Confirm?
                        </AlertDialogAction>
                      ) : (
                        <Button onClick={() => setNeedsConfirmation(true)} className="bg-destructive text-white hover:bg-destructive/90">
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
