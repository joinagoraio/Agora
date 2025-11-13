"use client"

import Link from "next/link"

import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Layers, Plus } from "lucide-react"

type SpaceWorkspace = {
  id: string
  name: string
  description?: string | null
  created_at: string
}

interface SpaceWorkspaceListProps {
  spaceId: string
  workspaces: SpaceWorkspace[]
  canCreate: boolean
}

export function SpaceWorkspaceList({ spaceId, workspaces, canCreate }: SpaceWorkspaceListProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-foreground">Workspaces using this scope</h3>
          <p className="text-sm text-muted-foreground">
            Each workspace inherits the scope description and any public documents you maintain above.
          </p>
        </div>
        {canCreate && (
          <CreateWorkspaceDialog
            spaceId={spaceId}
            trigger={
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New workspace
              </Button>
            }
          />
        )}
      </div>

      {workspaces.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Layers className="h-10 w-10 text-muted-foreground" />
            <div>
              <h4 className="text-base font-semibold text-foreground">No workspaces yet</h4>
              <p className="text-sm text-muted-foreground">
                Create a workspace to start analysing documents and chatting with the assistant.
              </p>
            </div>
            {canCreate && <CreateWorkspaceDialog spaceId={spaceId} />}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((workspace) => (
            <Card key={workspace.id} className="flex h-full flex-col transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  <Link href={`/workspaces/${workspace.id}`} className="hover:underline">
                    {workspace.name}
                  </Link>
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Created {new Date(workspace.created_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <p className="text-sm text-muted-foreground line-clamp-4">
                  {workspace.description || "No additional description provided yet."}
                </p>
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/workspaces/${workspace.id}`}>Open workspace</Link>
                  </Button>
                  <Badge variant="secondary">Inherits scope</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
