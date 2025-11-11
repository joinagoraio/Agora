"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { syncConnector, deleteConnector } from "@/lib/actions/connector"
import { Cloud, MoreVertical, RefreshCw, Trash2, CheckCircle2, XCircle, AlertCircle } from "lucide-react"

interface ConnectorCardProps {
  connector: {
    id: string
    name: string
    type: string
    status: string
    last_sync_at: string | null
  }
  onUpdate: () => void
}

const CONNECTOR_ICONS: Record<string, string> = {
  google_drive: "Google Drive",
  notion: "Notion",
  confluence: "Confluence",
  sharepoint: "SharePoint",
  dropbox: "Dropbox",
}

export function ConnectorCard({ connector, onUpdate }: ConnectorCardProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    await syncConnector(connector.id)
    setIsSyncing(false)
    onUpdate()
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this connector? All associated documents will be removed.")) {
      return
    }
    setIsDeleting(true)
    await deleteConnector(connector.id)
    onUpdate()
  }

  const getStatusIcon = () => {
    switch (connector.status) {
      case "active":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />
      case "inactive":
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />
      default:
        return null
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Cloud className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{connector.name}</CardTitle>
              <CardDescription>{CONNECTOR_ICONS[connector.type] || connector.type}</CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isDeleting}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleSync} disabled={isSyncing}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge variant={connector.status === "active" ? "default" : "secondary"}>{connector.status}</Badge>
          </div>
          {connector.last_sync_at && (
            <p className="text-xs text-muted-foreground">
              Last sync: {new Date(connector.last_sync_at).toLocaleString()}
            </p>
          )}
        </div>
        {isSyncing && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Syncing...</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
